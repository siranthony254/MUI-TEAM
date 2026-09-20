'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/notify/phone'

/**
 * Sign in with an email address or a phone number. A phone number is matched to the member's
 * registered email, then the normal password sign-in runs. The error is the same whichever part
 * was wrong, so it can't be used to discover who has an account.
 */
export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!identifier || !password) return { error: 'Enter your email or phone number, and your password.' }

  let email = identifier.toLowerCase()
  if (!identifier.includes('@')) {
    const phone = normalizePhone(identifier)
    if (!phone || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Incorrect email/phone or password.' }
    const { data } = await createAdminClient()
      .from('team_members').select('email').eq('phone', phone).eq('active', true).limit(2)
    // Only if exactly one person has that number; otherwise fall through to the generic error.
    if (!data || data.length !== 1) return { error: 'Incorrect email/phone or password.' }
    email = data[0].email
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Incorrect email/phone or password.' }
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
