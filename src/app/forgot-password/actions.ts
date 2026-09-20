'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export interface ResetState { error?: string; ok?: string }

/**
 * Sends a password-reset email. The answer is always the same, whether or not the address has an
 * account, so this can't be used to discover who is on the team.
 */
export async function requestReset(_prev: ResetState | undefined, fd: FormData): Promise<ResetState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter the email address you sign in with.' }

  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`)

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` })
  return { ok: 'If that address belongs to a team member, a reset link is on its way. It can take a few minutes; check spam too.' }
}
