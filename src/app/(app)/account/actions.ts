'use server'

import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function changePassword(
  _prev: { error?: string; ok?: string } | undefined,
  formData: FormData,
) {
  await requireMember()
  const password = String(formData.get('password') ?? '')
  if (password.length < 10) return { error: 'Use at least 10 characters.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  return { ok: 'Password updated.' }
}
