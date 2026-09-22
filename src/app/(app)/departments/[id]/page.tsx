import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember, isExecOrAbove, hasOrgView } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { fmtDue, isOverdue } from '@/lib/tasks'
import { monthRange } from '@/lib/time'
import { ROLE_LABEL, type Project, type Report, type Task, type TeamMember } from '@/lib/types'
import { Card, PageTitle, SectionTitle, StatusBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface Load { member_id: string; open_count: number; overdue_count: number; done_30d: number }
interface Stat { department_id: string; member_count: number; open_count: number; overdue_count: number; done_30d: number }

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data: dept } = await supabase.from('departments').select('id, name, description, director_id').eq('id', id).maybeSingle()
  if (!dept) notFound()

  const month = monthRange()
  const [{ data: memberRows }, { data: loadRows }, { data: statRows }, { data: projectRows }, { data: channel }, { data: reportRows }] = await Promise.all([
    supabase.from('team_members').select('*').eq('department_id', id).eq('active', true).order('full_name'),
    supabase.rpc('department_member_load', { did: id }),
    supabase.rpc('department_stats_all'),
    supabase.from('projects').select('id, name, status, due_date').eq('department_id', id).neq('status', 'done'),
    supabase.from('channels').select('id').eq('department_id', id).eq('kind', 'department').maybeSingle(),
    supabase.from('reports').select('id, status, author_id, kind').eq('department_id', id).eq('kind', 'department').gte('period_start', month.start).lte('period_start', month.end),
  ])

  const members = (memberRows ?? []) as TeamMember[]
  const load = (loadRows ?? []) as Load[]
  const stat = ((statRows ?? []) as Stat[]).find((s) => s.department_id === id)
  const director = dept.director_id ? members.find((m) => m.id === dept.director_id) ?? null : null
  const { data: directorRow } = !director && dept.director_id
    ? await supabase.from('team_members').select('full_name').eq('id', dept.director_id).maybeSingle()
    : { data: null }
  const directorName = director?.full_name ?? directorRow?.full_name

  // The person may see per-member workload only if they lead, run, or oversee this department.
  const detailed = load.length > 0 || hasOrgView(me) || isExecOrAbove(me) || dept.director_id === me.id
  const isDirector = dept.director_id === me.id

  const memberIds = members.map((m) => m.id)
  const { data: taskRows } = memberIds.length && detailed
    ? await supabase.from('tasks').select('*').in('assignee_id', memberIds).not('status', 'in', '(completed,closed)').order('due_at', { ascending: true, nullsFirst: false }).limit(25)
    : { data: [] as Task[] }
  const tasks = (taskRows ?? []) as Task[]
  const nameOf = (mid: string | null) => members.find((m) => m.id === mid)?.full_name ?? '—'
  const loadOf = (mid: string) => load.find((l) => l.member_id === mid)
  const deptReport = ((reportRows ?? []) as Pick<Report, 'id' | 'status' | 'author_id'>[]).find((r) => r.status === 'submitted') ?? (reportRows ?? [])[0]
  const canAssign = await can(me, 'assign_tasks')

  return (
    <>
      <Link href="/departments" className="text-sm text-neutral-500 hover:underline">← Departments</Link>
      <div className="mt-2" />
      <PageTitle sub={dept.description ?? undefined}>{dept.name}</PageTitle>
      <p className="-mt-3 mb-5 text-sm text-neutral-600">
        {directorName ? <>Director: <strong>{directorName}</strong></> : 'No director assigned yet.'}
        {isDirector && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">You lead this department</span>}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><p className="text-3xl font-bold">{stat?.member_count ?? members.length}</p><p className="text-sm text-neutral-600">Members</p></Card>
        <Card><p className="text-3xl font-bold">{stat?.open_count ?? 0}</p><p className="text-sm text-neutral-600">Active tasks</p></Card>
        <Card><p className={`text-3xl font-bold ${stat?.overdue_count ? 'text-red-600' : 'text-green-600'}`}>{stat?.overdue_count ?? 0}</p><p className="text-sm text-neutral-600">Overdue</p></Card>
        <Card><p className="text-3xl font-bold text-green-600">{stat?.done_30d ?? 0}</p><p className="text-sm text-neutral-600">Done (30 days)</p></Card>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {channel && <Link href={`/chat/${channel.id}`} className="font-medium text-amber-700 hover:underline">Department chat →</Link>}
        {(isDirector || isExecOrAbove(me)) && canAssign && <Link href="/tasks/new" className="font-medium text-amber-700 hover:underline">Assign a task →</Link>}
        {(isDirector || hasOrgView(me)) && <Link href="/reports" className="font-medium text-amber-700 hover:underline">Reports →</Link>}
        {(isDirector || me.role === 'super_admin' || me.is_director) && (
          <Link href={`/admin/departments/${dept.id}/template`} className="font-medium text-amber-700 hover:underline">Edit report template →</Link>
        )}
      </div>

      {detailed && (
        <p className="mt-3 text-sm text-neutral-600">
          {month.label} report: {deptReport ? <strong>{deptReport.status}</strong> : <span className="text-orange-700">not started</span>}
        </p>
      )}

      <div className="mt-6" />
      <SectionTitle>Members ({members.length})</SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr><th className="p-3">Name</th><th className="p-3">Role</th>{detailed && <><th className="p-3">Active</th><th className="p-3">Overdue</th><th className="p-3">Done (30d)</th></>}</tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const l = loadOf(m.id)
              return (
                <tr key={m.id} className="border-b border-neutral-50 last:border-0">
                  <td className="p-3"><Link href={`/people/${m.id}`} className="font-medium hover:underline">{m.full_name}</Link><span className="block text-xs text-neutral-500">{m.title ?? ''}</span></td>
                  <td className="p-3 text-xs text-neutral-600">{dept.director_id === m.id ? 'Director' : ROLE_LABEL[m.role]}</td>
                  {detailed && <><td className="p-3">{l?.open_count ?? 0}</td><td className={`p-3 ${l?.overdue_count ? 'font-semibold text-red-600' : ''}`}>{l?.overdue_count ?? 0}</td><td className="p-3">{l?.done_30d ?? 0}</td></>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {(projectRows ?? []).length > 0 && (
        <>
          <div className="mt-6" />
          <SectionTitle>Projects</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {((projectRows ?? []) as Pick<Project, 'id' | 'name' | 'status' | 'due_date'>[]).map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:border-amber-400">{p.name}</Link>
            ))}
          </div>
        </>
      )}

      {detailed && tasks.length > 0 && (
        <>
          <div className="mt-6" />
          <SectionTitle>Open work</SectionTitle>
          <div className="space-y-2">
            {tasks.map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`}>
                <Card className="flex items-center justify-between gap-3 transition hover:border-amber-400">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.title}</span>
                    <span className={`block text-xs ${isOverdue(t) ? 'text-red-600' : 'text-neutral-500'}`}>{nameOf(t.assignee_id)} · {fmtDue(t.due_at)}</span>
                  </span>
                  <StatusBadge status={t.status} />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
