import 'server-only'
import webpush from 'web-push'

export { normalizePhone } from './phone'

/** Each channel is active only when its env vars are present. */
export const channelEnabled = {
  email: () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM,
  sms: () => !!process.env.AT_USERNAME && !!process.env.AT_API_KEY,
  push: () =>
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY &&
    !!process.env.VAPID_SUBJECT,
}

export interface Message {
  title: string
  body: string | null
  /** In-app path, e.g. /tasks/123 */
  link: string | null
}

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
const absolute = (link: string | null) => `${appUrl()}${link ?? '/notifications'}`

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// --------------------------------------------------------------------------
// Email — Resend REST API
// --------------------------------------------------------------------------
export async function sendEmail(to: string, name: string, m: Message) {
  const url = absolute(m.link)
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#0D1F35;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:.05em">MUI TEAM</div>
    <div style="background:#fff;padding:24px 20px;border-radius:0 0 12px 12px">
      <p style="margin:0 0 4px;color:#666;font-size:13px">Hi ${escapeHtml(name.split(' ')[0])},</p>
      <h1 style="margin:0 0 12px;font-size:20px;color:#0D1F35">${escapeHtml(m.title)}</h1>
      ${m.body ? `<p style="margin:0 0 20px;color:#333;font-size:15px;line-height:1.5">${escapeHtml(m.body)}</p>` : ''}
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#f59e0b;color:#0D1F35;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px">Open in MUI Team</a>
    </div>
  </div></body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject: m.title,
      html,
      text: `${m.title}\n\n${m.body ?? ''}\n\n${url}`,
    }),
  })
  if (!res.ok) throw new Error(`email ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// --------------------------------------------------------------------------
// SMS — Africa's Talking (Kenya). Set AT_USERNAME=sandbox to test.
// --------------------------------------------------------------------------
export async function sendSms(to: string, m: Message) {
  const username = process.env.AT_USERNAME!
  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com'
  const form = new URLSearchParams({
    username,
    to,
    message: `MUI Team: ${m.title}${m.body ? ` - ${m.body}` : ''}`.slice(0, 300),
  })
  if (process.env.AT_SENDER_ID) form.set('from', process.env.AT_SENDER_ID)

  const res = await fetch(`https://${host}/version1/messaging`, {
    method: 'POST',
    headers: {
      apiKey: process.env.AT_API_KEY!,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  if (!res.ok) throw new Error(`sms ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// --------------------------------------------------------------------------
// Web push
// --------------------------------------------------------------------------
let vapidReady = false
function initVapid() {
  if (vapidReady) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  vapidReady = true
}

export interface PushSub { endpoint: string; p256dh: string; auth: string }

/** Returns false when the subscription is gone (404/410) so the caller can delete it. */
export async function sendPush(sub: PushSub, m: Message): Promise<boolean> {
  initVapid()
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: m.title, body: m.body ?? '', url: m.link ?? '/notifications' }),
      { TTL: 60 * 60 * 24 },
    )
    return true
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return false
    throw err
  }
}
