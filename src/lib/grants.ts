import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasScope } from '@/lib/permissions'
import { ADMIN_SCOPES, CAPABILITIES } from '@/lib/capabilities'
import { localInputToIso } from '@/lib/time'
import type { TeamMember } from '@/lib/types'

/** Who may delegate access: system admins, the Executive Director, and anyone holding the Permissions slice. */
export async function canDelegate(actor: TeamMember): Promise<boolean> {
  return actor.role === 'super_admin' || actor.is_director || (await hasScope(actor, 'admin.permissions'))
}

/**
 * Applies the "Access & delegation" form to one person: a value for each capability
 * (default / allow / deny) plus any slices of system administration, with an optional end date.
 * Returns an error message, or null on success.
 *
 * Guard rails: nobody widens their own access unless they are a system admin or the Director, and only
 * system admins and the Director can hand out the Permissions slice itself, so it can't be passed along.
 */
export async function applyGrants(actor: TeamMember, memberId: string, fd: FormData): Promise<string | null> {
  if (fd.get('grants_present') !== '1') return null    // this form didn't include the access panel
  if (!(await canDelegate(actor))) return "You don't have permission to change what people can do."

  const topLevel = actor.role === 'super_admin' || actor.is_director
  if (actor.id === memberId && !topLevel) return "You can't change your own access."

  const admin = createAdminClient()
  const { data: target } = await admin.from('team_members').select('id, full_name, role').eq('id', memberId).maybeSingle()
  if (!target) return 'Member not found.'
  // A system admin already has everything; there is nothing to delegate to them.
  if (target.role === 'super_admin') return null

  const untilRaw = String(fd.get('until') ?? '')
  const expires = untilRaw ? localInputToIso(`${untilRaw}T23:59`) : null
  if (untilRaw && (!expires || new Date(expires).getTime() <= Date.now())) return 'The end date must be in the future.'

  const rows: { member_id: string; capability: string; allowed: boolean; granted_by: string; expires_at: string | null }[] = []
  for (const c of CAPABILITIES) {
    const v = String(fd.get(`cap.${c.id}`) ?? 'default')
    if (v === 'allow' || v === 'deny') rows.push({ member_id: memberId, capability: c.id, allowed: v === 'allow', granted_by: actor.id, expires_at: expires })
  }
  for (const s of ADMIN_SCOPES) {
    if (fd.get(`scope.${s.id}`) !== 'on') continue
    if (s.id === 'admin.permissions' && !topLevel) continue     // can't be passed along by someone who only holds it
    rows.push({ member_id: memberId, capability: s.id, allowed: true, granted_by: actor.id, expires_at: expires })
  }

  // Replace everything this form manages (capabilities and slices), then write what was chosen.
  const managed = [...CAPABILITIES.map((c) => c.id as string), ...ADMIN_SCOPES.map((s) => s.id as string)]
  // Someone who isn't top-level can't remove a Permissions slice that was granted above them either.
  const removable = topLevel ? managed : managed.filter((id) => id !== 'admin.permissions')
  await admin.from('member_grants').delete().eq('member_id', memberId).in('capability', removable)
  if (rows.length > 0) {
    const { error } = await admin.from('member_grants').insert(rows)
    if (error) return error.message
  }

  const summary = rows.length === 0
    ? `${actor.full_name} reset ${target.full_name}'s access to their level's defaults`
    : `${actor.full_name} set custom access for ${target.full_name} (${rows.length} item${rows.length === 1 ? '' : 's'}${expires ? `, until ${untilRaw}` : ''})`
  await admin.rpc('log_activity', {
    p_actor: actor.id, p_action: 'member.access_changed', p_type: 'member', p_id: memberId,
    p_summary: summary, p_field: null, p_from: null, p_to: null, p_project: null,
  })
  return null
}
