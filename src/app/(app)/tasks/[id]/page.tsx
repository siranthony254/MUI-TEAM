import Link from 'next/link'
import { ArrowRight, Repeat, MessageSquare, Zap, Paperclip, Clock, Activity } from 'lucide-react'
import { notFound } from 'next/navigation'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { allowedTransitions, fmtDue, isOverdue } from '@/lib/tasks'
import { fmtDay, fmtDateTime } from '@/lib/time'
import type { ActivityEntry, ExtensionRequest, Task, TaskComment } from '@/lib/types'
import { Card, PageTitle, PriorityLabel, SectionTitle, StatusBadge, EmptyState} from '@/components/ui'
import { AttachmentsPanel } from '@/components/attachments/AttachmentsPanel'
import { StatusControls } from './StatusControls'
import { HandOnForm } from '../HandOnForm'
import { CommentForm, ExtensionForm } from './CollabPanels'
import { decideExtension, deleteComment } from '../collab-actions'
import { deleteTask } from '../../manage-actions'
import { TaskEditForm } from '../../ManageForms'
import { ConfirmButton, ManagePanel } from '@/components/ConfirmButton'

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

  const [{ data: members }, { data: projects }, { data: departments }, { data: meeting }, { data: activity }, { data: commentRows }, { data: extRows }] = await Promise.all([
    supabase.from('team_members').select('id, full_name, title, department_id').order('full_name'),
    supabase.from('projects').select('id, name'),
    supabase.from('departments').select('id, name'),
    task.meeting_id ? supabase.from('meetings').select('id, title').eq('id', task.meeting_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('activity_log').select('*').eq('entity_type', 'task').eq('entity_id', id).order('created_at', { ascending: false }),
    supabase.from('task_comments').select('*').eq('task_id', id).order('created_at'),
    supabase.from('extension_requests').select('*').eq('task_id', id).order('created_at', { ascending: false }),
  ])

  const nameOf = (mid: string | null) => (members ?? []).find((m) => m.id === mid)?.full_name ?? '—'
  const project = (projects ?? []).find((p) => p.id === task.project_id)
  const department = (departments ?? []).find((d) => d.id === task.department_id)
  const transitions = allowedTransitions(task, me)

  const isReviewer = task.assigned_by === me.id || me.role === 'super_admin'
  const openForHandOn = ['not_started', 'in_progress', 'needs_revision'].includes(task.status)
  const delegating = task.assignee_id === me.id
  const canHandOn = openForHandOn && (delegating || isReviewer) && (await can(me, delegating ? 'delegate_tasks' : 'assign_tasks'))
  const canAttach = isReviewer || task.assignee_id === me.id
  const delegated = !!task.delegated_by
  const comments = (commentRows ?? []) as TaskComment[]
  const extensions = (extRows ?? []) as ExtensionRequest[]
  const pendingExt = extensions.find((e) => e.status === 'pending')
  const canRequestExt = task.assignee_id === me.id && !['completed', 'closed', 'submitted', 'under_review'].includes(task.status) && !pendingExt

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
        {task.status === 'blocked' && (
          <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900"><strong>Blocked:</strong> {task.blocked_reason ?? 'No reason given.'}</p>
        )}
        {task.review_note && task.status === 'needs_revision' && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"><strong>Revision requested:</strong> {task.review_note}</p>
        )}
        {task.evidence_note && (
          <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm"><strong>Submission note:</strong> {task.evidence_note}</p>
        )}
      </Card>

      {isReviewer && (
        <div className="mt-4">
          <ManagePanel label="Edit task details">
            <TaskEditForm
              task={task}
              projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
              departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))}
            />
            <form action={deleteTask} className="mt-4 border-t border-neutral-200 pt-3">
              <input type="hidden" name="id" value={task.id} />
              <ConfirmButton message="Delete this task for good, with its comments and attachments?" className="text-sm font-medium text-red-600 hover:underline">Delete this task</ConfirmButton>
            </form>
          </ManagePanel>
        </div>
      )}

      {transitions.length > 0 && (
        <Card className="mt-4">
          <SectionTitle icon={Zap}>Actions</SectionTitle>
          <StatusControls id={task.id} transitions={transitions} />
        </Card>
      )}

      <Card className="mt-4">
        <SectionTitle icon={Paperclip}>Attachments</SectionTitle>
        <AttachmentsPanel type="task" entityId={task.id} canAdd={canAttach} viewerId={me.id} isSuperAdmin={me.role === 'super_admin'} />
      </Card>

      <Card className="mt-4">
        <SectionTitle icon={MessageSquare}>Comments ({comments.length})</SectionTitle>
        {comments.length === 0 ? <EmptyState icon={MessageSquare} label="No comments yet." /> : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="text-sm">
                <p className="text-xs"><span className="font-semibold text-neutral-800">{nameOf(c.author_id)}</span><span className="ml-2 text-neutral-400">{fmtDateTime(c.created_at)}</span></p>
                <p className="whitespace-pre-wrap">{c.body}</p>
                {(c.author_id === me.id || me.role === 'super_admin') && (
                  <form action={deleteComment}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="task_id" value={task.id} /><ConfirmButton message="Delete this comment?">Delete</ConfirmButton></form>
                )}
              </li>
            ))}
          </ul>
        )}
        <CommentForm taskId={task.id} />
      </Card>

      {(pendingExt || extensions.length > 0 || canRequestExt) && (
        <Card className="mt-4">
          <SectionTitle icon={Clock}>Deadline extension</SectionTitle>
          {pendingExt && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              <p><strong>{nameOf(pendingExt.requested_by)}</strong> asked to move the deadline to <strong>{fmtDateTime(pendingExt.requested_due)}</strong>.</p>
              <p className="mt-1 whitespace-pre-wrap">{pendingExt.reason}</p>
              {isReviewer && (
                <form action={decideExtension} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={pendingExt.id} />
                  <input name="note" placeholder="Optional note to them" className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button name="decision" value="approve" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">Approve</button>
                    <button name="decision" value="deny" className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-neutral-50">Decline</button>
                  </div>
                </form>
              )}
              {!isReviewer && <p className="mt-2 text-xs text-amber-800">Waiting for {nameOf(task.assigned_by)} to answer.</p>}
            </div>
          )}
          {canRequestExt && <div className={extensions.length ? 'mb-4' : ''}><ExtensionForm taskId={task.id} /></div>}
          {extensions.filter((e) => e.status !== 'pending').length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-neutral-600">
              {extensions.filter((e) => e.status !== 'pending').map((e) => (
                <li key={e.id}>{fmtDateTime(e.created_at)} · to {fmtDateTime(e.requested_due)} · <strong className={e.status === 'approved' ? 'text-green-700' : 'text-red-700'}>{e.status}</strong>{e.decision_note ? ` — ${e.decision_note}` : ''}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {canHandOn && (
        <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">{delegating ? 'Delegate this task' : 'Reassign this task'}</summary>
          <div className="mt-4">
            <HandOnForm
              taskId={task.id}
              currentTitle={task.title}
              delegating={delegating}
              people={(members ?? []).filter((m) => m.id !== task.assignee_id && (isExecOrAbove(me) || (m.department_id && (me.directed_departments ?? []).includes(m.department_id)))).map((m) => ({ id: m.id, label: m.title ? `${m.full_name} — ${m.title}` : m.full_name }))}
            />
          </div>
        </details>
      )}

      {(activity ?? []).length > 0 && (
        <Card className="mt-4">
          <SectionTitle icon={Activity}>Activity</SectionTitle>
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
