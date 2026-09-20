import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { channelEnabled, normalizePhone, sendEmail, sendPush, sendSms, type PushSub } from './channels'
import { channelOn, groupOfKind, parseMandatory, type PrefRow } from './groups'


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
  channels: string[] | null
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
  spawned: number
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

  let reminders = 0
  let spawned = 0
  try {
    // Recurring tasks first, so the new occurrence can be reminded about in the same run.
    const { data: rec } = await admin.from('org_settings').select('value').eq('key', 'recurring_enabled').maybeSingle()
    if (rec?.value !== 'false') {
      const { data: made } = await admin.rpc('spawn_recurring_tasks')
      spawned = (made as number | null) ?? 0
    }
    // Housekeeping first: delegated admin access that has run out, and announcements whose time has come.
    await admin.rpc('expire_admin_delegations')
    await admin.rpc('publish_due_announcements')
    await admin.rpc('generate_meeting_reminders')
    const { data: reminderCount } = await admin.rpc('generate_task_reminders')
    reminders = (reminderCount as number | null) ?? 0
    const result = await dispatchPending()
    await admin.from('system_runs').insert({ reminders, spawned, sent: result.sent, failed: result.failed })
    return { ...result, reminders, spawned }
  } catch (err) {
    await admin.from('system_runs').insert({
      reminders, spawned, error: err instanceof Error ? err.message.slice(0, 500) : 'unknown error',
    })
    throw err
  }
}

export async function dispatchPending(): Promise<Omit<DispatchResult, "reminders" | "spawned">> {
  const admin = createAdminClient()
  const out = { processed: 0, sent: { email: 0, push: 0, sms: 0 }, failed: 0 }

  const since = new Date(Date.now() - MAX_AGE_MS).toISOString()
  const { data } = await admin
    .from('notifications')
    .select(
      'id, recipient_id, kind, title, body, link, delivery_attempts, channels, email_sent_at, push_sent_at, sms_sent_at, ' +
      'recipient:team_members!notifications_recipient_id_fkey(full_name, email, phone, active, notify_email, notify_push, notify_sms)',
    )
    .gte('created_at', since)
    .lt('delivery_attempts', MAX_ATTEMPTS)
    .or('email_sent_at.is.null,push_sent_at.is.null,sms_sent_at.is.null')
    .order('created_at', { ascending: true })
    .limit(BATCH)

  const rows = (data ?? []) as unknown as Row[]

  // Per-person, per-event preferences, and the events the organisation has made mandatory.
  const recipientIds = [...new Set(rows.map((r) => r.recipient_id))]
  const [{ data: prefRows }, { data: mandatoryRow }] = await Promise.all([
    recipientIds.length
      ? admin.from('notification_prefs').select('member_id, event_group, in_app, email, push, sms').in('member_id', recipientIds)
      : Promise.resolve({ data: [] as (PrefRow & { member_id: string })[] }),
    admin.from('org_settings').select('value').eq('key', 'mandatory_groups').maybeSingle(),
  ])
  const mandatory = parseMandatory(mandatoryRow?.value)
  const prefsBy = new Map<string, Map<string, PrefRow>>()
  for (const p of (prefRows ?? []) as (PrefRow & { member_id: string })[]) {
    if (!prefsBy.has(p.member_id)) prefsBy.set(p.member_id, new Map())
    prefsBy.get(p.member_id)!.set(p.event_group, p)
  }

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

    // A sender can narrow the channels for an assignment/delegation; the recipient's own
    // opt-ins still apply on top (nobody gets SMS without opting in and having a number).
    const allowed = (ch: Channel) => !row.channels || row.channels.includes(ch)
    // The recipient's event settings (a mandatory event cannot be switched off).
    const group = groupOfKind(row.kind)
    const myPrefs = prefsBy.get(row.recipient_id) ?? new Map<string, PrefRow>()
    const eventWants = (ch: 'email' | 'push' | 'sms') => channelOn(group, ch, myPrefs, mandatory)

    await run('email', allowed('email') && eventWants('email') && !!who?.notify_email && !!who?.email, () => sendEmail(who!.email, who!.full_name, msg))

    const phone = normalizePhone(who?.phone ?? null)
    // SMS costs money: only when the event is set to text (or the sender explicitly chose SMS, or it's urgent).
    const smsWorthy = eventWants('sms') || !!row.channels?.includes('sms') || row.kind === 'announcement_urgent'
    await run('sms', allowed('sms') && !!who?.notify_sms && !!phone && smsWorthy, () => sendSms(phone!, msg))

    await run('push', allowed('push') && eventWants('push') && !!who?.notify_push, async () => {
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
