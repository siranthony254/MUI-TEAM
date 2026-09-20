import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime, fmtDay } from '@/lib/time'
import type { CalendarEvent } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'
import { deleteEvent } from '../../actions'
import { EventEditForm } from '../../../ManageForms'
import { ConfirmButton, ManagePanel } from '@/components/ConfirmButton'

export const dynamic = 'force-dynamic'

const KIND: Record<CalendarEvent['kind'], string> = {
  event: 'Event', recording: 'Recording', publication: 'Publication', deadline: 'Deadline', other: 'Other',
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('calendar_events').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const e = data as CalendarEvent
  const { data: creator } = e.created_by
    ? await supabase.from('team_members').select('full_name').eq('id', e.created_by).maybeSingle()
    : { data: null }
  const canDelete = me.role === 'super_admin' || e.created_by === me.id

  return (
    <>
      <Link href="/calendar" className="text-sm text-neutral-500 hover:underline">← Calendar</Link>
      <div className="mt-2" />
      <PageTitle sub={KIND[e.kind]}>{e.title}</PageTitle>
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-neutral-500">When</dt><dd className="font-medium">{e.all_day ? `${fmtDay(e.starts_at)} · all day` : fmtDateTime(e.starts_at)}</dd></div>
          {e.ends_at && <div><dt className="text-neutral-500">Ends</dt><dd className="font-medium">{fmtDateTime(e.ends_at)}</dd></div>}
          <div><dt className="text-neutral-500">Visible to</dt><dd className="font-medium">{e.visibility === 'executive' ? 'Executives only' : 'Whole team'}</dd></div>
          {creator && <div><dt className="text-neutral-500">Added by</dt><dd className="font-medium">{creator.full_name}</dd></div>}
        </dl>
        {e.description && <p className="mt-4 whitespace-pre-wrap text-sm">{e.description}</p>}
        {canDelete && (
          <>
            <ManagePanel label="Edit event"><EventEditForm event={e} /></ManagePanel>
            <form action={deleteEvent} className="mt-4 border-t border-neutral-100 pt-3">
              <input type="hidden" name="id" value={e.id} />
              <ConfirmButton message="Remove this event from the calendar?" className="text-sm font-medium text-red-600 hover:underline">Remove from calendar</ConfirmButton>
            </form>
          </>
        )}
      </Card>
    </>
  )
}
