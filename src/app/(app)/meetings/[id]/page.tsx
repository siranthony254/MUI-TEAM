import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime } from '@/lib/time'
import type { Decision, Meeting, Task } from '@/lib/types'
import { Card, PageTitle, SectionTitle, StatusBadge } from '@/components/ui'
import { ActionItemForm, DecisionForm, OutcomeForm } from './MeetingPanels'
import { deleteMeeting } from '../../manage-actions'
import { MeetingEditForm } from '../../ManageForms'
import { ConfirmButton, ManagePanel } from '@/components/ConfirmButton'

export const dynamic = 'force-dynamic'

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const meeting = data as Meeting

  const [{ data: attendeeRows }, { data: members }, { data: actions }, { data: decisions }] = await Promise.all([
    supabase.from('meeting_attendees').select('member_id, attended').eq('meeting_id', id),
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name'),
    supabase.from('tasks').select('*').eq('meeting_id', id).order('created_at'),
    supabase.from('decisions').select('*').eq('meeting_id', id).order('created_at'),
  ])

  const name = (mid: string | null) => (members ?? []).find((m) => m.id === mid)?.full_name ?? '—'
  const attendees = (attendeeRows ?? []).map((a) => ({ id: a.member_id, label: name(a.member_id), attended: a.attended as boolean | null }))
  const canManage = me.role === 'super_admin' || ((await can(me, 'schedule_meeting')) && meeting.created_by === me.id)
  const agendaItems = (meeting.agenda ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

  return (
    <>
      <Link href="/meetings" className="text-sm text-neutral-500 hover:underline">← Meetings</Link>
      <div className="mt-2" />
      <PageTitle sub={`${fmtDateTime(meeting.starts_at)}${meeting.location ? ` · ${meeting.location}` : ''}`}>
        {meeting.title}
      </PageTitle>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle>Agenda</SectionTitle>
          {agendaItems.length === 0 ? <p className="text-sm text-neutral-500">No agenda set.</p>
            : <ol className="list-decimal space-y-1 pl-5 text-sm">{agendaItems.map((a, i) => <li key={i}>{a}</li>)}</ol>}
        </Card>
        <Card>
          <SectionTitle>Participants ({attendees.length})</SectionTitle>
          <ul className="space-y-1 text-sm">
            {attendees.map((a) => (
              <li key={a.id}>
                {a.label}
                {meeting.status === 'held' && (
                  <span className={`ml-2 text-xs ${a.attended ? 'text-green-700' : 'text-neutral-400'}`}>
                    {a.attended ? 'attended' : 'absent'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {!canManage && meeting.minutes && (
        <Card className="mt-4">
          <SectionTitle>Minutes</SectionTitle>
          <p className="whitespace-pre-wrap text-sm">{meeting.minutes}</p>
        </Card>
      )}

      {(decisions ?? []).length > 0 && (
        <Card className="mt-4">
          <SectionTitle>Decisions from this meeting</SectionTitle>
          <ul className="space-y-3 text-sm">
            {(decisions as Decision[]).map((d) => (
              <li key={d.id}><p className="font-medium">{d.title}</p><p className="text-neutral-600">{d.decision}</p></li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <SectionTitle>Action items ({(actions ?? []).length})</SectionTitle>
        {(actions ?? []).length === 0 ? <p className="text-sm text-neutral-500">None yet.</p> : (
          <ul className="divide-y divide-neutral-100">
            {(actions as Task[]).map((t) => (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-neutral-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block text-xs text-neutral-500">{name(t.assignee_id)}{t.due_at ? ` · due ${fmtDateTime(t.due_at)}` : ''}</span>
                  </span>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canManage && (
        <>
          <ManagePanel label="Edit meeting details">
            <MeetingEditForm meeting={meeting} />
            <form action={deleteMeeting} className="mt-4 border-t border-neutral-200 pt-3">
              <input type="hidden" name="id" value={meeting.id} />
              <ConfirmButton message="Delete this meeting with its minutes and attendance? Action items already created stay as tasks." className="text-sm font-medium text-red-600 hover:underline">Delete this meeting</ConfirmButton>
            </form>
          </ManagePanel>
          <Card className="mt-4">
            <SectionTitle>Minutes &amp; attendance</SectionTitle>
            <OutcomeForm id={meeting.id} status={meeting.status} minutes={meeting.minutes ?? ''} attendees={attendees} />
          </Card>
          <Card className="mt-4">
            <SectionTitle>Add an action item</SectionTitle>
            <ActionItemForm meetingId={meeting.id} people={(members ?? []).map((m) => ({ id: m.id, label: m.full_name }))} />
          </Card>
          <Card className="mt-4">
            <SectionTitle>Record a decision</SectionTitle>
            <DecisionForm meetingId={meeting.id} />
          </Card>
        </>
      )}
    </>
  )
}
