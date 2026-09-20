import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDay, monthRange } from '@/lib/time'
import type { Report } from '@/lib/types'
import { Card, PageTitle, SectionTitle, buttonClass } from '@/components/ui'
import { startReport } from './actions'

export const dynamic = 'force-dynamic'

const monthLabel = (start: string) =>
  new Date(`${start}T12:00:00+03:00`).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', month: 'long', year: 'numeric' })

export default async function Reports() {
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase
    .from('reports').select('*').order('period_start', { ascending: false }).order('created_at', { ascending: false })
  const all = (data ?? []) as Report[]
  const mine = all.filter((r) => r.author_id === me.id)
  // Other people's drafts stay private, even from a super admin.
  const others = all.filter((r) => r.author_id !== me.id && r.status === 'submitted')

  const { data: members } = others.length
    ? await supabase.from('team_members').select('id, full_name').in('id', [...new Set(others.map((r) => r.author_id))])
    : { data: [] as { id: string; full_name: string }[] }
  const nameOf = (id: string) => (members ?? []).find((m) => m.id === id)?.full_name ?? '—'

  const { label } = monthRange()
  const thisMonth = mine.find((r) => r.period_start === monthRange().start)

  return (
    <>
      <PageTitle sub="Monthly reporting, straight into the system instead of WhatsApp.">Reports</PageTitle>

      <Card>
        <p className="font-medium">{label}</p>
        <p className="mb-3 text-sm text-neutral-600">
          {!thisMonth ? 'You haven’t started this month’s report.' : thisMonth.status === 'draft' ? 'Draft in progress.' : 'Submitted.'}
        </p>
        <form action={startReport}>
          <button className={buttonClass}>{!thisMonth ? 'Start report' : thisMonth.status === 'draft' ? 'Continue report' : 'View report'}</button>
        </form>
      </Card>

      <div className="mt-8" />
      <SectionTitle>My reports</SectionTitle>
      {mine.length === 0 ? <Card><p className="text-sm text-neutral-600">None yet.</p></Card> : (
        <div className="space-y-2">
          {mine.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`}>
              <Card className="flex items-center justify-between transition hover:border-amber-400">
                <span className="font-medium">{monthLabel(r.period_start)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'submitted' ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'}`}>{r.status}</span>
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
                <Card className="flex items-center justify-between transition hover:border-amber-400">
                  <span className="min-w-0">
                    <span className="block font-medium">{nameOf(r.author_id)}</span>
                    <span className="block text-xs text-neutral-500">{monthLabel(r.period_start)} · submitted {fmtDay(r.submitted_at)}</span>
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
