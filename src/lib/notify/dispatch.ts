import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { channelEnabled, normalizePhone, sendEmail, sendPush, sendSms, type PushSub } from './channels'

/** SMS costs money: only these kinds are worth a text. */
const SMS_KINDS = new Set(['due_today', 'overdue', 'overdue_1d', 'overdue_escalation'])

const MAX_ATTEMPTS = 3
const BATCH = 100
/** Never deliver anything older than this (e.g. after downtime or first enabling a channel). */
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

type Channel = 'email' | 'push' | 'sms'
const COLUMN: Record<Channel, string> = {
  email: 'email_sent_at',
  push: 'push_sent_at',
  sms: 'sms_sent_at',
}

interface Row {
  id: string
  recipient_id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  delivery_attempts: number
  email_sent_at: string | null
  push_sent_at: string | null
  sms_sent_at: string | null
  recipient: {
    full_name: string
    email: string
    phone: string | null
    active: boolean
    notify_email: boolean
    notify_push: boolean
    notify_sms: boolean
  } | null
}

export interface DispatchResult {
  reminders: number
  processed: number
  sent: Record<Channel, number>
  failed: number
}

/**
 * Generates any due reminders, then delivers pending notifications over each
 * enabled channel the recipient wants. Safe to call concurrently: each channel
 * is claimed with a conditional update before sending, and released on failure.
 */
export async function runDispatch(): Promise<DispatchResult> {
  const admin = createAdminClient()

  const { data: reminderCount } = await admin.rpc('generate_task_reminders')
  const result = await dispatchPending()
  return { ...result, reminders: (reminderCount as number | null) ?? 0 }
}

export async function dispatchPending(): Promise<Omit<DispatchResult, 'reminders'>> {
  const admin = createAdminClient()
  const out = { processed: 0, sent: { email: 0, push: 0, sms: 0 }, failed: 0 }

  const since = new Date(Date.now() - MAX_AGE_MS).toISOString()
  const { data } = await admin
    .from('notifications')
    .select(
      'id, recipient_id, kind, title, body, link, delivery_attempts, email_sent_at, push_sent_at, sms_sent_at, ' +
      'recipient:team_members!notifications_recipient_id_fkey(full_name, email, phone, active, notify_email, notify_push, notify_sms)',
    )
    .gte('created_at', since)
    .lt('delivery_attempts', MAX_ATTEMPTS)
    .or('email_sent_at.is.null,push_sent_at.is.null,sms_sent_at.is.null')
    .order('created_at', { ascending: true })
    .limit(BATCH)

  const rows = (data ?? []) as unknown as Row[]

  for (const row of rows) {
    out.processed++
    const who = row.recipient
    const msg = { title: row.title, body: row.body, link: row.link }

    /** Claim a channel; returns false if another run already took it. */
    const claim = async (ch: Channel) => {
      const { data: won } = await admin
        .from('notifications')
        .update({ [COLUMN[ch]]: new Date().toISOString() })
        .eq('id', row.id)
        .is(COLUMN[ch], null)
        .select('id')
      return (won ?? []).length > 0
    }
    const release = (ch: Channel) =>
      admin.from('notifications').update({ [COLUMN[ch]]: null }).eq('id', row.id)

    const run = async (ch: Channel, wanted: boolean, send: () => Promise<void>) => {
      if (row[COLUMN[ch] as keyof Row]) return // already handled
      // Skipped by preference / config / missing contact detail: mark handled.
      if (!who || !who.active || !wanted || !channelEnabled[ch]()) {
        await claim(ch)
        return
      }
      if (!(await claim(ch))) return
      try {
        await send()
        out.sent[ch]++
      } catch (err) {
        out.failed++
        console.error(`[notify] ${ch} failed for ${row.id}:`, err instanceof Error ? err.message : err)
        await release(ch)
        await admin.from('notifications')
          .update({ delivery_attempts: row.delivery_attempts + 1 }).eq('id', row.id)
      }
    }

    await run('email', !!who?.notify_email && !!who?.email, () => sendEmail(who!.email, who!.full_name, msg))

    const phone = normalizePhone(who?.phone ?? null)
    await run('sms', !!who?.notify_sms && !!phone && SMS_KINDS.has(row.kind), () => sendSms(phone!, msg))

    await run('push', !!who?.notify_push, async () => {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, member_id')
        .eq('member_id', row.recipient_id)
      for (const s of (subs ?? []) as (PushSub & { member_id: string })[]) {
        const alive = await sendPush(s, msg)
        if (!alive) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    })

  }
  return out
}
