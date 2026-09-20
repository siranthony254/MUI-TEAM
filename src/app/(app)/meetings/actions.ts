'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'

export interface MeetingState { error?: string; ok?: string }

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null

export async function createMeeting(_prev: MeetingState | undefined, fd: FormData): Promise<MeetingState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can schedule meetings.' }

  const title = text(fd, 'title')
  const starts_at = localInputToIso(String(fd.get('starts_at') ?? ''))
  const ends_at = localInputToIso(String(fd.get('ends_at') ?? ''))
  if (!title || title.length < 3) return { error: 'Give the meeting a title.' }
  if (!starts_at) return { error: 'Choose when it starts.' }
  if (ends_at && ends_at <= starts_at) return { error: 'The end time must be after the start.' }

  const supabase = await createClient()
  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      title, starts_at, ends_at,
      location: text(fd, 'location'),
      agenda: text(fd, 'agenda'),
      project_id: text(fd, 'project_id'),
      created_by: me.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const attendees = [...new Set(fd.getAll('attendees').map(String))].filter((id) => id !== me.id)
  if (attendees.length > 0) {
    const { error: aErr } = await supabase
      .from('meeting_attendees')
      .insert(attendees.map((member_id) => ({ meeting_id: meeting.id, member_id })))
    if (aErr) return { error: aErr.message }
  }
  // The organiser is always an attendee of their own meeting.
  await supabase.from('meeting_attendees').upsert({ meeting_id: meeting.id, member_id: me.id })

  deliverSoon()
  revalidatePath('/meetings')
  redirect(`/meetings/${meeting.id}`)
}

/** Save minutes, status and attendance in one go. */
export async function saveMeetingOutcome(_prev: MeetingState | undefined, fd: FormData): Promise<MeetingState> {
  await requireMember()
  const id = String(fd.get('id') ?? '')
  const status = String(fd.get('status') ?? 'scheduled')
  if (!['scheduled', 'held', 'cancelled'].includes(status)) return { error: 'Invalid status.' }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('meetings')
    .update({ minutes: text(fd, 'minutes'), status })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  // RLS filters rows silently: no row back means the caller isn't allowed to edit this meeting.
  if (!updated || updated.length === 0) return { error: 'Only the organiser can update this meeting.' }

  // Attendance: checked = attended, unchecked = absent (only recorded once the meeting is held).
  if (status === 'held') {
    const present = new Set(fd.getAll('present').map(String))
    const { data: rows } = await supabase.from('meeting_attendees').select('member_id').eq('meeting_id', id)
    for (const r of rows ?? []) {
      await supabase.from('meeting_attendees')
        .update({ attended: present.has(r.member_id) })
        .eq('meeting_id', id).eq('member_id', r.member_id)
    }
  }
  revalidatePath(`/meetings/${id}`)
  revalidatePath('/meetings')
  return { ok: 'Saved.' }
}

/** A decision taken in a meeting goes straight into the register. */
export async function recordDecision(_prev: MeetingState | undefined, fd: FormData): Promise<MeetingState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can record decisions.' }
  const title = text(fd, 'title')
  const decision = text(fd, 'decision')
  if (!title || !decision) return { error: 'A decision needs a title and the decision itself.' }

  const supabase = await createClient()
  const meetingId = text(fd, 'meeting_id')
  const { data: meeting } = meetingId
    ? await supabase.from('meetings').select('project_id').eq('id', meetingId).maybeSingle()
    : { data: null }
  const { error } = await supabase.from('decisions').insert({
    project_id: meeting?.project_id ?? null,
    title, decision,
    rationale: text(fd, 'rationale'),
    decided_by: text(fd, 'decided_by') ?? 'Executive Team',
    meeting_id: text(fd, 'meeting_id'),
    created_by: me.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/decisions')
  const mid = text(fd, 'meeting_id')
  if (mid) revalidatePath(`/meetings/${mid}`)
  return { ok: 'Decision recorded in the register.' }
}

/** An action item is a normal task that remembers which meeting it came from. */
export async function addActionItem(_prev: MeetingState | undefined, fd: FormData): Promise<MeetingState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can assign action items.' }
  const meetingId = String(fd.get('meeting_id') ?? '')
  const title = text(fd, 'title')
  const assignee = text(fd, 'assignee_id')
  if (!title || title.length < 3) return { error: 'Describe the action.' }
  if (!assignee) return { error: 'Choose who is responsible.' }

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').insert({
    title,
    description: text(fd, 'description'),
    assignee_id: assignee,
    assigned_by: me.id,
    meeting_id: meetingId,
    priority: 'normal',
    due_at: localInputToIso(String(fd.get('due_at') ?? '')),
  })
  if (error) return { error: error.message }

  deliverSoon()
  revalidatePath(`/meetings/${meetingId}`)
  return { ok: 'Action item created and assigned.' }
}
