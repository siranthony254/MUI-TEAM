'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember } from '@/lib/auth'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'

export interface CollabState { error?: string; ok?: string }

export async function addComment(_prev: CollabState | undefined, fd: FormData): Promise<CollabState> {
  const me = await requireMember()
  const taskId = String(fd.get('task_id') ?? '')
  const body = String(fd.get('body') ?? '').trim()
  if (!body) return { error: 'Write a comment first.' }
  if (body.length > 2000) return { error: 'Comments can be up to 2000 characters.' }

  const supabase = await createClient()
  const { error } = await supabase.from('task_comments').insert({ task_id: taskId, author_id: me.id, body })
  if (error) return { error: 'You can\'t comment on this task.' }
  deliverSoon()
  revalidatePath(`/tasks/${taskId}`)
  return { ok: 'Posted.' }
}

export async function deleteComment(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  const taskId = String(fd.get('task_id') ?? '')
  await supabase.from('task_comments').delete().eq('id', String(fd.get('id') ?? ''))
  revalidatePath(`/tasks/${taskId}`)
}

/** The assignee asks the person who set the task for more time. Only one request can be pending. */
export async function requestExtension(_prev: CollabState | undefined, fd: FormData): Promise<CollabState> {
  const me = await requireMember()
  const taskId = String(fd.get('task_id') ?? '')
  const reason = String(fd.get('reason') ?? '').trim()
  const due = localInputToIso(String(fd.get('requested_due') ?? ''))
  if (reason.length < 3) return { error: 'Say why you need more time.' }
  if (!due) return { error: 'Choose the new deadline you\'re asking for.' }

  const supabase = await createClient()
  const { data: task } = await supabase.from('tasks').select('due_at, assignee_id, status').eq('id', taskId).maybeSingle()
  if (!task || task.assignee_id !== me.id) return { error: 'Only the person holding this task can ask for an extension.' }
  if (task.due_at && new Date(due) <= new Date(task.due_at)) return { error: 'The new deadline must be later than the current one.' }

  const { count } = await supabase.from('extension_requests').select('id', { count: 'exact', head: true }).eq('task_id', taskId).eq('status', 'pending')
  if ((count ?? 0) > 0) return { error: 'You already have a pending request for this task.' }

  const { error } = await supabase.from('extension_requests').insert({ task_id: taskId, requested_by: me.id, reason, requested_due: due })
  if (error) return { error: 'You can\'t request an extension on this task.' }
  deliverSoon()
  revalidatePath(`/tasks/${taskId}`)
  return { ok: 'Request sent. You\'ll be notified when it is answered.' }
}

/** The person who assigned the task (or a system admin) approves or declines. Approving moves the deadline. */
export async function decideExtension(fd: FormData) {
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const approve = fd.get('decision') === 'approve'
  const note = String(fd.get('note') ?? '').trim() || null

  const supabase = await createClient()
  const { data: req } = await supabase.from('extension_requests').select('*').eq('id', id).maybeSingle()
  if (!req || req.status !== 'pending') return

  const { data: updated } = await supabase.from('extension_requests').update({
    status: approve ? 'approved' : 'denied', decided_by: me.id, decided_at: new Date().toISOString(), decision_note: note,
  }).eq('id', id).select('id')
  if (!updated?.length) return      // not this person's to decide (RLS)

  if (approve) await supabase.from('tasks').update({ due_at: req.requested_due }).eq('id', req.task_id)
  deliverSoon()
  revalidatePath(`/tasks/${req.task_id}`)
  revalidatePath('/', 'layout')
}
