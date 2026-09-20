import Link from 'next/link'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { fmtDay, monthRange, parseMonthParam, monthParam, shiftMonth, TZ } from '@/lib/time'
import type { Report } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { NewReportForm } from './NewReportForm'

export const dynamic = 'force-dynamic'

const range = (r: Report) => {
  const f = (d: string) => new Date(`${d}T12:00:00+03:00`).toLocaleDateString('en-KE', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
  return `${f(r.period_start)} – ${f(r.period_end)}`
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  const [{ data }, { data: departments }, { data: allMembers }] = await Promise.all([
    supabase.from('reports').select('*').order('period_start', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name'),
  ])
  const all = (data ?? []) as Report[]
  const mine = all.filter((r) => r.author_id === me.id)
  // Other people's drafts stay private, even from a super admin.
  const others = all.filter((r) => r.author_id !== me.id && r.status === 'submitted')
  const nameOf = (id: string) => (allMembers ?? []).find((x) => x.id === id)?.full_name ?? '—'
  const deptName = (id: string | null) => (departments ?? []).find((d) => d.id === id)?.name

  const month = monthRange()
  const exec = isExecOrAbove(me)

  // Report centre: which departments have submitted for the chosen month.
  const { year, month: mm } = parseMonthParam(m)
  const sel = monthRange(new Date(`${monthParam(year, mm)}-15T12:00:00+03:00`))
  const prev = shiftMonth(year, mm, -1)
  const next = shiftMonth(year, mm, 1)
  const centreDepartments = me.role === 'super_admin' ? (departments ?? []) : (departments ?? []).filter((d) => d.id === me.department_id)
  const deptReports = all.filter((r) => r.kind === 'department' && r.period_start >= sel.start && r.period_start <= sel.end)

  return (
    <>
      <PageTitle sub="Reporting into the system instead of WhatsApp.">Reports</PageTitle>

      <Card>
        <SectionTitle>Write a report</SectionTitle>
        <NewReportForm
          canDepartment={await can(me, 'submit_department_report')}
          departments={(departments ?? []).filter((d) => exec || (me.directed_departments ?? []).includes(d.id)).map((d) => ({ id: d.id, label: d.name }))}
          defaultDepartment={me.department_id ?? ''}
          start={month.start}
          end={month.end}
        />
      </Card>

      {exec && centreDepartments.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>Department reports — {sel.label}</SectionTitle>
            <div className="flex gap-3 text-sm">
              <Link href={`/reports?m=${monthParam(prev.year, prev.month)}`} className="text-amber-700 hover:underline">← Prev</Link>
              <Link href={`/reports?m=${monthParam(next.year, next.month)}`} className="text-amber-700 hover:underline">Next →</Link>
            </div>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-neutral-100">
              {centreDepartments.map((d) => {
                const submitted = deptReports.filter((r) => r.department_id === d.id && r.status === 'submitted')
                const draft = deptReports.find((r) => r.department_id === d.id && r.status === 'draft')
                const first = submitted[0]
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="font-medium">{d.name}</span>
                    {first ? (
                      <Link href={`/reports/${first.id}`} className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Submitted · {nameOf(first.author_id)}
                      </Link>
                    ) : draft ? (
                      <Link href={`/reports/${draft.id}`} className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-700">Draft</Link>
                    ) : (
                      <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">Pending</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
          <Link href="/analytics" className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline">Open the executive dashboard →</Link>
        </div>
      )}

      <div className="mt-8" />
      <SectionTitle>My reports</SectionTitle>
      {mine.length === 0 ? <Card><p className="text-sm text-neutral-600">None yet.</p></Card> : (
        <div className="space-y-2">
          {mine.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`}>
              <Card className="flex items-center justify-between gap-3 transition hover:border-amber-400">
                <span className="min-w-0">
                  <span className="block font-medium">{r.kind === 'department' ? `${deptName(r.department_id) ?? 'Department'} report` : 'Personal report'}</span>
                  <span className="block text-xs text-neutral-500">{range(r)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'submitted' ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'}`}>{r.status}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <>
          <div className="mt-8" />
          <SectionTitle>Submitted by your team</SectionTitle>
          <div className="space-y-2">
            {others.map((r) => (
              <Link key={r.id} href={`/reports/${r.id}`}>
                <Card className="transition hover:border-amber-400">
                  <span className="block font-medium">{nameOf(r.author_id)}{r.kind === 'department' ? ` · ${deptName(r.department_id) ?? ''}` : ''}</span>
                  <span className="block text-xs text-neutral-500">{range(r)} · submitted {fmtDay(r.submitted_at)}</span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
