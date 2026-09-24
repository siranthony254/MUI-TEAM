import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ActivationStatus {
  invitedAt: string | null
  firstSignInAt: string | null
  emailConfirmedAt: string | null
}

/** One person's real activation status, straight from Supabase Auth — not just "their profile row exists." */
export async function getActivationStatus(memberId: string): Promise<ActivationStatus | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(memberId)
  if (error || !data?.user) return null
  return { invitedAt: data.user.created_at ?? null, firstSignInAt: data.user.last_sign_in_at ?? null, emailConfirmedAt: data.user.email_confirmed_at ?? null }
}

/** The same, for everyone at once — one API call instead of one per person, for a list view. */
export async function getActivationStatusMap(memberIds: string[]): Promise<Map<string, ActivationStatus>> {
  const admin = createAdminClient()
  const wanted = new Set(memberIds)
  const map = new Map<string, ActivationStatus>()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data) break
    for (const u of data.users) {
      if (wanted.has(u.id)) map.set(u.id, { invitedAt: u.created_at ?? null, firstSignInAt: u.last_sign_in_at ?? null, emailConfirmedAt: u.email_confirmed_at ?? null })
    }
    if (data.users.length < 200 || map.size === wanted.size) break
    page += 1
  }
  return map
}
