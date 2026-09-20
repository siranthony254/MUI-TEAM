import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getShell } from '@/lib/shell'
import type { TeamMember, TeamRole } from '@/lib/types'

/** The signed-in team member, or null if signed out / not invited / deactivated. */
export const getMember = cache(async (): Promise<TeamMember | null> => {
  const shell = await getShell()
  if (!shell?.member || !shell.member.active) return null
  return { ...shell.member, directed_departments: shell.directed }
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

/** Whole-organisation view: system admins and the Executive Director. */
export const hasOrgView = (m: TeamMember) => m.role === 'super_admin' || m.is_director

/** The Executive Director only (official announcements, delegating admin access). */
export async function requireDirector(): Promise<TeamMember> {
  const member = await requireMember()
  if (!member.is_director) redirect('/')
  return member
}

/** System admins and the Executive Director (e.g. campaigns). */
export async function requireAdminOrDirector(): Promise<TeamMember> {
  const member = await requireMember()
  if (member.role !== 'super_admin' && !member.is_director) redirect('/')
  return member
}
