'use server'

import { revalidatePath } from 'next/cache'
import { requireDirector } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'

export interface DirectorState { error?: string; ok?: string }

async function log(actor: string, action: string, id: string, summary: string, from?: string, to?: string) {
  await createAdminClient().rpc('log_activity', {
    p_actor: actor, p_action: action, p_type: 'member', p_id: id, p_summary: summary,
    p_field: from || to ? 'role' : null, p_from: from ?? null, p_to: to ?? null, p_project: null,
  })
}

/**
 * Delegate system-admin access to a secretary or another executive, optionally until a date,
 * so the initiative keeps running while the Executive Director is away.
 */
export async function grantAdmin(_prev: DirectorState | undefined, fd: FormData): Promise<DirectorState> {
  const me = await requireDirector()
  const memberId = String(fd.get('member_id') ?? '')
  const untilRaw = String(fd.get('until') ?? '')
  if (!memberId) return { error: 'Choose who to delegate to.' }
  if (memberId === me.id) return { error: 'You already hold the highest authority; delegate to someone else.' }

  // End of the chosen day, Nairobi time.
  const until = untilRaw ? localInputToIso(`${untilRaw}T23:59`) : null
  if (until && new Date(until).getTime() <= Date.now()) return { error: 'The end date must be in the future.' }

  const admin = createAdminClient()
  const { data: target } = await admin.from('team_members').select('id, full_name, role, active').eq('id', memberId).maybeSingle()
  if (!target || !target.active) return { error: 'That person isn\'t an active team member.' }
  if (target.role === 'super_admin') return { error: `${target.full_name} already has system-admin access.` }

  const { error } = await admin.from('team_members').update({
    role: 'super_admin', role_before_admin: target.role, admin_until: until, admin_granted_by: me.id,
  }).eq('id', memberId)
  if (error) return { error: error.message }

  await admin.from('notifications').insert({
    recipient_id: memberId, kind: 'admin_granted', title: 'You now have system-admin access',
    body: `${me.full_name} delegated system administration to you${until ? ` until ${untilRaw}` : ''}.`, link: '/admin',
  })
  await log(me.id, 'member.admin_granted', memberId,
    `${me.full_name} delegated system-admin access to ${target.full_name}${until ? ` until ${untilRaw}` : ''}`, target.role, 'super_admin')
  deliverSoon()
  revalidatePath('/', 'layout')
  return { ok: `${target.full_name} can now run the system${until ? ` until ${untilRaw}` : ' until you revoke it'}.` }
}

export async function revokeAdmin(fd: FormData) {
  const me = await requireDirector()
  const memberId = String(fd.get('member_id') ?? '')
  const admin = createAdminClient()
  const { data: t } = await admin.from('team_members')
    .select('id, full_name, role, role_before_admin, admin_granted_by').eq('id', memberId).maybeSingle()
  // Only delegated access can be revoked here; the platform account is managed in System admin.
  if (!t || t.role !== 'super_admin' || !t.admin_granted_by) return

  const back = t.role_before_admin ?? 'member'
  await admin.from('team_members').update({
    role: back, role_before_admin: null, admin_until: null, admin_granted_by: null,
  }).eq('id', memberId)
  await log(me.id, 'member.admin_revoked', memberId, `${me.full_name} ended ${t.full_name}'s delegated system-admin access`, 'super_admin', back)
  revalidatePath('/', 'layout')
}
