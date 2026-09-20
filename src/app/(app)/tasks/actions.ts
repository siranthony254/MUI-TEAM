'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { allowedTransitions } from '@/lib/tasks'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'
import type { Task, TaskStatus } from '@/lib/types'

export interface FormState { error?: string; id?: string; ok?: string }

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const RECURRENCE = ['none', 'daily', 'weekly', 'monthly']
const CHANNELS = ['email', 'push', 'sms']

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null

/** Channels the sender picked for the assignment notice; in-app is always on. Null = recipient defaults. */
function channelsFrom(fd: FormData): string[] | null {
  const picked = fd.getAll('channels').map(String).filter((c) => CHANNELS.includes(c))
  return fd.has('channels_present') ? picked : null
}

function parseTaskForm(fd: FormData, canSetTerms: boolean) {
  const priority = String(fd.get('priority') ?? 'normal')
  const recurrence = String(fd.get('recurrence') ?? 'none')
  const weight = Math.round(Number(fd.get('weight') ?? 1))
  const tags = String(fd.get('tags') ?? '')
    .split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean).slice(0, 8)

  return {
    title: String(fd.get('title') ?? '').trim(),
    description: text(fd, 'description'),
    project_id: text(fd, 'project_id'),
    department_id: text(fd, 'department_id'),
    assignee_id: text(fd, 'assignee_id'),
    priority: PRIORITIES.includes(priority) ? priority : 'normal',
    start_date: text(fd, 'start_date'),
    due_at: localInputToIso(String(fd.get('due_at') ?? '')),
    requires_evidence: fd.get('requires_evidence') === 'on',
    // Only people who set terms for others may change these; everyone else gets safe defaults.
    require_approval: canSetTerms ? fd.get('require_approval') === 'on' : true,
    weight: canSetTerms && weight >= 1 && weight <= 100 ? weight : 1,
    tags,
    recurrence: RECURRENCE.includes(recurrence) ? recurrence : 'none',
    recurrence_until: text(fd, 'recurrence_until'),
  }
}

export async function createTask(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const me = await requireMember()
  const exec = isExecOrAbove(me)
  const t = parseTaskForm(fd, exec)
  if (t.title.length < 3) return { error: 'Give the task a title (at least 3 characters).' }
  if (t.start_date && t.due_at && new Date(`${t.start_date}T00:00:00+03:00`) > new Date(t.due_at)) {
    return { error: 'The start date is after the deadline.' }
  }
  if (t.recurrence !== 'none' && !t.due_at) return { error: 'A recurring task needs a deadline to repeat from.' }

  // Team members can only create work for themselves; RLS enforces this too.
  const assignee = exec ? (t.assignee_id ?? me.id) : me.id
  // Self-assigned work has no separate reviewer, so approval would be meaningless.
  const requireApproval = assignee === me.id ? false : t.require_approval

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...t,
      require_approval: requireApproval,
      assignee_id: assignee,
      assigned_by: me.id,
      assign_channels: exec ? channelsFrom(fd) : null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  deliverSoon()
  revalidatePath('/', 'layout')
  // The client uploads any attachments, then navigates: a task must exist before files can attach to it.
  return { id: data.id }
}

/**
 * Hand a task on. Two cases, both recorded on the task:
 *  - the current assignee (an executive) DELEGATES it: the original assignee and the delegator are kept;
 *  - the person who assigned it (or a super admin) REASSIGNS it.
 */
export async function reassignTask(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const me = await requireMember()
  const id = String(fd.get('task_id') ?? '')
  const to = text(fd, 'assignee_id')
  if (!id || !to) return { error: 'Choose who to give this task to.' }

  const supabase = await createClient()
  const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
  const task = data as Task | null
  if (!task) return { error: 'Task not found.' }
  if (!['not_started', 'in_progress', 'needs_revision'].includes(task.status)) {
    return { error: 'Only work that hasn\'t been submitted or finished can be handed on.' }
  }
  if (to === task.assignee_id) return { error: 'They already have this task.' }

  if (!isExecOrAbove(me)) return { error: 'Only executives can assign work to someone else.' }
  const isReviewer = task.assigned_by === me.id || me.role === 'super_admin'
  const delegating = task.assignee_id === me.id
  if (!isReviewer && !delegating) return { error: 'You can\'t hand this task on.' }

  const due = localInputToIso(String(fd.get('due_at') ?? ''))
  const patch: Record<string, unknown> = { assignee_id: to, assign_channels: channelsFrom(fd) }
  if (due) patch.due_at = due
  if (delegating) {
    patch.original_assignee_id = task.original_assignee_id ?? task.assignee_id
    patch.delegated_by = me.id
    patch.delegated_at = new Date().toISOString()
    patch.delegation_note = text(fd, 'note')
  }
  const { data: updated, error } = await supabase.from('tasks').update(patch).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: 'You can\'t hand this task on.' }

  deliverSoon()
  revalidatePath('/', 'layout')
  return { ok: delegating ? 'Delegated. The chain stays visible on the task.' : 'Reassigned.' }
}

export async function changeStatus(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const me = await requireMember()
  const id = String(formData.get('id') ?? '')
  const to = String(formData.get('to') ?? '') as TaskStatus
  const note = String(formData.get('note') ?? '').trim()

  const supabase = await createClient()
  const { data: task } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
  if (!task) return { error: 'Task not found.' }

  const transition = allowedTransitions(task as Task, me).find((x) => x.to === to)
  if (!transition) return { error: 'You can\'t make that change to this task.' }
  if (transition.needsNote && !note) {
    return { error: to === 'needs_revision' ? 'Say what needs to change.' : 'Add a note describing your evidence.' }
  }

  const patch: Record<string, unknown> = { status: to }
  if (to === 'submitted' || (to === 'completed' && task.assignee_id === me.id)) {
    patch.submitted_at = new Date().toISOString()
    if (note) patch.evidence_note = note
  }
  if (to === 'completed') patch.completed_at = new Date().toISOString()
  if (to === 'needs_revision') patch.review_note = note

  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) return { error: error.message }

  deliverSoon()
  revalidatePath('/', 'layout')
  return {}
}
