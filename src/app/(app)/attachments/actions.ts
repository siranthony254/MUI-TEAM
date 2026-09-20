'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireMember, isExecOrAbove } from '@/lib/auth'

const MAX_BYTES = 25 * 1024 * 1024
const TYPES = ['task', 'report', 'decision'] as const
type EntityType = (typeof TYPES)[number]

export interface AttachmentState { error?: string; ok?: string }

const clean = (name: string) => name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(0, 120) || 'file'

const pathFor = (type: EntityType, id: string) => (type === 'task' ? `/tasks/${id}` : type === 'report' ? `/reports/${id}` : '/decisions')

/** Mirrors the database policy so we never issue an upload URL to someone who could not attach anyway. */
async function canAttach(type: EntityType, id: string): Promise<boolean> {
  const me = await requireMember()
  const supabase = await createClient()
  if (type === 'decision') return isExecOrAbove(me)
  if (type === 'task') {
    const { data } = await supabase.from('tasks').select('assignee_id, assigned_by').eq('id', id).maybeSingle()
    return !!data && (me.role === 'super_admin' || data.assignee_id === me.id || data.assigned_by === me.id)
  }
  const { data } = await supabase.from('reports').select('author_id, status').eq('id', id).maybeSingle()
  return !!data && data.author_id === me.id && data.status === 'draft'
}

export async function prepareAttachmentUpload(
  type: EntityType, entityId: string, fileName: string, size: number,
): Promise<{ path?: string; token?: string; error?: string }> {
  if (!TYPES.includes(type)) return { error: 'Invalid target.' }
  if (!(await canAttach(type, entityId))) return { error: 'You can\'t attach files here.' }
  if (!Number.isFinite(size) || size <= 0) return { error: 'That file looks empty.' }
  if (size > MAX_BYTES) return { error: 'Files can be up to 25 MB. For larger files, add a link instead.' }

  const path = `${type}/${entityId}/${randomUUID()}-${clean(fileName)}`
  const { data, error } = await createAdminClient().storage.from('attachments').createSignedUploadUrl(path)
  if (error || !data) return { error: 'Could not start the upload. Try again.' }
  return { path: data.path, token: data.token }
}

export async function saveAttachment(input: {
  type: EntityType; entityId: string; path: string; fileName: string; mime: string; size: number
}): Promise<AttachmentState> {
  const me = await requireMember()
  if (!TYPES.includes(input.type)) return { error: 'Invalid target.' }
  // The object must live under this entity's folder, so a path can't be pointed at someone else's file.
  if (!input.path.startsWith(`${input.type}/${input.entityId}/`)) return { error: 'Invalid file.' }

  const supabase = await createClient()
  const { error } = await supabase.from('attachments').insert({
    entity_type: input.type, entity_id: input.entityId, kind: 'file',
    storage_path: input.path, file_name: input.fileName, mime_type: input.mime || null,
    size_bytes: input.size, uploaded_by: me.id,
  })
  if (error) {
    await createAdminClient().storage.from('attachments').remove([input.path])
    return { error: 'You can\'t attach files here.' }
  }
  revalidatePath(pathFor(input.type, input.entityId))
  return { ok: 'Attached.' }
}

export async function addAttachmentLink(
  _prev: AttachmentState | undefined, fd: FormData,
): Promise<AttachmentState> {
  const me = await requireMember()
  const type = String(fd.get('entity_type') ?? '') as EntityType
  const entityId = String(fd.get('entity_id') ?? '')
  let url = String(fd.get('url') ?? '').trim()
  if (!TYPES.includes(type)) return { error: 'Invalid target.' }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try { new URL(url) } catch { return { error: 'That link doesn\'t look valid.' } }

  const supabase = await createClient()
  const { error } = await supabase.from('attachments').insert({
    entity_type: type, entity_id: entityId, kind: 'link', url,
    file_name: String(fd.get('label') ?? '').trim() || url, uploaded_by: me.id,
  })
  if (error) return { error: 'You can\'t attach links here.' }
  revalidatePath(pathFor(type, entityId))
  return { ok: 'Link attached.' }
}

export async function deleteAttachment(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  const { data } = await supabase
    .from('attachments').delete().eq('id', String(fd.get('id') ?? '')).select('storage_path, entity_type, entity_id')
  const row = data?.[0]
  if (!row) return
  if (row.storage_path) await createAdminClient().storage.from('attachments').remove([row.storage_path])
  revalidatePath(pathFor(row.entity_type as EntityType, row.entity_id))
}
