import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExecOrAbove } from '@/lib/auth'
import type { TeamMember } from '@/lib/types'

export * from '@/lib/capabilities'
import { CAPABILITIES, DEFAULT_MATRIX, type Capability, type EditableLevel, type Level, type Matrix } from '@/lib/capabilities'

export function levelOf(me: TeamMember): Level {
  if (me.role === 'super_admin') return 'super_admin'
  if (me.role === 'guest') return 'guest'
  if (me.role === 'executive') return 'executive'
  return (me.directed_departments?.length ?? 0) > 0 ? 'department_director' : 'member'
}

export const getMatrix = cache(async (): Promise<Matrix> => {
  const supabase = await createClient()
  const { data } = await supabase.from('role_permissions').select('level, capability, allowed')
  const m: Matrix = JSON.parse(JSON.stringify(DEFAULT_MATRIX))
  for (const r of data ?? []) {
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
  // The Executive Director always runs campaigns, whatever the executive setting says.
  if (me.is_director) caps.send_campaign = true
  return caps
})

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
