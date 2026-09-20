import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TeamMember, TeamRole } from '@/lib/types'

/** The signed-in team member, or null if signed out / not invited. */
export const getMember = cache(async (): Promise<TeamMember | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', user.id)
    .eq('active', true)
    .maybeSingle()
  return (data as TeamMember | null) ?? null
})

export async function requireMember(): Promise<TeamMember> {
  const member = await getMember()
  if (!member) redirect('/login?error=not-invited')
  return member
}

export async function requireRole(...roles: TeamRole[]): Promise<TeamMember> {
  const member = await requireMember()
  if (!roles.includes(member.role)) redirect('/')
  return member
}

export const isExecOrAbove = (m: TeamMember) => m.role === 'super_admin' || m.role === 'executive'
