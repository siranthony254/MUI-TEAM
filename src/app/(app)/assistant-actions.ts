'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember } from '@/lib/auth'
import { assistantEnabled, askGemini, type ChatTurn } from '@/lib/assistant/gemini'
import { MUI_MANUAL } from '@/lib/assistant/prompt'
import { buildPersonContext } from '@/lib/assistant/context'
import { claimAssistantUse } from '@/lib/assistant/limits'

export interface AskResult { reply?: string; error?: string }

/** One turn of a conversation with Ask MUI. history is the conversation so far, oldest first. */
export async function askAssistant(message: string, history: ChatTurn[]): Promise<AskResult> {
  const me = await requireMember()
  if (!assistantEnabled()) return { error: "Ask MUI isn't set up yet — an admin needs to add an API key." }
  const trimmed = message.trim()
  if (!trimmed) return { error: 'Type a question first.' }
  if (trimmed.length > 2000) return { error: 'Keep it under 2000 characters.' }

  const limit = await claimAssistantUse(me.id)
  if (!limit.ok) return { error: limit.reason }

  const supabase = await createClient()
  const personContext = await buildPersonContext(supabase, me)
  const system = `${MUI_MANUAL}\n\n${personContext}`

  try {
    const reply = await askGemini(system, [...history.slice(-12), { role: 'user', text: trimmed }])
    return { reply }
  } catch (err) {
    console.error('[assistant] askGemini failed:', err)
    return { error: "Couldn't reach the assistant just now — try again in a moment." }
  }
}

/** "This wasn't helpful" — queues the question for a director to answer, which is how the assistant learns. */
export async function flagUnanswered(question: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireMember()
  const q = question.trim().slice(0, 500)
  if (!q) return { error: 'Nothing to flag.' }
  const supabase = await createClient()
  const { error } = await supabase.from('assistant_questions').insert({
    asked_by: me.id, department_id: me.department_id, question: q,
  })
  if (error) return { error: error.message }
  return { ok: true }
}

export interface KnowledgeState { error?: string; ok?: string }

export async function saveKnowledge(_prev: KnowledgeState | undefined, fd: FormData): Promise<KnowledgeState> {
  const me = await requireMember()
  const id = String(fd.get('id') ?? '') || null
  const departmentId = String(fd.get('department_id') ?? '') || null
  const topic = String(fd.get('topic') ?? '').trim()
  const answer = String(fd.get('answer') ?? '').trim()
  if (topic.length < 3 || answer.length < 3) return { error: 'Fill in both the topic and the answer.' }

  const supabase = await createClient()
  const patch = { department_id: departmentId, topic, answer, created_by: me.id, updated_at: new Date().toISOString() }
  const { error } = id
    ? await supabase.from('assistant_knowledge').update(patch).eq('id', id)
    : await supabase.from('assistant_knowledge').insert(patch)
  if (error) return { error: "Couldn't save that — you may not have access to edit this department's knowledge." }
  revalidatePath('/admin/assistant')
  return { ok: 'Saved. Ask MUI will use this from now on.' }
}

export async function deleteKnowledge(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  await supabase.from('assistant_knowledge').delete().eq('id', String(fd.get('id') ?? ''))
  revalidatePath('/admin/assistant')
}

export async function resolveQuestion(_prev: KnowledgeState | undefined, fd: FormData): Promise<KnowledgeState> {
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const answer = String(fd.get('answer') ?? '').trim()
  const addToKnowledge = fd.get('add_to_knowledge') === 'on'
  if (answer.length < 3) return { error: 'Write an answer first.' }

  const supabase = await createClient()
  const { data: q, error } = await supabase.from('assistant_questions')
    .update({ resolved_at: new Date().toISOString(), resolved_by: me.id, answer })
    .eq('id', id).select('question, department_id').maybeSingle()
  if (error || !q) return { error: "Couldn't save that answer." }

  if (addToKnowledge) {
    await supabase.from('assistant_knowledge').insert({
      department_id: q.department_id, topic: q.question, answer, created_by: me.id,
    })
  }
  revalidatePath('/admin/assistant')
  return { ok: 'Answered.' }
}
