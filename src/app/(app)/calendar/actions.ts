'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { localInputToIso } from '@/lib/time'

export interface EventState { error?: string; ok?: string }

const KINDS = ['event', 'recording', 'publication', 'deadline', 'other']

export async function createEvent(_prev: EventState | undefined, fd: FormData): Promise<EventState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can add calendar events.' }

  const title = String(fd.get('title') ?? '').trim()
  const allDay = fd.get('all_day') === 'on'
  const rawStart = String(fd.get('starts_at') ?? '')
  const rawEnd = String(fd.get('ends_at') ?? '')
  const kind = String(fd.get('kind') ?? 'event')
  if (title.length < 3) return { error: 'Give the event a title.' }
  if (!KINDS.includes(kind)) return { error: 'Invalid event type.' }

  // All-day events store noon Nairobi on the chosen date so the day never shifts.
  const starts_at = allDay ? localInputToIso(`${rawStart.slice(0, 10)}T12:00`) : localInputToIso(rawStart)
  const ends_at = allDay || !rawEnd ? null : localInputToIso(rawEnd)
  if (!starts_at) return { error: 'Choose a date.' }
  if (ends_at && ends_at <= starts_at) return { error: 'The end must be after the start.' }

  const supabase = await createClient()
  const { error } = await supabase.from('calendar_events').insert({
    title,
    description: String(fd.get('description') ?? '').trim() || null,
    kind, starts_at, ends_at, all_day: allDay,
    visibility: fd.get('visibility') === 'executive' ? 'executive' : 'everyone',
    created_by: me.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/calendar')
  return { ok: 'Added to the calendar.' }
}

export async function deleteEvent(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  await supabase.from('calendar_events').delete().eq('id', String(fd.get('id') ?? ''))
  revalidatePath('/calendar')
}
