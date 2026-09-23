import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// gemini-3.6-flash's free tier is roughly 20 requests/day for the whole app (shared by everyone,
// not per person) — much tighter than older models. Kept just under that, and capped per person
// so one heavy user can't use up the whole team's daily budget by themselves.
const PER_PERSON_DAILY = 4
const APP_WIDE_DAILY = 18

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
