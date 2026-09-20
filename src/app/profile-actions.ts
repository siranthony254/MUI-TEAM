'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/notify/phone'

export interface ProfileState { error?: string; ok?: string }

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/

export async function prepareAvatarUpload(fileName: string, size: number, type: string): Promise<{ path?: string; token?: string; error?: string }> {
  const me = await requireMember()
  if (!IMAGE.test(type)) return { error: 'Choose a PNG, JPG, WebP or GIF image.' }
  if (!(size > 0) || size > 3 * 1024 * 1024) return { error: 'The photo must be under 3 MB.' }
  const ext = type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${me.id}/${randomUUID()}.${ext}`
  const { data, error } = await createAdminClient().storage.from('avatars').createSignedUploadUrl(path)
  if (error || !data) return { error: 'Could not start the upload. Try again.' }
  return { path: data.path, token: data.token }
}

/** Saves the profile. With complete=1 (first login) it also marks setup as finished and continues to the app. */
export async function saveProfile(_prev: ProfileState | undefined, fd: FormData): Promise<ProfileState> {
  const me = await requireMember()
  const complete = fd.get('complete') === '1'
  const rawPhone = String(fd.get('phone') ?? '').trim()
  const phone = normalizePhone(rawPhone)
  if (rawPhone && !phone) return { error: 'That phone number doesn\'t look right. Use e.g. 0712 345 678 or +254712345678.' }
  const sms = fd.get('notify_sms') === 'on'
  if (sms && !phone) return { error: 'Add a phone number to receive SMS.' }

  const supabase = await createClient()
  const avatarPath = String(fd.get('avatar_path') ?? '')
  // A path we issued for this member, nothing else.
  const avatarUrl = avatarPath.startsWith(`${me.id}/`)
    ? createAdminClient().storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
    : ''

  const { error } = await supabase.rpc('update_my_profile', {
    p_preferred_name: String(fd.get('preferred_name') ?? ''),
    p_avatar_url: avatarUrl,
    p_phone: phone ?? '',
    p_complete: complete,
  })
  if (error) return { error: error.message }

  const { error: pErr } = await supabase.rpc('update_my_notification_prefs', {
    p_email: fd.get('notify_email') === 'on', p_push: fd.get('notify_push') === 'on', p_sms: sms, p_phone: phone ?? '',
  })
  if (pErr) return { error: pErr.message }

  const emergency = String(fd.get('emergency_contact') ?? '').trim()
  await supabase.from('member_private').upsert({ member_id: me.id, emergency_contact: emergency || null, updated_at: new Date().toISOString() })

  revalidatePath('/', 'layout')
  if (complete) redirect('/')
  return { ok: 'Profile saved.' }
}
