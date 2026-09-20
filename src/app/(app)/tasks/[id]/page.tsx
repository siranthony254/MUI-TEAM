import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { allowedTransitions, fmtDue, isOverdue } from '@/lib/tasks'
import type { Task } from '@/lib/types'
import { Card, PageTitle, PriorityLabel, StatusBadge } from '@/components/ui'
import { StatusControls } from './StatusControls'
import { TaskForm } from '../TaskForm'
import { delegateTask } from '../actions'

export const dynamic = 'force-dynamic'

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const task = data as Task

  const [{ data: members }, { data: projects }, { data: children }, { data: activity }] = await Promise.all([
    supabase.from('team_members').select('id, full_name, title').order('full_name'),
    supabase.from('projects').select('id, name').order('name'),
    supabase.from('tasks').select('id, title, status, assignee_id').eq('parent_task_id', id),
    supabase.from('activity_log').select('id, summary, created_at').eq('entity_id', id).order('created_at', { ascending: false }),
  ])

  const nameOf = (mid: string | null) => (members ?? []).find((m) => m.id === mid)?.full_name ?? '—'
  const project = (projects ?? []).find((p) => p.id === task.project_id)
  const canDelegate = isExecOrAbove(me) && task.assignee_id === me.id && !['completed', 'closed'].includes(task.status)
  const transitions = allowedTransitions(task, me)

  return (
    <>
      <Link href="/tasks" className="text-sm text-neutral-500 hover:underline">← My Work</Link>
      <div className="mt-2" />
      <PageTitle>{task.title}</PageTitle>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={task.status} />
          <PriorityLabel priority={task.priority} />
          <span className={`text-sm ${isOverdue(task) ? 'font-medium text-red-600' : 'text-neutral-600'}`}>
            {isOverdue(task) ? 'Overdue · ' : 'Due · '}{fmtDue(task.due_at)}
          </span>
        </div>
        {task.description && <p className="mt-4 whitespace-pre-wrap text-sm">{task.description}</p>}
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-neutral-500">Assigned to</dt><dd className="font-medium">{nameOf(task.assignee_id)}</dd></div>
          <div><dt className="text-neutral-500">Assigned by</dt><dd className="font-medium">{nameOf(task.assigned_by)}</dd></div>
          <div><dt className="text-neutral-500">Project</dt><dd className="font-medium">{project?.name ?? '—'}</dd></div>
        </dl>
        {task.review_note && task.status === 'needs_revision' && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"><strong>Revision requested:</strong> {task.review_note}</p>
        )}
        {task.evidence_note && (
          <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm"><strong>Submission note:</strong> {task.evidence_note}</p>
        )}
      </Card>

      {transitions.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Actions</h2>
          <StatusControls id={task.id} transitions={transitions} />
        </Card>
      )}

      {(children ?? []).length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Delegated from this task</h2>
          <ul className="space-y-1 text-sm">
            {(children ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/tasks/${c.id}`} className="font-medium hover:underline">{c.title}</Link>
                <span className="text-neutral-500"> → {nameOf(c.assignee_id)} · {c.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canDelegate && (
        <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Delegate part of this to someone</summary>
          <div className="mt-4">
            <TaskForm
              action={delegateTask}
              parentId={task.id}
              canAssign
              defaultTitle={task.title}
              members={(members ?? []).filter((m) => m.id !== me.id).map((m) => ({ id: m.id, label: m.title ? `${m.full_name} — ${m.title}` : m.full_name }))}
              projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
              submitLabel="Delegate"
            />
          </div>
        </details>
      )}

      {(activity ?? []).length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Activity</h2>
          <ul className="space-y-1 text-sm text-neutral-700">
            {(activity ?? []).map((a) => (
              <li key={a.id}>{a.summary} <span className="text-xs text-neutral-400">· {fmtDue(a.created_at)}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
