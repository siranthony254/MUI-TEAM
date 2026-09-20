'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { can, dbFor, requireScope } from '@/lib/permissions'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'

export interface ManageState { error?: string; ok?: string }

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null
const NOPE = "You don't have permission to do that."

// ---------------------------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------------------------

/** The person who set the task (or a system admin) can change its details. The database enforces the same. */
export async function updateTask(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const title = text(fd, 'title')
  if (!title || title.length < 3) return { error: 'Give the task a title (at least 3 characters).' }
  const weight = Math.round(Number(fd.get('weight') ?? 1))
  const tags = String(fd.get('tags') ?? '').split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean).slice(0, 8)

  const supabase = await createClient()
  const { data: cur } = await supabase.from('tasks').select('assigned_by').eq('id', id).maybeSingle()
  if (!cur || !(cur.assigned_by === me.id || me.role === 'super_admin')) return { error: 'Only the person who set this task can edit it.' }
  const { data, error } = await supabase.from('tasks').update({
    title, description: text(fd, 'description'), priority: String(fd.get('priority') ?? 'normal'),
    due_at: localInputToIso(String(fd.get('due_at') ?? '')), start_date: text(fd, 'start_date'),
    project_id: text(fd, 'project_id'), department_id: text(fd, 'department_id'), tags,
    weight: weight >= 1 && weight <= 100 ? weight : 1,
    require_approval: fd.get('require_approval') === 'on', requires_evidence: fd.get('requires_evidence') === 'on',
  }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Only the person who set this task can edit it.' }
  deliverSoon()
  revalidatePath(`/tasks/${id}`)
  revalidatePath('/', 'layout')
  return { ok: 'Saved.' }
}

export async function deleteTask(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  const { data } = await supabase.from('tasks').delete().eq('id', String(fd.get('id') ?? '')).select('id')
  if (!data?.length) return
  revalidatePath('/', 'layout')
  redirect('/tasks')
}

// ---------------------------------------------------------------------------------------------
// Projects, meetings, decisions, events, resources, reports, episodes
// ---------------------------------------------------------------------------------------------

export async function deleteProject(fd: FormData) {
  deliverSoon()
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const supabase = await createClient()
  const { data: p } = await supabase.from('projects').select('owner_id, created_by').eq('id', id).maybeSingle()
  // Anyone who runs projects may remove their own; system admins may remove any.
  if (!p || !(me.role === 'super_admin' || (isExecOrAbove(me) && (p.owner_id === me.id || p.created_by === me.id)))) return
  await supabase.from('projects').delete().eq('id', id)
  revalidatePath('/projects')
  redirect('/projects')
}

async function ownMeeting(me: Awaited<ReturnType<typeof requireMember>>, id: string) {
  const { data } = await (await createClient()).from('meetings').select('created_by').eq('id', id).maybeSingle()
  return !!data && (data.created_by === me.id || me.role === 'super_admin')
}

export async function updateMeeting(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  deliverSoon()
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  if (!(await ownMeeting(me, id))) return { error: 'Only the organiser can edit this meeting.' }
  const title = text(fd, 'title')
  const starts = localInputToIso(String(fd.get('starts_at') ?? ''))
  const ends = localInputToIso(String(fd.get('ends_at') ?? ''))
  if (!title || title.length < 3) return { error: 'Give the meeting a title.' }
  if (!starts) return { error: 'Choose when it starts.' }
  if (ends && ends <= starts) return { error: 'The end must be after the start.' }
  const { data, error } = await (await dbFor(me)).from('meetings').update({
    title, starts_at: starts, ends_at: ends, location: text(fd, 'location'), agenda: text(fd, 'agenda'),
  }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Only the organiser can edit this meeting.' }
  revalidatePath(`/meetings/${id}`)
  revalidatePath('/meetings')
  return { ok: 'Saved.' }
}

export async function deleteMeeting(fd: FormData) {
  deliverSoon()
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  if (!(await ownMeeting(me, id))) return
  await (await dbFor(me)).from('meetings').delete().eq('id', id)
  revalidatePath('/meetings')
  redirect('/meetings')
}

async function ownDecision(me: Awaited<ReturnType<typeof requireMember>>, id: string) {
  if (!(await can(me, 'record_decision'))) return false
  const { data } = await (await createClient()).from('decisions').select('created_by').eq('id', id).maybeSingle()
  return !!data && (data.created_by === me.id || me.role === 'super_admin' || me.is_director)
}

export async function updateDecision(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  deliverSoon()
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  if (!(await ownDecision(me, id))) return { error: 'Only whoever recorded this decision (or the Director or a system admin) can edit it.' }
  const title = text(fd, 'title')
  const decision = text(fd, 'decision')
  if (!title || !decision) return { error: 'A decision needs a title and the decision itself.' }
  const { error } = await (await dbFor(me)).from('decisions').update({
    title, decision, rationale: text(fd, 'rationale'), decided_by: text(fd, 'decided_by'),
    decided_on: text(fd, 'decided_on') ?? undefined,
    implementation_owner_id: text(fd, 'implementation_owner_id'), project_id: text(fd, 'project_id'),
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/decisions')
  return { ok: 'Saved.' }
}

export async function deleteDecision(fd: FormData) {
  deliverSoon()
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  if (!(await ownDecision(me, id))) return
  await (await dbFor(me)).from('decisions').delete().eq('id', id)
  revalidatePath('/decisions')
}

export async function updateEvent(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  deliverSoon()
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const supabase = await createClient()
  const { data: ev } = await supabase.from('calendar_events').select('created_by').eq('id', id).maybeSingle()
  if (!ev || !(ev.created_by === me.id || me.role === 'super_admin')) return { error: 'Only whoever added this event can edit it.' }
  const title = text(fd, 'title')
  const allDay = fd.get('all_day') === 'on'
  const rawStart = String(fd.get('starts_at') ?? '')
  const starts = allDay ? localInputToIso(`${rawStart.slice(0, 10)}T12:00`) : localInputToIso(rawStart)
  const rawEnd = String(fd.get('ends_at') ?? '')
  const ends = allDay || !rawEnd ? null : localInputToIso(rawEnd)
  if (!title || title.length < 3) return { error: 'Give the event a title.' }
  if (!starts) return { error: 'Choose a date.' }
  if (ends && ends <= starts) return { error: 'The end must be after the start.' }
  const { error } = await (await dbFor(me)).from('calendar_events').update({
    title, description: text(fd, 'description'), kind: String(fd.get('kind') ?? 'event'), starts_at: starts, ends_at: ends,
    all_day: allDay, visibility: fd.get('visibility') === 'executive' ? 'executive' : 'everyone',
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/calendar/events/${id}`)
  revalidatePath('/calendar')
  return { ok: 'Saved.' }
}

export async function updateResource(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  await requireMember()
  const id = String(fd.get('id') ?? '')
  const title = text(fd, 'title')
  if (!title || title.length < 2) return { error: 'Give the resource a title.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('resources').update({
    title, description: text(fd, 'description'), category: String(fd.get('category') ?? 'Other'),
    visibility: fd.get('visibility') === 'executive' ? 'executive' : 'everyone',
  }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Only whoever added this (or a system admin) can edit it.' }
  revalidatePath(`/resources/${id}`)
  revalidatePath('/resources')
  return { ok: 'Saved.' }
}

export async function deleteReport(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  const { data } = await supabase.from('reports').delete().eq('id', String(fd.get('id') ?? '')).select('id')
  if (!data?.length) return
  revalidatePath('/reports')
  redirect('/reports')
}

export async function deleteEpisode(fd: FormData) {
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const supabase = await createClient()
  const { data: ep } = await supabase.from('episodes').select('created_by').eq('id', id).maybeSingle()
  if (!ep || !(ep.created_by === me.id || me.role === 'super_admin' || me.is_director)) return
  await supabase.from('episodes').delete().eq('id', id)
  revalidatePath('/conversations')
  redirect('/conversations')
}

// ---------------------------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------------------------

export async function updateAnnouncement(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  deliverSoon()
  const me = await requireMember()
  if (!me.is_director) return { error: 'Only the Executive Director can edit announcements.' }
  const title = text(fd, 'title')
  const body = text(fd, 'body')
  if (!title || !body) return { error: 'An announcement needs a title and a message.' }
  const priority = String(fd.get('priority') ?? 'normal')
  const supabase = await createClient()
  const { error } = await supabase.from('announcements').update({
    title, body, priority: ['normal', 'important', 'urgent'].includes(priority) ? priority : 'normal',
  }).eq('id', String(fd.get('id') ?? ''))
  if (error) return { error: error.message }
  revalidatePath('/announcements')
  return { ok: 'Saved. People who were already notified keep the original wording in their notification.' }
}

// ---------------------------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------------------------

export async function editMessage(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  await requireMember()
  const id = String(fd.get('id') ?? '')
  const body = String(fd.get('body') ?? '').trim()
  if (!body) return { error: 'A message can\'t be empty. Delete it instead.' }
  if (body.length > 4000) return { error: 'That message is too long (4000 characters max).' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('messages').update({ body }).eq('id', id).select('channel_id')
  if (error) return { error: 'You can only edit your own messages.' }
  if (!data?.length) return { error: 'You can only edit your own messages.' }
  revalidatePath(`/chat/${data[0].channel_id}`)
  return { ok: 'Saved.' }
}

export async function setChannelMuted(fd: FormData) {
  const me = await requireMember()
  const channelId = String(fd.get('channel_id') ?? '')
  const muted = fd.get('muted') === '1'
  const supabase = await createClient()
  await supabase.from('channel_reads').upsert(
    { channel_id: channelId, member_id: me.id, muted },
    { onConflict: 'channel_id,member_id' },
  )
  revalidatePath(`/chat/${channelId}`)
}

export async function deleteChannel(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  const { data } = await supabase.from('channels').delete().eq('id', String(fd.get('id') ?? '')).eq('kind', 'group').select('id')
  if (!data?.length) return
  revalidatePath('/chat')
  redirect('/chat')
}

// ---------------------------------------------------------------------------------------------
// Departments and people (administration)
// ---------------------------------------------------------------------------------------------

export async function deleteDepartment(fd: FormData) {
  deliverSoon()
  const me = await requireScope('admin.departments')
  const admin = createAdminClient()
  const id = String(fd.get('id') ?? '')
  const { data: d } = await admin.from('departments').select('name').eq('id', id).maybeSingle()
  await admin.from('departments').delete().eq('id', id)
  await admin.rpc('log_activity', {
    p_actor: me.id, p_action: 'department.deleted', p_type: 'department', p_id: id,
    p_summary: `${me.full_name} deleted the ${d?.name ?? ''} department`, p_field: null, p_from: null, p_to: null, p_project: null,
  })
  revalidatePath('/', 'layout')
}

/**
 * Permanently removes a person's account. Their open work is handed to someone else first. What they wrote
 * in chat and their own reports go with them, so deactivating is usually the better choice: it keeps the history.
 * Only system admins can do this.
 */
export async function deleteMember(_prev: ManageState | undefined, fd: FormData): Promise<ManageState> {
  const me = await requireMember()
  if (me.role !== 'super_admin') return { error: NOPE }
  const id = String(fd.get('id') ?? '')
  const heirId = String(fd.get('reassign_to') ?? '')
  const typed = String(fd.get('confirm_name') ?? '').trim().toLowerCase()
  if (id === me.id) return { error: "You can't delete your own account." }

  const admin = createAdminClient()
  const [{ data: target }, { data: heir }] = await Promise.all([
    admin.from('team_members').select('id, full_name, role, is_director, reports_to').eq('id', id).maybeSingle(),
    admin.from('team_members').select('id, full_name, active').eq('id', heirId).maybeSingle(),
  ])
  if (!target) return { error: 'Member not found.' }
  if (typed !== target.full_name.toLowerCase()) return { error: "Type the person's full name exactly to confirm." }
  if (target.is_director) return { error: 'The Executive Director can only step down themselves; they cannot be deleted here.' }
  if (!heir?.active || heir.id === id) return { error: 'Choose an active person to take over their open work.' }
  if (target.role === 'super_admin') {
    const { count } = await admin.from('team_members').select('id', { count: 'exact', head: true }).eq('role', 'super_admin').eq('active', true)
    if ((count ?? 0) <= 1) return { error: 'This is the only active system admin. Promote someone else first.' }
  }

  const open = ['not_started', 'in_progress', 'needs_revision', 'submitted', 'under_review', 'blocked']
  const { data: moved } = await admin.from('tasks').update({ assignee_id: heirId }).eq('assignee_id', id).in('status', open).select('id, title')
  await admin.from('tasks').update({ assigned_by: heirId }).eq('assigned_by', id).in('status', open)
  await admin.from('projects').update({ owner_id: heirId }).eq('owner_id', id)
  await admin.from('team_members').update({ reports_to: target.reports_to }).eq('reports_to', id)
  await admin.from('departments').update({ director_id: null }).eq('director_id', id)

  if ((moved ?? []).length) {
    await admin.from('notifications').insert((moved ?? []).map((t) => ({
      recipient_id: heirId, kind: 'task_assigned', title: 'Task handed to you',
      body: `"${t.title}" was reassigned to you because ${target.full_name} is no longer on the team.`, link: `/tasks/${t.id}`,
    })))
  }
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { error: error.message }
  await admin.from('team_members').delete().eq('id', id)   // (already removed by the cascade; harmless if so)

  await admin.rpc('log_activity', {
    p_actor: me.id, p_action: 'member.deleted', p_type: 'member', p_id: id,
    p_summary: `${me.full_name} permanently deleted ${target.full_name}'s account; ${(moved ?? []).length} open task(s) went to ${heir.full_name}`,
    p_field: null, p_from: null, p_to: null, p_project: null,
  })
  deliverSoon()
  revalidatePath('/', 'layout')
  redirect('/admin')
}
