import Link from 'next/link'
import { requireCap } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { computeAnalytics, reportingLine } from '@/lib/analytics'
import { fmtDay, monthRange } from '@/lib/time'
import type { Project, Task, TeamMember } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

function Stat({ label, value, tone = '', href, hint }: { label: string; value: React.ReactNode; tone?: string; href?: string; hint?: string }) {
  const body = (
    <Card className={href ? 'transition hover:border-amber-400' : ''}>
      <p className={`text-3xl font-bold ${tone}`}>{value}</p>
      <p className="text-sm text-neutral-600">{label}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </Card>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

function Bar({ pct }: { pct: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100" aria-hidden>
      <div className="h-full bg-amber-500" style={{ width: `${pct ?? 0}%` }} />
    </div>
  )
}

export default async function Analytics() {
  const me = await requireCap('view_analytics')
  const supabase = await createClient()
  const now = Date.now()
  const month = monthRange()

  const [{ data: memberRows }, { data: taskRows }, { data: projectRows }, { data: deptRows }, { data: reportRows }] =
    await Promise.all([
      supabase.from('team_members').select('*').eq('active', true),
      supabase.from('tasks').select('*, updated_at'),
      supabase.from('projects').select('*'),
      supabase.from('departments').select('id, name'),
      supabase.from('reports').select('author_id, status').eq('kind', 'personal').gte('period_start', month.start).lte('period_start', month.end).eq('status', 'submitted'),
    ])

  const members = (memberRows ?? []) as TeamMember[]
  const tasks = (taskRows ?? []) as (Task & { updated_at: string })[]
  const scope = reportingLine(me, members)
  const updatedAt = Object.fromEntries(tasks.map((t) => [t.id, new Date(t.updated_at).getTime()]))

  const a = computeAnalytics({
    now, scope, members, tasks,
    projects: (projectRows ?? []) as Project[],
    departments: deptRows ?? [],
    updatedAt,
  })

  const submittedBy = new Set((reportRows ?? []).map((r) => r.author_id))
  const missingReports = a.people.filter((p) => !submittedBy.has(p.id))
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? '—'
  const overdueTasks = a.overdue
    .sort((x, y) => new Date(x.due_at!).getTime() - new Date(y.due_at!).getTime())
    .slice(0, 6)
  const risky = a.projectStats.filter((p) => p.atRisk)
  const attention = overdueTasks.length + risky.length + a.quiet.length

  return (
    <>
      <PageTitle sub={me.role === 'super_admin' || me.is_director ? 'Whole organisation' : 'You and everyone who reports to you'}>
        Command centre
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active people" value={a.people.length} />
        <Stat label="Open tasks" value={a.open.length} />
        <Stat label="Overdue" value={a.overdue.length} tone={a.overdue.length ? 'text-red-600' : 'text-green-600'} href="/tasks?filter=overdue" />
        <Stat label="Awaiting review" value={a.review.length} tone={a.review.length ? 'text-purple-700' : ''} />
        <Stat label="Completed this week" value={a.done7.length} tone="text-green-600" />
        <Stat label="Completed in 30 days" value={a.done30.length} tone="text-green-600" />
        <Stat
          label="Finished on time (30 days)"
          value={a.onTimeRate === null ? '—' : `${a.onTimeRate}%`}
          hint={a.onTimeRate === null ? 'No completed tasks with deadlines yet' : `${a.onTimeSample} tasks with deadlines`}
        />
        <Stat label={`Reports in (${month.label})`} value={`${submittedBy.size ? a.people.filter((p) => submittedBy.has(p.id)).length : 0}/${a.people.length}`} href="/reports" />
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Attention required</h2>
      {attention === 0 ? (
        <Card><p className="text-sm text-green-700">Nothing needs attention right now.</p></Card>
      ) : (
        <Card className="space-y-4">
          {overdueTasks.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-red-700">Overdue tasks</p>
              <ul className="space-y-1 text-sm">
                {overdueTasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="hover:underline">{t.title}</Link>
                    <span className="text-neutral-500"> — {nameOf(t.assignee_id)}, due {fmtDay(t.due_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {risky.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-orange-700">Projects at risk</p>
              <ul className="space-y-1 text-sm">
                {risky.map((p) => (
                  <li key={p.project.id}>{p.project.name}
                    <span className="text-neutral-500"> — {p.overdue > 0 ? `${p.overdue} overdue task${p.overdue === 1 ? '' : 's'}` : 'flagged at risk'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.quiet.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-amber-700">Gone quiet (nothing touched in 14 days)</p>
              <p className="text-sm">{a.quiet.map((p) => p.member.full_name).join(', ')}</p>
            </div>
          )}
        </Card>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Departments</h2>
      {a.depts.length === 0 ? <Card><p className="text-sm text-neutral-600">No departments assigned yet.</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {a.depts.map((d) => (
            <Card key={d.id ?? 'none'}>
              <div className="flex items-baseline justify-between">
                <p className="font-medium">{d.name}</p>
                <p className="text-sm text-neutral-500">{d.pct === null ? 'no tasks' : `${d.pct}% done`}</p>
              </div>
              <div className="my-2"><Bar pct={d.pct} /></div>
              <p className="text-xs text-neutral-500">{d.open} open · <span className={d.overdue ? 'text-red-600' : ''}>{d.overdue} overdue</span></p>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Projects</h2>
      {a.projectStats.length === 0 ? <Card><p className="text-sm text-neutral-600">No active projects.</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {a.projectStats.map((p) => (
            <Card key={p.project.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{p.project.name}</p>
                <p className="text-sm text-neutral-500">{p.pct === null ? 'no tasks' : `${p.pct}%`}</p>
              </div>
              <div className="my-2"><Bar pct={p.pct} /></div>
              <p className="text-xs text-neutral-500">{p.done}/{p.total} tasks done{p.overdue ? ` · ${p.overdue} overdue` : ''}</p>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">People workload</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr><th className="p-3">Person</th><th className="p-3">Open</th><th className="p-3">Overdue</th><th className="p-3">Done (30d)</th></tr>
          </thead>
          <tbody>
            {a.persons.map((p) => (
              <tr key={p.member.id} className="border-b border-neutral-50 last:border-0">
                <td className="p-3"><Link href={`/people/${p.member.id}`} className="font-medium hover:underline">{p.member.full_name}</Link></td>
                <td className="p-3">{p.open}</td>
                <td className={`p-3 ${p.overdue ? 'font-semibold text-red-600' : ''}`}>{p.overdue}</td>
                <td className="p-3">{p.done30}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {missingReports.length > 0 && (
        <>
          <div className="mt-8" />
          <SectionTitle>Reports not yet submitted for {month.label}</SectionTitle>
          <Card><p className="text-sm">{missingReports.map((p) => p.full_name).join(', ')}</p></Card>
        </>
      )}
    </>
  )
}
