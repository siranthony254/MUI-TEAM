import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDay } from '@/lib/time'
import type { Report } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { AttachmentsPanel } from '@/components/attachments/AttachmentsPanel'
import { ReportForm } from './ReportForm'
import { deleteReport } from '../../manage-actions'
import { ConfirmButton } from '@/components/ConfirmButton'

export const dynamic = 'force-dynamic'

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('reports').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const report = data as Report

  const { data: author } = await supabase.from('team_members').select('full_name, title').eq('id', report.author_id).maybeSingle()
  const fmt = (d: string) => new Date(`${d}T12:00:00+03:00`)
    .toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })
  const period = `${fmt(report.period_start)} – ${fmt(report.period_end)}`
  const { data: dept } = report.department_id
    ? await supabase.from('departments').select('name').eq('id', report.department_id).maybeSingle()
    : { data: null }
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
        {report.kind === 'department' ? `${dept?.name ?? 'Department'} report` : 'Personal report'} · {period}
      </PageTitle>

      {editable ? (
        <>
          <Card><ReportForm report={report} /></Card>
          <Card className="mt-4">
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentsPanel type="report" entityId={report.id} canAdd viewerId={me.id} isSuperAdmin={me.role === 'super_admin'} />
          </Card>
          <form action={deleteReport} className="mt-4">
            <input type="hidden" name="id" value={report.id} />
            <ConfirmButton message="Discard this draft report?" className="text-sm font-medium text-red-600 hover:underline">Delete draft</ConfirmButton>
          </form>
        </>
      ) : (
        <div className="space-y-4">
          {sections.map(([label, value]) => (
            <Card key={label}>
              <SectionTitle>{label}</SectionTitle>
              <p className="whitespace-pre-wrap text-sm">{value ?? <span className="text-neutral-500">Nothing recorded.</span>}</p>
            </Card>
          ))}
          <Card>
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentsPanel type="report" entityId={report.id} canAdd={false} viewerId={me.id} isSuperAdmin={me.role === 'super_admin'} />
          </Card>
          {me.role === 'super_admin' && (
            <form action={deleteReport}>
              <input type="hidden" name="id" value={report.id} />
              <ConfirmButton message="Delete this submitted report permanently?" className="text-sm font-medium text-red-600 hover:underline">Delete report (system admin)</ConfirmButton>
            </form>
          )}
        </div>
      )}
    </>
  )
}
