'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { allowedTransitions } from '@/lib/tasks'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'
import type { Task, TaskStatus } from '@/lib/types'

export interface FormState { error?: string }

const PRIORITIES = ['low', 'normal', 'high', 'urgent']

function parseTaskForm(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const due = String(formData.get('due_at') ?? '')
  const priority = String(formData.get('priority') ?? 'normal')
  return {
    title,
    description: String(formData.get('description') ?? '').trim() || null,
    project_id: String(formData.get('project_id') ?? '') || null,
    assignee_id: String(formData.get('assignee_id') ?? '') || null,
    priority: PRIORITIES.includes(priority) ? priority : 'normal',
    due_at: localInputToIso(due),
    requires_evidence: formData.get('requires_evidence') === 'on',
  }
}

export async function createTask(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const me = await requireMember()
  const t = parseTaskForm(formData)
  if (t.title.length < 3) return { error: 'Give the task a title (at least 3 characters).' }

  // Team members can only create work for themselves; RLS enforces this too.
  const assignee = isExecOrAbove(me) ? (t.assignee_id ?? me.id) : me.id

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...t, assignee_id: assignee, assigned_by: me.id })
    .select('id')
    .single()
  if (error) return { error: error.message }

  deliverSoon()
  revalidatePath('/', 'layout')
  redirect(`/tasks/${data.id}`)
}

/** Delegate a task you hold to someone else, preserving the chain. */
export async function delegateTask(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can delegate.' }

  const parentId = String(formData.get('parent_id') ?? '')
  const t = parseTaskForm(formData)
  if (!parentId || !t.assignee_id) return { error: 'Choose who to delegate to.' }
  if (t.title.length < 3) return { error: 'Give the delegated task a title.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...t, parent_task_id: parentId, assigned_by: me.id })
    .select('id')
    .single()
  if (error) return { error: error.message }

  deliverSoon()
  revalidatePath('/', 'layout')
  redirect(`/tasks/${data.id}`)
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
