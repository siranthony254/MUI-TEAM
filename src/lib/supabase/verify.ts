import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuthUser { id: string; email?: string }

export interface Verified {
  user: AuthUser | null
  /** True when we could not reach the auth server (network / 5xx / rate limit), as opposed to "not signed in". */
  unavailable: boolean
}

/**
 * Who is calling? Uses `getClaims()`, which checks the session token's signature locally against cached public
 * keys, so a normal page view needs no round trip to the auth server (it only calls out to refresh an expired
 * token). If that isn't possible it falls back to asking the server, retrying briefly on transient failures,
 * so a network hiccup is never mistaken for "signed out".
 */
export async function verifyUser(supabase: SupabaseClient, attempts = 3): Promise<Verified> {
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase.auth.getClaims()
      const claims = data?.claims as { sub?: string; email?: string } | undefined
      if (claims?.sub) return { user: { id: claims.sub, email: claims.email }, unavailable: false }
      if (!error) return { user: null, unavailable: false }          // no session: genuinely signed out
    } catch {
      // fall through to the server check below
    }
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (user) return { user: { id: user.id, email: user.email }, unavailable: false }
      const status = (error as { status?: number } | null)?.status
      const transient = !!error && (error.name === 'AuthRetryableFetchError' || (typeof status === 'number' && (status >= 500 || status === 429)))
      if (!transient) return { user: null, unavailable: false }
    } catch {
      // thrown network error: treat as transient
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 200 * (i + 1)))
  }
  return { user: null, unavailable: true }
}
