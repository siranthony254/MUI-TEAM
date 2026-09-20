'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export interface OnboardingState { error?: string; ok?: string }

export async function saveWelcome(_prev: OnboardingState | undefined, fd: FormData): Promise<OnboardingState> {
  await requireRole('super_admin')
  const value = String(fd.get('welcome') ?? '').trim()
  if (value.length > 1500) return { error: 'Keep the welcome message under 1500 characters.' }
  const { error } = await createAdminClient().from('org_settings').upsert({ key: 'welcome_message', value })
  if (error) return { error: error.message }
  revalidatePath('/')
  return { ok: 'Saved. New members see this on their dashboard.' }
}

export async function addOnboardingItem(_prev: OnboardingState | undefined, fd: FormData): Promise<OnboardingState> {
  await requireRole('super_admin')
  const title = String(fd.get('title') ?? '').trim()
  if (title.length < 3) return { error: 'Give the step a title.' }
  const link = String(fd.get('link') ?? '').trim() || null
  if (link && !link.startsWith('/') && !/^https?:\/\//i.test(link)) return { error: 'A link should start with / (inside the app) or https://.' }

  const admin = createAdminClient()
  const { data: last } = await admin.from('onboarding_items').select('position').order('position', { ascending: false }).limit(1)
  const { data, error } = await admin.from('onboarding_items').insert({
    title, description: String(fd.get('description') ?? '').trim() || null, link,
    position: (last?.[0]?.position ?? 0) + 1,
  }).select('id').single()
  if (error) return { error: error.message }

  // Optionally give it to everyone already on the team, not just future joiners.
  if (fd.get('everyone') === 'on') {
    const { data: members } = await admin.from('team_members').select('id').eq('active', true)
    if (members?.length) {
      await admin.from('member_onboarding').upsert(members.map((m) => ({ member_id: m.id, item_id: data.id })), { ignoreDuplicates: true })
    }
  }
  revalidatePath('/admin/onboarding')
  revalidatePath('/')
  return { ok: 'Step added.' }
}

export async function removeOnboardingItem(fd: FormData) {
  await requireRole('super_admin')
  await createAdminClient().from('onboarding_items').delete().eq('id', String(fd.get('id') ?? ''))
  revalidatePath('/admin/onboarding')
  revalidatePath('/')
}
