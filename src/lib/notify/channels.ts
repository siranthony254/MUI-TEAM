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
  /** Notification kind: pushes about the same thing (e.g. one chat) replace each other instead of piling up. */
  kind?: string
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

  await sendRawEmail(to, m.title, html, `${m.title}\n\n${m.body ?? ''}\n\n${url}`)
}

async function sendRawEmail(to: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }),
  })
  if (!res.ok) throw new Error(`email ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/** A brand-new login: the password shown clearly, once, with a nudge to change it. */
export async function sendWelcomeEmail(to: string, name: string, password: string) {
  const loginUrl = `${appUrl()}/login`
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#0D1F35;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:.05em">MUI TEAM</div>
    <div style="background:#fff;padding:24px 20px;border-radius:0 0 12px 12px">
      <p style="margin:0 0 4px;color:#666;font-size:13px">Hi ${escapeHtml(name.split(' ')[0])},</p>
      <h1 style="margin:0 0 12px;font-size:20px;color:#0D1F35">Your MUI Team account is ready</h1>
      <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.5">Sign in with your email address and this temporary password, then change it under Account.</p>
      <p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:18px;font-weight:bold;letter-spacing:.03em;background:#f5f5f5;border:1px solid #e5e5e5;border-radius:8px;padding:12px 16px;text-align:center">${escapeHtml(password)}</p>
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#f59e0b;color:#0D1F35;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px">Sign in</a>
      <p style="margin:16px 0 0;color:#999;font-size:12px">Didn&rsquo;t expect this? Someone on the team may have entered your email by mistake &mdash; you can ignore it.</p>
    </div>
  </div></body></html>`
  const text = `Hi ${name.split(' ')[0]},\n\nYour MUI Team account is ready.\nSign in with your email and this temporary password: ${password}\nThen change it under Account.\n\n${loginUrl}`
  await sendRawEmail(to, 'Your MUI Team account is ready', html, text)
}

// --------------------------------------------------------------------------
// SMS — Africa's Talking (Kenya). Set AT_USERNAME=sandbox to test.
// --------------------------------------------------------------------------
async function sendSmsRaw(to: string, message: string) {
  const username = process.env.AT_USERNAME!
  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com'
  const form = new URLSearchParams({ username, to, message: message.slice(0, 300) })
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

export async function sendSms(to: string, m: Message) {
  await sendSmsRaw(to, `MUI Team: ${m.title}${m.body ? ` - ${m.body}` : ''}`)
}

/** A brand-new login, texted: short, since SMS is billed per segment. */
export async function sendWelcomeSms(to: string, password: string) {
  await sendSmsRaw(to, `MUI Team: your account is ready. Temporary password: ${password}. Sign in at ${appUrl()}/login and change it under Account.`)
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
      JSON.stringify({ title: m.title, body: m.body ?? '', url: m.link ?? '/notifications', kind: m.kind ?? '' }),
      { TTL: 60 * 60 * 24 },
    )
    return true
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return false
    throw err
  }
}
