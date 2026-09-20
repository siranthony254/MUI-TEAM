'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireScope, hasScope } from '@/lib/permissions'
import { applyGrants } from '@/lib/grants'
import { requireMember } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TeamRole } from '@/lib/types'
import { deliverSoon } from '@/lib/notify/after'

export interface AdminState { error?: string; ok?: string }

const ROLES: TeamRole[] = ['super_admin', 'executive', 'member', 'guest']

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean)

const tempPassword = () => randomBytes(9).toString('base64url')

/** The role-profile fields captured when adding or editing someone. */
function profileFields(fd: FormData) {
  return {
    mandate: String(fd.get('mandate') ?? '').trim() || null,
    authority: String(fd.get('authority') ?? '').trim() || null,
    responsibilities: lines(fd.get('responsibilities')),
    deliverables: lines(fd.get('deliverables')),
    success_measures: lines(fd.get('success_measures')),
    start_date: String(fd.get('start_date') ?? '') || null,
  }
}

const isTop = (m: { role: string; is_director: boolean }) => m.role === 'super_admin' || m.is_director

type Admin = ReturnType<typeof createAdminClient>

async function directorExists(admin: Admin) {
  const { count } = await admin.from('team_members').select('id', { count: 'exact', head: true }).eq('is_director', true).eq('active', true)
  return (count ?? 0) > 0
}

/**
 * Handing out system-admin access, or naming the Executive Director, is the Director's call.
 * Until a Director exists, a system admin may set the very first one up.
 */
async function mayManageTopRoles(admin: Admin, actor: { is_director: boolean }) {
  return actor.is_director || !(await directorExists(admin))
}

/** Make `id` the Executive Director (there is only ever one) or stand them down. */
async function applyDirector(admin: Admin, id: string, want: boolean) {
  if (want) {
    await admin.from('team_members').update({ is_director: false }).eq('is_director', true).neq('id', id)
    await admin.from('team_members').update({ is_director: true }).eq('id', id)
  } else {
    await admin.from('team_members').update({ is_director: false }).eq('id', id)
  }
}

/** These run with the service role (no browser session), so we record who did what ourselves. */
async function log(
  actor: string, action: string, entityType: string, entityId: string, summary: string,
  field?: string, from?: string | null, to?: string | null,
) {
  await createAdminClient().rpc('log_activity', {
    p_actor: actor, p_action: action, p_type: entityType, p_id: entityId, p_summary: summary,
    p_field: field ?? null, p_from: from ?? null, p_to: to ?? null, p_project: null,
  })
}

/**
 * Creates a login for a new team member with a one-time temporary password.
 * The admin shares it privately; the member changes it under Account.
 */
export async function addMember(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  deliverSoon()
  const me = await requireScope('admin.people')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const full_name = String(formData.get('full_name') ?? '').trim()
  const role = String(formData.get('role') ?? 'member') as TeamRole
  const title = String(formData.get('title') ?? '').trim() || null
  const department_id = String(formData.get('department_id') ?? '') || null
  const reports_to = String(formData.get('reports_to') ?? '') || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  if (!email || !full_name) return { error: 'Name and email are required.' }
  if (!ROLES.includes(role)) return { error: 'Invalid role.' }
  const wantsDirector = formData.get('is_director') === 'on'

  const admin = createAdminClient()
  if ((role === 'super_admin' || wantsDirector) && !(isTop(me) && (await mayManageTopRoles(admin, me)))) {
    return { error: "Only the Executive Director can give system-admin access or name a new Director. Use the Director's desk." }
  }
  if (wantsDirector && role !== 'executive') return { error: 'The Executive Director should hold the Executive access level.' }
  if (role === 'executive' && !isTop(me) && !(await hasScope(me, 'admin.permissions'))) {
    return { error: 'Naming an executive needs the Permissions part of administration.' }
  }
  const password = tempPassword()

  // The person may already have a website account (same Supabase project).
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  })
  let userId = created?.user?.id
  let shown: string | null = password

  if (error) {
    if (!/already|registered|exists/i.test(error.message)) return { error: error.message }
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
    if (!existing) return { error: 'That email already has an account but could not be linked.' }
    userId = existing.id
    shown = null // keep their existing password
  }

  const { error: insertError } = await admin.from('team_members').upsert({
    id: userId, full_name, email, role, title, department_id, reports_to, phone, active: true,
    ...profileFields(formData),
  })
  if (insertError) return { error: insertError.message }

  if (wantsDirector) await applyDirector(admin, userId!, true)
  const grantError = await applyGrants(me, userId!, formData)
  await log(me.id, 'member.added', 'member', userId!, `${me.full_name} added ${full_name} to the team as ${role.replace('_', ' ')}`)
  revalidatePath('/admin')
  revalidatePath('/people')
  const note = grantError ? ` (Their access settings were not saved: ${grantError})` : ''
  return {
    ok: (shown
      ? `${full_name} added. Temporary password (shown once — share it privately): ${shown}`
      : `${full_name} added. They already had an account, so their existing password still works.`) + note,
  }
}

export async function updateMember(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  deliverSoon()
  const me = await requireScope('admin.people')
  const id = String(formData.get('id') ?? '')
  const role = String(formData.get('role') ?? '') as TeamRole
  if (!ROLES.includes(role)) return { error: 'Invalid role.' }
  if (id === me.id && role !== 'super_admin') {
    return { error: 'You can\'t remove your own Super Admin role. Ask another Super Admin.' }
  }

  const admin = createAdminClient()
  const { data: before } = await admin.from('team_members').select('role, department_id, full_name, is_director').eq('id', id).maybeSingle()
  if (!before) return { error: 'Member not found.' }
  if (!isTop(me) && (before.role === 'super_admin' || before.is_director)) return { error: 'Only a system admin can edit this person.' }
  if (!isTop(me) && role !== before.role && (role === 'executive' || role === 'super_admin') && !(await hasScope(me, 'admin.permissions'))) {
    return { error: 'Changing someone to Executive needs the Permissions part of administration.' }
  }

  const wantsDirector = formData.get('is_director') === 'on'
  const touchesTopRole = (role === 'super_admin') !== (before.role === 'super_admin') || wantsDirector !== before.is_director
  if (touchesTopRole && !(await mayManageTopRoles(admin, me))) {
    return { error: "Only the Executive Director can change system-admin access or the Director role. Use the Director's desk." }
  }
  if (wantsDirector && role !== 'executive') return { error: 'The Executive Director should hold the Executive access level.' }
  if (!wantsDirector && before.is_director && !me.is_director) {
    return { error: 'Only the Executive Director can step down or hand the role on.' }
  }

  const { error } = await admin.from('team_members').update({
    full_name: String(formData.get('full_name') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim() || null,
    role,
    title: String(formData.get('title') ?? '').trim() || null,
    department_id: String(formData.get('department_id') ?? '') || null,
    reports_to: String(formData.get('reports_to') ?? '') || null,
    mandate: String(formData.get('mandate') ?? '').trim() || null,
    authority: String(formData.get('authority') ?? '').trim() || null,
    responsibilities: lines(formData.get('responsibilities')),
    deliverables: lines(formData.get('deliverables')),
    success_measures: lines(formData.get('success_measures')),
    start_date: String(formData.get('start_date') ?? '') || null,
  }).eq('id', id)
  if (error) return { error: error.message }
  if (wantsDirector !== before.is_director) {
    await applyDirector(admin, id, wantsDirector)
    await log(me.id, 'member.director_changed', 'member', id,
      wantsDirector ? `${me.full_name} named ${before.full_name} Executive Director` : `${before.full_name} is no longer Executive Director`)
  }

  if (before && before.role !== role) {
    await log(me.id, 'member.role_changed', 'member', id,
      `${me.full_name} changed ${before.full_name}'s access level`, 'role', before.role, role)
  }
  revalidatePath('/', 'layout')
  return { ok: 'Saved.' }
}

/** Issues a new one-time password and ends existing sign-in. The old password stops working immediately. */
export async function resetAccess(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  deliverSoon()
  const me = await requireScope('admin.people')
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing member.' }

  const admin = createAdminClient()
  const { data: who } = await admin.from('team_members').select('role, is_director').eq('id', id).maybeSingle()
  if (who && !isTop(me) && isTop(who)) return { error: 'Only a system admin can reset access for this person.' }
  const password = tempPassword()
  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) return { error: error.message }

  const { data: m } = await admin.from('team_members').select('full_name').eq('id', id).maybeSingle()
  await log(me.id, 'member.access_reset', 'member', id, `${me.full_name} reset access for ${m?.full_name ?? 'a member'}`)
  return { ok: `New temporary password (shown once — share it privately): ${password}` }
}

/**
 * Offboarding. Blocks the login and deactivates the member, and hands their live
 * work to someone else so nothing is left orphaned. History (tasks, messages,
 * reports, activity) is preserved.
 */
export async function deactivateMember(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  deliverSoon()
  const me = await requireScope('admin.people')
  const id = String(formData.get('id') ?? '')
  const reassignTo = String(formData.get('reassign_to') ?? '')
  if (id === me.id) return { error: 'You can\'t deactivate yourself.' }
  if (!reassignTo || reassignTo === id) return { error: 'Choose who takes over their open work.' }
  if (!me.is_director) {
    const { data: t } = await createAdminClient().from('team_members').select('is_director').eq('id', id).maybeSingle()
    if (t?.is_director) return { error: "Only the Executive Director can step down. A system admin can't deactivate them." }
  }

  const admin = createAdminClient()
  const [{ data: leaver }, { data: heir }] = await Promise.all([
    admin.from('team_members').select('id, full_name, role, reports_to').eq('id', id).maybeSingle(),
    admin.from('team_members').select('id, full_name, active').eq('id', reassignTo).maybeSingle(),
  ])
  if (!leaver) return { error: 'Member not found.' }
  if (leaver.role === 'super_admin' && !isTop(me)) return { error: 'Only a system admin can deactivate a system admin.' }
  if (!heir?.active) return { error: 'The person taking over must be an active member.' }

  if (leaver.role === 'super_admin') {
    const { count } = await admin.from('team_members').select('id', { count: 'exact', head: true }).eq('role', 'super_admin').eq('active', true)
    if ((count ?? 0) <= 1) return { error: 'This is the only active Super Admin. Promote someone else first.' }
  }

  const open = ['not_started', 'in_progress', 'needs_revision', 'submitted', 'under_review']
  const { data: moved } = await admin.from('tasks')
    .update({ assignee_id: reassignTo }).eq('assignee_id', id).in('status', open).select('id, title')
  const { data: reviewed } = await admin.from('tasks')
    .update({ assigned_by: reassignTo }).eq('assigned_by', id).in('status', open).select('id')
  await admin.from('projects').update({ owner_id: reassignTo }).eq('owner_id', id)
  await admin.from('team_members').update({ reports_to: leaver.reports_to }).eq('reports_to', id)
  await admin.from('project_members').delete().eq('member_id', id)

  if ((moved ?? []).length > 0) {
    await admin.from('notifications').insert((moved ?? []).map((t) => ({
      recipient_id: reassignTo, kind: 'task_assigned', title: 'Task handed to you',
      body: `"${t.title}" was reassigned to you because ${leaver.full_name} is no longer on the team.`,
      link: `/tasks/${t.id}`,
    })))
  }

  const { error: banErr } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })
  if (banErr) return { error: banErr.message }
  const { error } = await admin.from('team_members').update({ active: false }).eq('id', id)
  if (error) return { error: error.message }

  await log(me.id, 'member.deactivated', 'member', id,
    `${me.full_name} deactivated ${leaver.full_name}; ${(moved ?? []).length} open task(s) went to ${heir.full_name}`,
    'active', 'true', 'false')
  revalidatePath('/', 'layout')
  return {
    ok: `${leaver.full_name} is deactivated and can no longer sign in. ${(moved ?? []).length} open task(s) and ${(reviewed ?? []).length} review duty(ies) moved to ${heir.full_name}. Their history is kept.`,
  }
}

export async function reactivateMember(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  deliverSoon()
  const me = await requireScope('admin.people')
  const id = String(formData.get('id') ?? '')
  const admin = createAdminClient()
  const { data: who } = await admin.from('team_members').select('role').eq('id', id).maybeSingle()
  if (who?.role === 'super_admin' && !isTop(me)) return { error: 'Only a system admin can reactivate a system admin.' }
  const { error: banErr } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
  if (banErr) return { error: banErr.message }
  const { data, error } = await admin.from('team_members').update({ active: true }).eq('id', id).select('full_name')
  if (error) return { error: error.message }
  await log(me.id, 'member.reactivated', 'member', id, `${me.full_name} reactivated ${data?.[0]?.full_name ?? 'a member'}`, 'active', 'false', 'true')
  revalidatePath('/', 'layout')
  return { ok: 'Reactivated. They can sign in again with their existing password (or use Reset access).' }
}

export async function addDepartment(formData: FormData) {
  deliverSoon()
  const me = await requireScope('admin.departments')
  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) return
  const admin = createAdminClient()
  const { data } = await admin.from('departments').insert({ name }).select('id')
  if (data?.[0]) await log(me.id, 'department.created', 'department', data[0].id, `${me.full_name} created the ${name} department`)
  revalidatePath('/admin')
}

/** Saves the "Access & delegation" panel for one person. */
export async function saveGrants(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  deliverSoon()
  const me = await requireMember()
  const id = String(formData.get('member_id') ?? '')
  const error = await applyGrants(me, id, formData)
  if (error) return { error }
  revalidatePath('/', 'layout')
  return { ok: 'Access updated. It applies immediately.' }
}
