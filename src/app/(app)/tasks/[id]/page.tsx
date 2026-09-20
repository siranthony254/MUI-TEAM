import Link from 'next/link'
import { ArrowRight, Repeat } from 'lucide-react'
import { notFound } from 'next/navigation'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { allowedTransitions, fmtDue, isOverdue } from '@/lib/tasks'
import { fmtDay, fmtDateTime } from '@/lib/time'
import type { ActivityEntry, Task } from '@/lib/types'
import { Card, PageTitle, PriorityLabel, SectionTitle, StatusBadge } from '@/components/ui'
import { AttachmentsPanel } from '@/components/attachments/AttachmentsPanel'
import { StatusControls } from './StatusControls'
import { HandOnForm } from '../HandOnForm'

export const dynamic = 'force-dynamic'

export default async function TaskPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ upload_failed?: string }> }) {
  const { id } = await params
  const { upload_failed } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const task = data as Task

  const [{ data: members }, { data: projects }, { data: departments }, { data: meeting }, { data: activity }] = await Promise.all([
    supabase.from('team_members').select('id, full_name, title').order('full_name'),
    supabase.from('projects').select('id, name'),
    supabase.from('departments').select('id, name'),
    task.meeting_id ? supabase.from('meetings').select('id, title').eq('id', task.meeting_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('activity_log').select('*').eq('entity_type', 'task').eq('entity_id', id).order('created_at', { ascending: false }),
  ])

  const nameOf = (mid: string | null) => (members ?? []).find((m) => m.id === mid)?.full_name ?? '—'
  const project = (projects ?? []).find((p) => p.id === task.project_id)
  const department = (departments ?? []).find((d) => d.id === task.department_id)
  const transitions = allowedTransitions(task, me)

  const isReviewer = task.assigned_by === me.id || me.role === 'super_admin'
  const openForHandOn = ['not_started', 'in_progress', 'needs_revision'].includes(task.status)
  const delegating = task.assignee_id === me.id && isExecOrAbove(me)
  const canHandOn = openForHandOn && isExecOrAbove(me) && (delegating || isReviewer)
  const canAttach = isReviewer || task.assignee_id === me.id
  const delegated = !!task.delegated_by

  return (
    <>
      <Link href="/tasks" className="text-sm text-neutral-500 hover:underline">← My Work</Link>
      <div className="mt-2" />
      <PageTitle>{task.title}</PageTitle>

      {upload_failed && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          The task was created, but these files didn&apos;t upload: {upload_failed}. You can attach them below.
        </p>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={task.status} />
          <PriorityLabel priority={task.priority} />
          <span className={`text-sm ${isOverdue(task) ? 'font-medium text-red-600' : 'text-neutral-600'}`}>
            {isOverdue(task) ? 'Overdue · ' : 'Due · '}{fmtDue(task.due_at)}
          </span>
          {task.recurrence !== 'none' && (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500"><Repeat size={12} aria-hidden /> Repeats {task.recurrence}</span>
          )}
        </div>

        {delegated && (
          <p className="mt-3 flex flex-wrap items-center gap-1 rounded-lg bg-purple-50 p-3 text-sm text-purple-900">
            <strong>Delegated:</strong> {nameOf(task.original_assignee_id)} <ArrowRight size={14} aria-hidden /> {nameOf(task.assignee_id)}
            <span className="text-purple-700">· by {nameOf(task.delegated_by)}, {fmtDay(task.delegated_at)}</span>
          </p>
        )}
        {task.delegation_note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm"><strong>Instructions:</strong> {task.delegation_note}</p>}

        {task.description && <p className="mt-4 whitespace-pre-wrap text-sm">{task.description}</p>}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-neutral-500">Assigned to</dt><dd className="font-medium">{nameOf(task.assignee_id)}</dd></div>
          <div><dt className="text-neutral-500">Assigned by</dt><dd className="font-medium">{nameOf(task.assigned_by)}</dd></div>
          <div><dt className="text-neutral-500">Project</dt><dd className="font-medium">{project ? <Link href={`/projects/${project.id}`} className="hover:underline">{project.name}</Link> : '—'}</dd></div>
          <div><dt className="text-neutral-500">Department</dt><dd className="font-medium">{department?.name ?? '—'}</dd></div>
          <div><dt className="text-neutral-500">Starts</dt><dd className="font-medium">{task.start_date ? fmtDay(task.start_date) : '—'}</dd></div>
          <div><dt className="text-neutral-500">Sign-off</dt><dd className="font-medium">{task.require_approval ? 'Needs approval' : 'No approval needed'}</dd></div>
          {task.weight > 1 && <div><dt className="text-neutral-500">Weight in project</dt><dd className="font-medium">{task.weight}</dd></div>}
          {meeting && <div><dt className="text-neutral-500">From meeting</dt><dd className="font-medium"><Link href={`/meetings/${meeting.id}`} className="hover:underline">{meeting.title}</Link></dd></div>}
        </dl>

        {task.tags.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-1">
            {task.tags.map((t) => <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">#{t}</span>)}
          </p>
        )}
        {task.review_note && task.status === 'needs_revision' && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"><strong>Revision requested:</strong> {task.review_note}</p>
        )}
        {task.evidence_note && (
          <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm"><strong>Submission note:</strong> {task.evidence_note}</p>
        )}
      </Card>

      {transitions.length > 0 && (
        <Card className="mt-4">
          <SectionTitle>Actions</SectionTitle>
          <StatusControls id={task.id} transitions={transitions} />
        </Card>
      )}

      <Card className="mt-4">
        <SectionTitle>Attachments</SectionTitle>
        <AttachmentsPanel type="task" entityId={task.id} canAdd={canAttach} viewerId={me.id} isSuperAdmin={me.role === 'super_admin'} />
      </Card>

      {canHandOn && (
        <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">{delegating ? 'Delegate this task' : 'Reassign this task'}</summary>
          <div className="mt-4">
            <HandOnForm
              taskId={task.id}
              currentTitle={task.title}
              delegating={delegating}
              people={(members ?? []).filter((m) => m.id !== task.assignee_id).map((m) => ({ id: m.id, label: m.title ? `${m.full_name} — ${m.title}` : m.full_name }))}
            />
          </div>
        </details>
      )}

      {(activity ?? []).length > 0 && (
        <Card className="mt-4">
          <SectionTitle>Activity</SectionTitle>
          <ul className="space-y-2 text-sm text-neutral-700">
            {((activity ?? []) as ActivityEntry[]).map((a) => (
              <li key={a.id}>
                {a.summary}
                {a.field && a.from_value !== null && a.to_value !== null && a.field !== 'due_at' && (
                  <span className="ml-1 text-xs text-neutral-400">({a.from_value.replace(/_/g, ' ')} → {a.to_value.replace(/_/g, ' ')})</span>
                )}
                <span className="ml-1 text-xs text-neutral-400">· {fmtDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
