'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireMember } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { deliverSoon } from '@/lib/notify/after'

export interface ViewerState { error?: string; ok?: string }

interface ResourceRow {
  id: string; title: string; kind: 'file' | 'link'; url: string | null; storage_path: string | null
  file_name: string | null; mime_type: string | null; size_bytes: number | null
  visibility: string; uploaded_by: string | null; version: number; project_id: string | null
}

/** Who may replace a resource: whoever uploaded it, or a system admin, provided they may add resources at all. */
async function replaceable(me: Awaited<ReturnType<typeof requireMember>>, id: string): Promise<ResourceRow | null> {
  if (!(await can(me, 'add_resource'))) return null
  const { data } = await (await createClient()).from('resources').select('*').eq('id', id).maybeSingle()
  const r = data as ResourceRow | null
  if (!r) return null
  return r.uploaded_by === me.id || me.role === 'super_admin' ? r : null
}

/** Puts the current file into the history, then makes the new one current. */
export async function replaceResourceFile(input: {
  id: string; path: string; fileName: string; mime: string; size: number
}): Promise<ViewerState> {
  const me = await requireMember()
  const r = await replaceable(me, input.id)
  if (!r) return { error: "You can't replace this file." }
  if (r.kind !== 'file') return { error: 'This is a link; change its address instead.' }

  const admin = createAdminClient()
  const { error: hErr } = await admin.from('resource_versions').insert({
    resource_id: r.id, version: r.version, kind: 'file', storage_path: r.storage_path, file_name: r.file_name,
    mime_type: r.mime_type, size_bytes: r.size_bytes, uploaded_by: r.uploaded_by,
  })
  if (hErr) {
    await admin.storage.from('resources').remove([input.path])
    return { error: hErr.message }
  }
  const { error } = await admin.from('resources').update({
    storage_path: input.path, file_name: input.fileName, mime_type: input.mime || null, size_bytes: input.size, version: r.version + 1,
  }).eq('id', r.id)
  if (error) return { error: error.message }

  await admin.rpc('log_activity', {
    p_actor: me.id, p_action: 'resource.replaced', p_type: 'resource', p_id: r.id,
    p_summary: `${me.full_name} uploaded version ${r.version + 1} of "${r.title}"`,
    p_field: 'version', p_from: String(r.version), p_to: String(r.version + 1), p_project: r.project_id,
  })
  revalidatePath(`/resources/${r.id}`)
  revalidatePath('/resources')
  return { ok: `Version ${r.version + 1} is now current. The earlier version is kept in the history.` }
}

export async function replaceResourceLink(_prev: ViewerState | undefined, fd: FormData): Promise<ViewerState> {
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const r = await replaceable(me, id)
  if (!r) return { error: "You can't change this link." }
  if (r.kind !== 'link') return { error: 'This is a file; upload a new version instead.' }
  let url = String(fd.get('url') ?? '').trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try { new URL(url) } catch { return { error: "That link doesn't look valid." } }

  const admin = createAdminClient()
  await admin.from('resource_versions').insert({ resource_id: r.id, version: r.version, kind: 'link', url: r.url, uploaded_by: r.uploaded_by })
  const { error } = await admin.from('resources').update({ url, version: r.version + 1 }).eq('id', r.id)
  if (error) return { error: error.message }
  revalidatePath(`/resources/${r.id}`)
  return { ok: 'Link updated. The earlier address is kept in the history.' }
}

/** Tell colleagues about a file: they get a notification that opens it. Only people who may see it are notified. */
export async function shareResource(_prev: ViewerState | undefined, fd: FormData): Promise<ViewerState> {
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const ids = [...new Set(fd.getAll('people').map(String))].filter((x) => x !== me.id).slice(0, 50)
  if (ids.length === 0) return { error: 'Choose at least one person.' }

  const { data: r } = await (await createClient()).from('resources').select('id, title, visibility, project_id').eq('id', id).maybeSingle()
  if (!r) return { error: "You can't share this." }

  const admin = createAdminClient()
  const { data: people } = await admin.from('team_members').select('id, role').in('id', ids).eq('active', true)
  const eligible = (people ?? []).filter((p) => {
    if (r.visibility === 'executive') return p.role === 'executive' || p.role === 'super_admin'
    if (p.role === 'guest') return !!r.project_id
    return true
  })
  if (eligible.length === 0) return { error: 'None of those people can open this file.' }

  await admin.from('notifications').insert(eligible.map((p) => ({
    recipient_id: p.id, kind: 'resource_shared', title: `${me.full_name} shared a file with you`,
    body: r.title, link: `/resources/${r.id}`,
  })))
  deliverSoon()
  const skipped = ids.length - eligible.length
  return { ok: `Shared with ${eligible.length} ${eligible.length === 1 ? 'person' : 'people'}.${skipped ? ` ${skipped} couldn't be notified because they don't have access.` : ''}` }
}
