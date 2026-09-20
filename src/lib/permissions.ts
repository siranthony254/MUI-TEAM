import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExecOrAbove } from '@/lib/auth'
import { getShell } from '@/lib/shell'
import type { TeamMember } from '@/lib/types'

export * from '@/lib/capabilities'
import { ADMIN_SCOPES, CAPABILITIES, DEFAULT_MATRIX, type Capability, type EditableLevel, type Level, type Matrix, type Scope } from '@/lib/capabilities'

export function levelOf(me: TeamMember): Level {
  if (me.role === 'super_admin') return 'super_admin'
  if (me.role === 'guest') return 'guest'
  if (me.role === 'executive') return 'executive'
  return (me.directed_departments?.length ?? 0) > 0 ? 'department_director' : 'member'
}

export const getMatrix = cache(async (): Promise<Matrix> => {
  const shell = await getShell()
  const m: Matrix = JSON.parse(JSON.stringify(DEFAULT_MATRIX))
  for (const r of shell?.matrix ?? []) {
    if (r.level in m && r.capability in m.executive) m[r.level as EditableLevel][r.capability as Capability] = !!r.allowed
  }
  return m
})

/** Every capability for this person in one go (system admins have all; the Director is an executive). */
export const getCaps = cache(async (me: TeamMember): Promise<Record<Capability, boolean>> => {
  const level = levelOf(me)
  const all = Object.fromEntries(CAPABILITIES.map((c) => [c.id, true])) as Record<Capability, boolean>
  const none = Object.fromEntries(CAPABILITIES.map((c) => [c.id, false])) as Record<Capability, boolean>
  if (level === 'super_admin') return all
  if (level === 'guest') return none
  const caps = { ...(await getMatrix())[level] }
  // Per-person grants and denials sit on top of the level (expired ones are ignored).
  for (const g of await getGrants(me.id)) {
    if (g.capability in caps) caps[g.capability as Capability] = g.allowed
  }
  // The Executive Director always runs campaigns, whatever the settings say.
  if (me.is_director) caps.send_campaign = true
  return caps
})

/** This person's live (unexpired) grants. Reads their own rows, which the database allows. */
export const getGrants = cache(async (memberId: string) => {
  const shell = await getShell()
  if (shell && shell.user.id === memberId) return shell.grants     // already fetched (and already unexpired)
  const supabase = await createClient()
  const { data } = await supabase.from('member_grants').select('capability, allowed, expires_at').eq('member_id', memberId)
  const now = Date.now()
  return (data ?? []).filter((g) => !g.expires_at || new Date(g.expires_at).getTime() > now)
})

/** Which slices of system administration this person holds. System admins hold them all. */
export const getScopes = cache(async (me: TeamMember): Promise<Set<Scope>> => {
  if (me.role === 'super_admin' || me.is_director) return new Set(ADMIN_SCOPES.map((s) => s.id))
  if (me.role === 'guest') return new Set()
  const held = (await getGrants(me.id)).filter((g) => g.allowed && g.capability.startsWith('admin.')).map((g) => g.capability as Scope)
  return new Set(held.filter((c) => ADMIN_SCOPES.some((s) => s.id === c)))
})

export async function hasScope(me: TeamMember, scope: Scope): Promise<boolean> {
  return (await getScopes(me)).has(scope)
}

export async function can(me: TeamMember, capability: Capability): Promise<boolean> {
  return (await getCaps(me))[capability]
}

/**
 * The client to write with. Executives use their own session (the database's row-level security
 * applies as usual). A department director or member who has been *granted* a capability writes
 * through the server key instead, so callers must set created_by/author fields themselves.
 */
export async function dbFor(me: TeamMember): Promise<SupabaseClient> {
  return isExecOrAbove(me) ? await createClient() : createAdminClient()
}

import { redirect } from 'next/navigation'
import { requireMember } from '@/lib/auth'

/** Page/action guard: the signed-in member must hold this capability. */
export async function requireCap(capability: Capability): Promise<TeamMember> {
  const me = await requireMember()
  if (!(await can(me, capability))) redirect('/')
  return me
}

/** Page/action guard for a slice of system administration. */
export async function requireScope(scope: Scope): Promise<TeamMember> {
  const me = await requireMember()
  if (!(await hasScope(me, scope))) redirect('/')
  return me
}

/** For the System admin landing page: anyone holding at least one slice. */
export async function requireAnyAdmin(): Promise<{ me: TeamMember; scopes: Set<Scope> }> {
  const me = await requireMember()
  const scopes = await getScopes(me)
  if (scopes.size === 0) redirect('/')
  return { me, scopes }
}
