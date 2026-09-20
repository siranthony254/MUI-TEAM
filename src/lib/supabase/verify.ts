import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface Verified {
  user: User | null
  /** True when we could not reach the auth server (network / 5xx / rate limit), as opposed to "not signed in". */
  unavailable: boolean
}

/**
 * Asks Supabase who the caller is, retrying briefly on transient failures. A network hiccup must not
 * be mistaken for "signed out", or people get bounced to the login screen at random.
 */
export async function verifyUser(supabase: SupabaseClient, attempts = 3): Promise<Verified> {
  for (let i = 0; i < attempts; i++) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (user) return { user, unavailable: false }
      const status = (error as { status?: number } | null)?.status
      const transient = !!error && (error.name === 'AuthRetryableFetchError' || (typeof status === 'number' && (status >= 500 || status === 429)))
      if (!transient) return { user: null, unavailable: false }   // genuinely no valid session
    } catch {
      // thrown network error: treat as transient
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 200 * (i + 1)))
  }
  return { user: null, unavailable: true }
}
