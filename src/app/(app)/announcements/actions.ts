'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireDirector } from '@/lib/auth'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'

export interface AnnouncementState { error?: string; ok?: string }

const AUDIENCES = ['all', 'executives', 'department']
const PRIORITIES = ['normal', 'important', 'urgent']

/** Official announcements come from the Executive Director alone. */
export async function createAnnouncement(_prev: AnnouncementState | undefined, fd: FormData): Promise<AnnouncementState> {
  const me = await requireDirector()
  const title = String(fd.get('title') ?? '').trim()
  const body = String(fd.get('body') ?? '').trim()
  const audience = String(fd.get('audience') ?? 'all')
  const priority = String(fd.get('priority') ?? 'normal')
  const departmentId = String(fd.get('department_id') ?? '') || null
  const publishAt = localInputToIso(String(fd.get('publish_at') ?? '')) ?? new Date().toISOString()

  if (title.length < 3) return { error: 'Give the announcement a title.' }
  if (body.length < 3) return { error: 'Write the announcement.' }
  if (!AUDIENCES.includes(audience) || !PRIORITIES.includes(priority)) return { error: 'Invalid audience or priority.' }
  if (audience === 'department' && !departmentId) return { error: 'Choose the department this is for.' }

  const supabase = await createClient()
  const { error } = await supabase.from('announcements').insert({
    title, body, audience, priority, created_by: me.id, publish_at: publishAt,
    department_id: audience === 'department' ? departmentId : null,
  })
  if (error) return { error: error.message }

  // Announcements set for "now" go out immediately; later ones are sent by the scheduler when due.
  const publishedNow = new Date(publishAt).getTime() <= Date.now() + 1000
  if (publishedNow) {
    try {
      await createAdminClient().rpc('publish_due_announcements')
      deliverSoon()
    } catch {
      // The announcement is saved and visible; only the notifications need the server key.
      revalidatePath('/announcements')
      return { ok: 'Published, but the team could not be notified because SUPABASE_SERVICE_ROLE_KEY is missing on the server.' }
    }
  }
  revalidatePath('/announcements')
  revalidatePath('/')
  return { ok: publishedNow ? 'Published. The team has been notified.' : 'Scheduled. It will be published and sent at the chosen time.' }
}

export async function deleteAnnouncement(fd: FormData) {
  await requireDirector()
  const supabase = await createClient()
  await supabase.from('announcements').delete().eq('id', String(fd.get('id') ?? ''))
  revalidatePath('/announcements')
}
