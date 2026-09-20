import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDay } from '@/lib/time'
import type { Report } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { ReportForm } from './ReportForm'

export const dynamic = 'force-dynamic'

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('reports').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const report = data as Report

  const { data: author } = await supabase.from('team_members').select('full_name, title').eq('id', report.author_id).maybeSingle()
  const month = new Date(`${report.period_start}T12:00:00+03:00`)
    .toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', month: 'long', year: 'numeric' })
  const editable = report.author_id === me.id && report.status === 'draft'

  const sections: [string, string | null][] = [
    ['Activities', report.activities], ['Completed', report.completed], ['Challenges', report.challenges],
    ['Metrics', report.metrics], ['Recommendations', report.recommendations],
  ]

  return (
    <>
      <Link href="/reports" className="text-sm text-neutral-500 hover:underline">← Reports</Link>
      <div className="mt-2" />
      <PageTitle sub={`${author?.full_name ?? ''}${author?.title ? ` · ${author.title}` : ''}${report.submitted_at ? ` · submitted ${fmtDay(report.submitted_at)}` : ' · draft'}`}>
        {month} report
      </PageTitle>

      {editable ? (
        <Card><ReportForm report={report} /></Card>
      ) : (
        <div className="space-y-4">
          {sections.map(([label, value]) => (
            <Card key={label}>
              <SectionTitle>{label}</SectionTitle>
              <p className="whitespace-pre-wrap text-sm">{value ?? <span className="text-neutral-500">Nothing recorded.</span>}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
