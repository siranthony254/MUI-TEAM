import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { fmtDay, fmtDateTime, dayKey } from '@/lib/time'
import { fmtDue, isOverdue } from '@/lib/tasks'
import type { ActivityEntry, Meeting, Project, Resource, Task, TeamMember } from '@/lib/types'
import { Card, PageTitle, PriorityLabel, SectionTitle, StatusBadge } from '@/components/ui'
import { AddLinkForm, UploadFileForm } from '../../resources/UploadForms'
import { addProjectMember, removeProjectMember } from '../actions'
import { ProjectEditForm } from './ProjectEditForm'

export const dynamic = 'force-dynamic'

const TABS = ['overview', 'tasks', 'team', 'calendar', 'files', 'discussion', 'activity'] as const
type Tab = (typeof TABS)[number]

const STATUS_STYLE: Record<Project['status'], string> = {
  active: 'bg-green-100 text-green-800', at_risk: 'bg-red-100 text-red-800',
  paused: 'bg-neutral-200 text-neutral-700', done: 'bg-blue-100 text-blue-800',
}

interface Stats { task_count: number; done_count: number; overdue_count: number; total_weight: number; done_weight: number }
interface Load { member_id: string; open_count: number; done_count: number; overdue_count: number }

export default async function ProjectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; person?: string; status?: string; priority?: string; department?: string; due?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'overview'
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const project = data as Project

  const [{ data: statsRows }, { data: loadRows }, { data: memberRows }, { data: pmRows }, { data: departments }, { data: channel }] =
    await Promise.all([
      supabase.rpc('project_stats_all'),
      supabase.rpc('project_member_load', { pid: id }),
      supabase.from('team_members').select('*').eq('active', true).order('full_name'),
      supabase.from('project_members').select('member_id').eq('project_id', id),
      supabase.from('departments').select('id, name'),
      supabase.from('channels').select('id').eq('project_id', id).maybeSingle(),
    ])

  const stats = ((statsRows ?? []) as (Stats & { project_id: string })[]).find((s) => s.project_id === id)
  const pct = stats && stats.total_weight > 0 ? Math.round((stats.done_weight / stats.total_weight) * 100) : null
  const members = (memberRows ?? []) as TeamMember[]
  const nameOf = (mid: string | null) => members.find((m) => m.id === mid)?.full_name ?? '—'
  const load = (loadRows ?? []) as Load[]
  const explicit = new Set((pmRows ?? []).map((r) => r.member_id))
  const teamIds = [...new Set([...(project.owner_id ? [project.owner_id] : []), ...explicit, ...load.map((l) => l.member_id)])]
  const exec = (await can(me, 'create_project')) && (isExecOrAbove(me) || project.owner_id === me.id)

  const tabLink = (t: Tab, label: string) => (
    <Link key={t} href={`/projects/${id}?tab=${t}`}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm capitalize ${
        tab === t ? 'border-[#0D1F35] bg-[#0D1F35] text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>
      {label}
    </Link>
  )

  return (
    <>
      <Link href="/projects" className="text-sm text-neutral-500 hover:underline">← Projects</Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <PageTitle sub={project.description ?? undefined}>{project.name}</PageTitle>
        <span className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[project.status]}`}>{project.status.replace('_', ' ')}</span>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{TABS.map((t) => tabLink(t, t))}</div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Card><p className="text-3xl font-bold text-amber-600">{pct === null ? '—' : `${pct}%`}</p><p className="text-sm text-neutral-600">Progress</p></Card>
            <Card><p className="text-3xl font-bold">{stats?.task_count ?? 0}</p><p className="text-sm text-neutral-600">Tasks</p></Card>
            <Card><p className="text-3xl font-bold text-green-600">{stats?.done_count ?? 0}</p><p className="text-sm text-neutral-600">Completed</p></Card>
            <Card><p className={`text-3xl font-bold ${stats?.overdue_count ? 'text-red-600' : ''}`}>{stats?.overdue_count ?? 0}</p><p className="text-sm text-neutral-600">Overdue</p></Card>
            <Card><p className="text-3xl font-bold">{teamIds.length}</p><p className="text-sm text-neutral-600">Members</p></Card>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
            <div className="h-full bg-amber-500" style={{ width: `${pct ?? 0}%` }} />
          </div>
          <Card className="mt-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-neutral-500">Director</dt><dd className="font-medium">{nameOf(project.owner_id)}</dd></div>
              <div><dt className="text-neutral-500">Department</dt><dd className="font-medium">{(departments ?? []).find((d) => d.id === project.department_id)?.name ?? '—'}</dd></div>
              <div><dt className="text-neutral-500">Starts</dt><dd className="font-medium">{project.start_date ? fmtDay(project.start_date) : '—'}</dd></div>
              <div><dt className="text-neutral-500">Due</dt><dd className="font-medium">{project.due_date ? fmtDay(project.due_date) : '—'}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-neutral-400">Progress is weighted by each task&apos;s weight (default 1), across all of the project&apos;s tasks.</p>
          </Card>
          {exec && (
            <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold">Edit project</summary>
              <div className="mt-4">
                <ProjectEditForm
                  project={project}
                  departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))}
                  people={members.map((m) => ({ id: m.id, label: m.full_name }))}
                />
              </div>
            </details>
          )}
        </>
      )}

      {tab === 'tasks' && await TasksTab({ projectId: id, sp, members, departments: departments ?? [], meId: me.id })}

      {tab === 'team' && (
        <>
          {teamIds.length === 0 ? <Card><p className="text-sm text-neutral-600">No one on this project yet.</p></Card> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {teamIds.map((mid) => {
                const m = members.find((x) => x.id === mid)
                if (!m) return null
                const l = load.find((x) => x.member_id === mid)
                return (
                  <Card key={mid}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/people/${m.id}`} className="font-semibold hover:underline">{m.full_name}</Link>
                        <p className="text-xs text-neutral-500">{m.title ?? ''}{project.owner_id === mid ? ' · Project director' : ''}</p>
                      </div>
                      {exec && explicit.has(mid) && project.owner_id !== mid && (
                        <form action={removeProjectMember}>
                          <input type="hidden" name="project_id" value={id} />
                          <input type="hidden" name="member_id" value={mid} />
                          <button className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
                        </form>
                      )}
                    </div>
                    {m.responsibilities.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-xs text-neutral-600">{m.responsibilities.slice(0, 3).join(' · ')}</p>
                    )}
                    <p className="mt-2 text-xs text-neutral-500">
                      {l?.open_count ?? 0} active · {l?.done_count ?? 0} done
                      {l && l.overdue_count > 0 && <span className="text-red-600"> · {l.overdue_count} overdue</span>}
                    </p>
                  </Card>
                )
              })}
            </div>
          )}
          {exec && (
            <Card className="mt-4">
              <SectionTitle>Add a member</SectionTitle>
              <form action={addProjectMember} className="flex gap-2">
                <input type="hidden" name="project_id" value={id} />
                <select name="member_id" required defaultValue="" className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
                  <option value="" disabled>Choose a person</option>
                  {members.filter((m) => !teamIds.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
                <button className="rounded-lg bg-amber-500 px-4 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">Add</button>
              </form>
            </Card>
          )}
        </>
      )}

      {tab === 'calendar' && await CalendarTab({ project })}

      {tab === 'files' && await FilesTab({ projectId: id, exec, meId: me.id })}

      {tab === 'discussion' && (
        <Card>
          {channel ? (
            <>
              <p className="mb-3 text-sm text-neutral-600">Every project has its own chat channel, open to its director, members and anyone with a task in it.</p>
              <Link href={`/chat/${channel.id}`} className="inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">Open #{project.name}</Link>
            </>
          ) : <p className="text-sm text-neutral-600">No channel for this project yet.</p>}
        </Card>
      )}

      {tab === 'activity' && await ActivityTab({ projectId: id, members })}
    </>
  )
}

async function TasksTab({
  projectId, sp, members, departments, meId,
}: {
  projectId: string
  sp: { person?: string; status?: string; priority?: string; department?: string; due?: string }
  members: TeamMember[]
  departments: { id: string; name: string }[]
  meId: string
}) {
  const supabase = await createClient()
  const { data } = await supabase.from('tasks').select('*').eq('project_id', projectId).order('due_at', { ascending: true, nullsFirst: false })
  const now = Date.now()
  const week = now + 7 * 24 * 60 * 60 * 1000
  const tasks = ((data ?? []) as Task[]).filter((t) =>
    (!sp.person || t.assignee_id === sp.person) &&
    (!sp.status || t.status === sp.status) &&
    (!sp.priority || t.priority === sp.priority) &&
    (!sp.department || t.department_id === sp.department) &&
    (!sp.due || (sp.due === 'overdue' ? isOverdue(t, now) : sp.due === 'week' ? !!t.due_at && new Date(t.due_at).getTime() <= week && !['completed', 'closed'].includes(t.status) : true)),
  )
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? '—'
  const sel = 'rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm'

  return (
    <>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="tasks" />
        <select name="person" defaultValue={sp.person ?? ''} className={sel} aria-label="Person"><option value="">Anyone</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ''} className={sel} aria-label="Status"><option value="">Any status</option>{['not_started', 'in_progress', 'submitted', 'under_review', 'needs_revision', 'completed', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        <select name="priority" defaultValue={sp.priority ?? ''} className={sel} aria-label="Priority"><option value="">Any priority</option>{['urgent', 'high', 'normal', 'low'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select name="department" defaultValue={sp.department ?? ''} className={sel} aria-label="Department"><option value="">Any department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="due" defaultValue={sp.due ?? ''} className={sel} aria-label="Deadline"><option value="">Any deadline</option><option value="overdue">Overdue</option><option value="week">Due this week</option></select>
        <button className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">Filter</button>
      </form>
      <p className="mb-2 text-xs text-neutral-500">Showing the tasks you&apos;re allowed to see{meId ? '' : ''}.</p>
      {tasks.length === 0 ? <Card><p className="text-sm text-neutral-600">No tasks match.</p></Card> : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`}>
              <Card className="flex items-center justify-between gap-3 transition hover:border-amber-400">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className={`text-xs ${isOverdue(t) ? 'text-red-600' : 'text-neutral-500'}`}>{nameOf(t.assignee_id)} · {fmtDue(t.due_at)} · <PriorityLabel priority={t.priority} /></p>
                </div>
                <StatusBadge status={t.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

async function CalendarTab({ project }: { project: Project }) {
  const supabase = await createClient()
  const [{ data: tasks }, { data: meetings }] = await Promise.all([
    supabase.from('tasks').select('id, title, due_at, status').eq('project_id', project.id).not('due_at', 'is', null).not('status', 'in', '(completed,closed)'),
    supabase.from('meetings').select('id, title, starts_at, status').eq('project_id', project.id).neq('status', 'cancelled'),
  ])
  type Row = { at: string; title: string; href: string; kind: string }
  const rows: Row[] = [
    ...((tasks ?? []) as Pick<Task, 'id' | 'title' | 'due_at'>[]).map((t) => ({ at: t.due_at!, title: t.title, href: `/tasks/${t.id}`, kind: 'Task due' })),
    ...((meetings ?? []) as Pick<Meeting, 'id' | 'title' | 'starts_at'>[]).map((m) => ({ at: m.starts_at, title: m.title, href: `/meetings/${m.id}`, kind: 'Meeting' })),
    ...(project.due_date ? [{ at: `${project.due_date}T12:00:00+03:00`, title: `${project.name} due`, href: `/projects/${project.id}`, kind: 'Milestone' }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at))

  if (rows.length === 0) return <Card><p className="text-sm text-neutral-600">Nothing scheduled for this project.</p></Card>
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <Link key={i} href={r.href}>
          <Card className="flex items-center gap-3 py-3 transition hover:border-amber-400">
            <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">{r.kind}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
            <span className="shrink-0 text-xs text-neutral-500">{dayKey(r.at) === dayKey() ? 'Today' : fmtDateTime(r.at)}</span>
          </Card>
        </Link>
      ))}
    </div>
  )
}

async function FilesTab({ projectId, exec, meId }: { projectId: string; exec: boolean; meId: string }) {
  const supabase = await createClient()
  const { data } = await supabase.from('resources').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
  const items = (data ?? []) as Resource[]
  return (
    <>
      {items.length === 0 ? <Card><p className="text-sm text-neutral-600">No files for this project yet.</p></Card> : (
        <div className="space-y-2">
          {items.map((r) => (
            <Card key={r.id}>
              <a href={`/resources/${r.id}/download`} {...(r.kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="font-medium hover:underline">{r.title}</a>
              {r.description && <p className="text-sm text-neutral-600">{r.description}</p>}
              <p className="mt-1 text-xs text-neutral-500">{r.category} · {fmtDay(r.created_at)}{r.uploaded_by === meId ? ' · you' : ''}</p>
            </Card>
          ))}
        </div>
      )}
      {exec && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card><h2 className="mb-3 font-semibold">Upload a file</h2><UploadFileForm projectId={projectId} /></Card>
          <Card><h2 className="mb-3 font-semibold">Or add a link</h2><AddLinkForm projectId={projectId} /></Card>
        </div>
      )}
    </>
  )
}

async function ActivityTab({ projectId, members }: { projectId: string; members: TeamMember[] }) {
  const supabase = await createClient()
  const { data } = await supabase.from('activity_log').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
  const rows = (data ?? []) as ActivityEntry[]
  if (rows.length === 0) return <Card><p className="text-sm text-neutral-600">No activity recorded yet.</p></Card>
  return (
    <Card>
      <ul className="space-y-2 text-sm">
        {rows.map((a) => (
          <li key={a.id}>
            {a.summary}
            <span className="ml-1 text-xs text-neutral-400">· {members.find((m) => m.id === a.actor_id)?.full_name ?? 'System'} · {fmtDateTime(a.created_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
