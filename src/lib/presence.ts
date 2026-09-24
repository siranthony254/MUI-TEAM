import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Anything more frequent than this is pointless (nobody needs minute-by-minute precision) and
// would just be a write on every single page load.
const THROTTLE_MS = 10 * 60 * 1000

/**
 * Records that this person actually opened the app — the one signal an admin has no other way
 * to get. Fires after the response is sent, so it never slows the page down, and only actually
 * writes once every 10 minutes per person at most.
 */
export function touchPresence(memberId: string, lastSeenAt: string | null) {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < THROTTLE_MS) return
  after(async () => {
    try {
      await createAdminClient().from('team_members').update({ last_seen_at: new Date().toISOString() }).eq('id', memberId)
    } catch (err) {
      console.error('[presence] touchPresence failed:', err)
    }
  })
}
