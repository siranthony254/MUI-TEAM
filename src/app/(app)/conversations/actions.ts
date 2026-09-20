'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { deliverSoon } from '@/lib/notify/after'
import { localInputToIso } from '@/lib/time'
import type { EpisodeTemplateItem } from '@/lib/types'

export interface EpisodeState { error?: string; ok?: string }

const STATUSES = ['planning', 'recording', 'post_production', 'published', 'archived']
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null

/**
 * Creates an episode and (optionally) turns the standard checklist into tasks, each due relative
 * to the recording date, so an episode becomes a small project with everything assigned.
 */
export async function createEpisode(_prev: EpisodeState | undefined, fd: FormData): Promise<EpisodeState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can create episodes.' }

  const title = text(fd, 'title')
  if (!title || title.length < 3) return { error: 'Give the episode a working title.' }
  const recordingAt = localInputToIso(String(fd.get('recording_at') ?? ''))
  const generate = fd.get('generate') === 'on'
  if (generate && !recordingAt) return { error: 'Set the recording date so the checklist can be scheduled around it.' }

  const supabase = await createClient()
  const { data: ep, error } = await supabase.from('episodes').insert({
    title, question: text(fd, 'question'), guest_name: text(fd, 'guest_name'), guest_notes: text(fd, 'guest_notes'),
    project_id: text(fd, 'project_id'), recording_at: recordingAt, publish_on: text(fd, 'publish_on'), created_by: me.id,
  }).select('id, number').single()
  if (error) return { error: error.message }

  if (generate) {
    const { data: items } = await supabase.from('episode_template_items').select('*').eq('active', true).order('position')
    const base = new Date(recordingAt!).getTime()
    const rows = ((items ?? []) as EpisodeTemplateItem[]).map((it) => {
      const assignee = text(fd, `assignee.${it.id}`) ?? me.id
      return {
        title: `Ep ${ep.number}: ${it.title}`,
        project_id: text(fd, 'project_id'),
        assignee_id: assignee,
        assigned_by: me.id,
        due_at: new Date(base + it.offset_days * 86400000).toISOString(),
        episode_id: ep.id,
        episode_stage: it.stage,
        // Work you give yourself needs no sign-off; work for others is reviewed by you.
        require_approval: assignee !== me.id,
        tags: [`episode-${ep.number}`],
      }
    })
    if (rows.length > 0) {
      const { error: tErr } = await supabase.from('tasks').insert(rows)
      if (tErr) return { error: `The episode was created, but its tasks could not be: ${tErr.message}` }
    }
    deliverSoon()
  }
  revalidatePath('/conversations')
  redirect(`/conversations/${ep.id}`)
}

export async function updateEpisode(_prev: EpisodeState | undefined, fd: FormData): Promise<EpisodeState> {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can edit episodes.' }
  const id = String(fd.get('id') ?? '')
  const status = String(fd.get('status') ?? 'planning')
  const title = text(fd, 'title')
  if (!STATUSES.includes(status)) return { error: 'Invalid status.' }
  if (!title || title.length < 3) return { error: 'Give the episode a title.' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('episodes').update({
    title, status, question: text(fd, 'question'), guest_name: text(fd, 'guest_name'), guest_notes: text(fd, 'guest_notes'),
    recording_at: localInputToIso(String(fd.get('recording_at') ?? '')), publish_on: text(fd, 'publish_on'),
  }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Only executives can edit episodes.' }
  revalidatePath(`/conversations/${id}`)
  revalidatePath('/conversations')
  return { ok: 'Saved.' }
}

export async function addTemplateItem(fd: FormData) {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return
  const title = text(fd, 'title')
  if (!title) return
  const supabase = await createClient()
  const { data: last } = await supabase.from('episode_template_items').select('position').order('position', { ascending: false }).limit(1)
  await supabase.from('episode_template_items').insert({
    title, position: (last?.[0]?.position ?? 0) + 1,
    offset_days: Math.round(Number(fd.get('offset_days') ?? 0)) || 0,
    stage: String(fd.get('stage') ?? 'research'),
  })
  revalidatePath('/conversations')
}

export async function removeTemplateItem(fd: FormData) {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return
  const supabase = await createClient()
  await supabase.from('episode_template_items').delete().eq('id', String(fd.get('id') ?? ''))
  revalidatePath('/conversations')
}
