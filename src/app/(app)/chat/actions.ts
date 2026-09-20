'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { deliverSoon } from '@/lib/notify/after'
import { extractMentions, type MentionTarget } from '@/lib/mentions'
import { can, dbFor } from '@/lib/permissions'


export interface ChatState { error?: string; sent?: number; messageId?: string }
export interface Ref { type: 'task' | 'project'; id: string; label: string }

/** Everything a message can @mention: each person, @Executive, and each department. */
async function mentionTargets(): Promise<MentionTarget[]> {
  const supabase = await createClient()
  const [{ data: members }, { data: departments }] = await Promise.all([
    supabase.from('team_members').select('id, full_name, role, department_id').eq('active', true),
    supabase.from('departments').select('id, name'),
  ])
  const people = members ?? []
  return [
    ...people.map((m) => ({ label: m.full_name, ids: [m.id] })),
    { label: 'Executive', ids: people.filter((m) => m.role !== 'member').map((m) => m.id) },
    ...(departments ?? []).map((d) => ({
      label: d.name,
      ids: people.filter((m) => m.department_id === d.id).map((m) => m.id),
    })),
  ]
}

export async function postMessage(_prev: ChatState | undefined, fd: FormData): Promise<ChatState> {
  const me = await requireMember()
  const channelId = String(fd.get('channel_id') ?? '')
  const body = String(fd.get('body') ?? '').trim()
  if (!body) return {}
  if (body.length > 4000) return { error: 'That message is too long (4000 characters max).' }

  const mentions = extractMentions(body, await mentionTargets()).filter((id) => id !== me.id)

  const supabase = await createClient()

  // #task / #project references: keep only ones still typed in the message and that this person can actually see.
  let refs: Ref[] = []
  try {
    const wanted = (JSON.parse(String(fd.get('refs') ?? '[]')) as Ref[])
      .filter((r) => (r.type === 'task' || r.type === 'project') && typeof r.id === 'string' && body.includes(`#${r.label}`))
      .slice(0, 6)
    for (const r of wanted) {
      const { data } = await supabase.from(r.type === 'task' ? 'tasks' : 'projects').select(r.type === 'task' ? 'id, title' : 'id, name').eq('id', r.id).maybeSingle()
      const row = data as { id: string; title?: string; name?: string } | null
      if (row) refs.push({ type: r.type, id: row.id, label: r.label })
    }
  } catch { refs = [] }

  // RLS rejects this if the caller cannot see the channel.
  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({ channel_id: channelId, author_id: me.id, body, mentions, refs })
    .select('id')
    .single()
  if (error) return { error: "You can't post in this channel." }

  deliverSoon()
  revalidatePath(`/chat/${channelId}`)
  return { sent: Date.now(), messageId: inserted.id }
}

export async function deleteMessage(fd: FormData) {
  await requireMember()
  const id = String(fd.get('id') ?? '')
  const channelId = String(fd.get('channel_id') ?? '')
  const supabase = await createClient()
  await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  revalidatePath(`/chat/${channelId}`)
}

export async function markRead(channelId: string) {
  const me = await requireMember()
  const supabase = await createClient()
  await supabase.from('channel_reads').upsert(
    { channel_id: channelId, member_id: me.id, last_read_at: new Date().toISOString() },
    { onConflict: 'channel_id,member_id' },
  )
}

export async function createGroup(_prev: ChatState | undefined, fd: FormData): Promise<ChatState> {
  const me = await requireMember()
  if (!(await can(me, 'create_group_chat'))) return { error: "You don't have permission to start group chats." }
  const name = String(fd.get('name') ?? '').trim()
  if (name.length < 2) return { error: 'Give the group a name.' }

  const members = [...new Set([me.id, ...fd.getAll('members').map(String)])]
  if (members.length < 2) return { error: 'Add at least one other person.' }

  // Generate the id up front: the creator can't read the row back until they are a member.
  const id = randomUUID()
  const supabase = await dbFor(me)
  const { error } = await supabase.from('channels').insert({ id, name, kind: 'group', created_by: me.id })
  if (error) return { error: error.message }
  const { error: mErr } = await supabase
    .from('channel_members').insert(members.map((member_id) => ({ channel_id: id, member_id })))
  if (mErr) return { error: mErr.message }

  revalidatePath('/chat')
  redirect(`/chat/${id}`)
}

/** Suggestions for the "#" picker: tasks and projects this person can see. */
export async function searchRefs(q: string): Promise<Ref[]> {
  await requireMember()
  const term = q.replace(/[%_,()\\*"']/g, ' ').trim().slice(0, 40)
  if (term.length < 1) return []
  const supabase = await createClient()
  const [{ data: tasks }, { data: projects }] = await Promise.all([
    supabase.from('tasks').select('id, title').ilike('title', `%${term}%`).limit(5),
    supabase.from('projects').select('id, name').ilike('name', `%${term}%`).limit(4),
  ])
  return [
    ...(projects ?? []).map((p) => ({ type: 'project' as const, id: p.id, label: p.name })),
    ...(tasks ?? []).map((t) => ({ type: 'task' as const, id: t.id, label: t.title })),
  ]
}

/** Open (or start) a private conversation with one colleague. */
export async function startDm(fd: FormData) {
  await requireMember()
  const other = String(fd.get('member_id') ?? '')
  if (!other) return
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_or_create_dm', { other })
  if (error || !data) return
  redirect(`/chat/${data}`)
}
