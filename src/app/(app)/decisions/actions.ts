'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'

export interface DecisionState { error?: string; ok?: string }

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null

export async function createDecision(_prev: DecisionState | undefined, fd: FormData): Promise<DecisionState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can record decisions.' }
  const title = text(fd, 'title')
  const decision = text(fd, 'decision')
  if (!title || !decision) return { error: 'A decision needs a title and the decision itself.' }

  const supabase = await createClient()
  const { error } = await supabase.from('decisions').insert({
    title, decision,
    rationale: text(fd, 'rationale'),
    decided_by: text(fd, 'decided_by') ?? 'Executive Team',
    decided_on: text(fd, 'decided_on') ?? undefined,
    implementation_owner_id: text(fd, 'implementation_owner_id'),
    project_id: text(fd, 'project_id'),
    created_by: me.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/decisions')
  return { ok: 'Decision recorded.' }
}

/** Decisions are never deleted: they are superseded or reversed, so the history stays. */
export async function setDecisionStatus(fd: FormData) {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return

  const id = String(fd.get('id') ?? '')
  const status = String(fd.get('status') ?? '')
  if (!['active', 'superseded', 'reversed'].includes(status)) return
  const supersededBy = status === 'superseded' ? text(fd, 'superseded_by') : null

  const supabase = await createClient()
  await supabase.from('decisions').update({ status, superseded_by: supersededBy }).eq('id', id)
  revalidatePath('/decisions')
}
