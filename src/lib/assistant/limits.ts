import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Gemini's free tier is 250 requests/day for the whole app, shared by everyone. These stay well
// under that with room to spare, and share it fairly rather than letting one person use it all up.
const PER_PERSON_DAILY = 15
const APP_WIDE_DAILY = 180

export interface LimitCheck { ok: boolean; reason?: string }

/** Checks and, if allowed, records one use. Fails open only if the check itself errors (never blocks on our own bug). */
export async function claimAssistantUse(memberId: string): Promise<LimitCheck> {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: appRows }, { data: mine }] = await Promise.all([
    admin.from('assistant_usage').select('count').eq('day', today),
    admin.from('assistant_usage').select('count').eq('member_id', memberId).eq('day', today).maybeSingle(),
  ])
  const appSum = (appRows ?? []).reduce((n, r) => n + r.count, 0)

  if (appSum >= APP_WIDE_DAILY) return { ok: false, reason: "The assistant has reached its shared daily limit — it resets tomorrow. Sorry about that." }
  if ((mine?.count ?? 0) >= PER_PERSON_DAILY) return { ok: false, reason: `You've reached today's limit of ${PER_PERSON_DAILY} questions — it resets tomorrow.` }

  await admin.from('assistant_usage').upsert(
    { member_id: memberId, day: today, count: (mine?.count ?? 0) + 1 },
    { onConflict: 'member_id,day' },
  )
  return { ok: true }
}
