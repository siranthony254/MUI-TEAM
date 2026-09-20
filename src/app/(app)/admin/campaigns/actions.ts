'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminOrDirector } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { deliverSoon } from '@/lib/notify/after'

export interface CampaignState { error?: string; ok?: string }

const CHANNELS = ['email', 'push', 'sms']

/**
 * A campaign is one message to a chosen part of the team. It appears in their notifications
 * and goes out over the channels picked (each person's own opt-ins still apply).
 */
export async function sendCampaign(_prev: CampaignState | undefined, fd: FormData): Promise<CampaignState> {
  const me = await requireAdminOrDirector()
  const title = String(fd.get('title') ?? '').trim()
  const body = String(fd.get('body') ?? '').trim()
  const audience = String(fd.get('audience') ?? 'all')
  const link = String(fd.get('link') ?? '').trim() || null
  const channels = fd.getAll('channels').map(String).filter((c) => CHANNELS.includes(c))
  const people = fd.getAll('people').map(String)

  if (title.length < 3) return { error: 'Give the campaign a title.' }
  if (body.length < 3) return { error: 'Write the message.' }
  if (body.length > 1000) return { error: 'Keep the message under 1000 characters.' }
  if (link && !link.startsWith('/') && !/^https?:\/\//i.test(link)) return { error: 'A link should start with / (inside the app) or https://.' }

  const admin = createAdminClient()
  let query = admin.from('team_members').select('id, role, department_id').eq('active', true)
  let audienceLabel = audience
  if (audience === 'executives') query = query.in('role', ['executive', 'super_admin'])
  else if (audience === 'members') query = query.eq('role', 'member')
  else if (audience.startsWith('department:')) query = query.eq('department_id', audience.slice('department:'.length))
  else if (audience === 'people') {
    if (people.length === 0) return { error: 'Choose at least one person.' }
    query = query.in('id', people)
    audienceLabel = 'people'
  } else if (audience !== 'all') return { error: 'Invalid audience.' }

  const { data: recipients, error: rErr } = await query
  if (rErr) return { error: rErr.message }
  const targets = (recipients ?? []).filter((r) => r.id !== me.id)
  if (targets.length === 0) return { error: 'No one matches that audience.' }

  const { data: campaign, error: cErr } = await admin.from('campaigns').insert({
    title, body, link, audience: audienceLabel, channels, recipient_count: targets.length, sent_by: me.id,
  }).select('id').single()
  if (cErr) return { error: cErr.message }

  const { error: nErr } = await admin.from('notifications').insert(targets.map((t) => ({
    recipient_id: t.id, kind: 'campaign', title, body, link: link ?? '/notifications',
    channels, dedupe_key: `campaign:${campaign.id}:${t.id}`,
  })))
  if (nErr) return { error: nErr.message }

  await admin.rpc('log_activity', {
    p_actor: me.id, p_action: 'campaign.sent', p_type: 'campaign', p_id: campaign.id,
    p_summary: `${me.full_name} sent the campaign "${title}" to ${targets.length} ${targets.length === 1 ? 'person' : 'people'}`,
    p_field: null, p_from: null, p_to: null, p_project: null,
  })
  deliverSoon()
  revalidatePath('/admin/campaigns')
  return { ok: `Sent to ${targets.length} ${targets.length === 1 ? 'person' : 'people'}${channels.length ? ` (in-app plus ${channels.join(', ')} where they've opted in)` : ' in-app'}.` }
}
