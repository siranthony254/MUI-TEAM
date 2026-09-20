'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/notify/phone'
import { GROUPS, parseMandatory } from '@/lib/notify/groups'

interface State { error?: string; ok?: string }

export async function changePassword(_prev: State | undefined, formData: FormData): Promise<State> {
  await requireMember()
  const password = String(formData.get('password') ?? '')
  if (password.length < 10) return { error: 'Use at least 10 characters.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  return { ok: 'Password updated.' }
}

export async function saveNotificationPrefs(_prev: State | undefined, formData: FormData): Promise<State> {
  await requireMember()
  const sms = formData.get('notify_sms') === 'on'
  const rawPhone = String(formData.get('phone') ?? '').trim()
  const phone = normalizePhone(rawPhone)

  if (rawPhone && !phone) return { error: 'That phone number doesn\'t look right. Use e.g. 0712 345 678 or +254712345678.' }
  if (sms && !phone) return { error: 'Add a phone number to receive SMS.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_my_notification_prefs', {
    p_email: formData.get('notify_email') === 'on',
    p_push: formData.get('notify_push') === 'on',
    p_sms: sms,
    p_phone: phone ?? '',
  })
  if (error) return { error: error.message }

  revalidatePath('/account')
  return { ok: 'Preferences saved.' }
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const me = await requireMember()
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return { error: 'Invalid subscription.' }

  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { member_id: me.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { onConflict: 'endpoint' },
  )
  return error ? { error: error.message } : {}
}

export async function removePushSubscription(endpoint: string) {
  const me = await requireMember()
  const supabase = await createClient()
  await supabase.from('push_subscriptions').delete().eq('member_id', me.id).eq('endpoint', endpoint)
}

/** The per-event matrix: which channels each kind of event may use for this person. */
export async function saveNotificationMatrix(_prev: State | undefined, formData: FormData): Promise<State> {
  const me = await requireMember()
  const supabase = await createClient()
  const { data: setting } = await supabase.from('org_settings').select('value').eq('key', 'mandatory_groups').maybeSingle()
  const mandatory = parseMandatory(setting?.value)

  const rows = GROUPS.map((g) => {
    const on = (ch: string) => formData.get(`${g.id}.${ch}`) === 'on'
    const locked = mandatory.includes(g.id)
    return {
      member_id: me.id, event_group: g.id,
      in_app: locked || on('in_app'), email: locked || on('email'), push: locked || on('push'), sms: on('sms'),
    }
  })
  const { error } = await supabase.from('notification_prefs').upsert(rows, { onConflict: 'member_id,event_group' })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { ok: 'Notification settings saved.' }
}
