import type { Task, TaskStatus, TeamMember } from '@/lib/types'

export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 } as const

export function isOverdue(t: Pick<Task, 'due_at' | 'status'>, now = Date.now()) {
  return !!t.due_at && new Date(t.due_at).getTime() < now && !['completed', 'closed'].includes(t.status)
}

export function isDueToday(t: Pick<Task, 'due_at' | 'status'>, now = new Date()) {
  if (!t.due_at || ['completed', 'closed'].includes(t.status)) return false
  const d = new Date(t.due_at)
  return d.toDateString() === now.toDateString()
}

export interface Transition {
  to: TaskStatus
  label: string
  needsNote?: boolean
  tone: 'primary' | 'neutral' | 'danger'
}

/**
 * Which status moves the viewer may make. Enforced again in the server action
 * (this is also what the UI renders as buttons).
 *   assignee:  do the work and submit it
 *   assigner / super admin: review it
 * Someone who assigned a task to themselves may close it out directly.
 */
export function allowedTransitions(task: Task, me: TeamMember): Transition[] {
  const isAssignee = task.assignee_id === me.id
  const isReviewer = task.assigned_by === me.id || me.role === 'super_admin'
  const out: Transition[] = []

  if (isAssignee) {
    if (task.status === 'not_started' || task.status === 'needs_revision')
      out.push({ to: 'in_progress', label: 'Start work', tone: 'primary' })
    if (task.status === 'in_progress')
      out.push({
        to: isReviewer ? 'completed' : 'submitted',
        label: isReviewer ? 'Mark complete' : 'Submit for review',
        needsNote: task.requires_evidence,
        tone: 'primary',
      })
  }
  if (isReviewer && !(isAssignee && task.assigned_by === me.id && task.status === 'in_progress')) {
    if (task.status === 'submitted')
      out.push({ to: 'under_review', label: 'Start review', tone: 'neutral' })
    if (task.status === 'submitted' || task.status === 'under_review') {
      out.push({ to: 'completed', label: 'Approve', tone: 'primary' })
      out.push({ to: 'needs_revision', label: 'Request revision', needsNote: true, tone: 'danger' })
    }
    if (task.status === 'completed')
      out.push({ to: 'closed', label: 'Close', tone: 'neutral' })
  }
  return out
}

export function fmtDue(iso: string | null) {
  if (!iso) return 'No due date'
  return new Date(iso).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}
