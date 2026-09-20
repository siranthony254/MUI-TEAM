import 'server-only'
import { after } from 'next/server'
import { dispatchPending } from './dispatch'

/**
 * Deliver freshly-created notifications right after the response is sent,
 * instead of waiting for the next scheduled run. Failures are non-fatal: the
 * scheduled run will pick anything left behind.
 */
export function deliverSoon() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  after(async () => {
    try {
      await dispatchPending()
    } catch (err) {
      console.error('[notify] deliverSoon failed:', err)
    }
  })
}
