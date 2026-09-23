'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireMember } from '@/lib/auth'
import { can, dbFor } from '@/lib/permissions'

import { RESOURCE_CATEGORIES } from '@/lib/types'
import { deliverSoon } from '@/lib/notify/after'

const MAX_BYTES = 25 * 1024 * 1024

export interface ResourceState { error?: string; ok?: string }

const clean = (name: string) => name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(0, 120) || 'file'

/** Step 1 of an upload: hand the browser a one-off signed URL so big files never pass through the server. */
export async function prepareUpload(fileName: string, size: number): Promise<{ path?: string; token?: string; error?: string }> {
  const me = await requireMember()
  if (!(await can(me, 'add_resource'))) return { error: "You don't have permission to add resources." }
  if (!Number.isFinite(size) || size <= 0) return { error: 'That file looks empty.' }
  if (size > MAX_BYTES) return { error: 'Files can be up to 25 MB. For larger files, add a link instead.' }

  const path = `${randomUUID()}/${clean(fileName)}`
  const { data, error } = await createAdminClient().storage.from('resources').createSignedUploadUrl(path)
  if (error || !data) return { error: 'Could not start the upload. Try again.' }
  return { path: data.path, token: data.token }
}

/** Step 2: the file is in storage; record it. */
export async function saveFileResource(
  input: {
    path: string; fileName: string; mime: string; size: number
    title: string; description: string; category: string; visibility: string; projectId?: string | null; departmentId?: string | null
  },
): Promise<ResourceState> {
  const me = await requireMember()
  if (!(await can(me, 'add_resource'))) return { error: "You don't have permission to add resources." }
  const title = input.title.trim()
  if (title.length < 2) return { error: 'Give the resource a title.' }
  if (!(RESOURCE_CATEGORIES as readonly string[]).includes(input.category)) return { error: 'Choose a category.' }

  const supabase = await dbFor(me)
  const { error } = await supabase.from('resources').insert({
    title, description: input.description.trim() || null, category: input.category, kind: 'file',
    storage_path: input.path, file_name: input.fileName, mime_type: input.mime || null, size_bytes: input.size,
    visibility: input.visibility === 'executive' ? 'executive' : 'everyone', uploaded_by: me.id,
    project_id: input.projectId || null, department_id: input.departmentId || null,
  })
  if (error) {
    await createAdminClient().storage.from('resources').remove([input.path]) // don't orphan the file
    return { error: error.message }
  }
  revalidatePath('/resources')
  if (input.departmentId) revalidatePath(`/departments/${input.departmentId}`)
  return { ok: 'Uploaded.' }
}

export async function addLinkResource(_prev: ResourceState | undefined, fd: FormData): Promise<ResourceState> {
  const me = await requireMember()
  if (!(await can(me, 'add_resource'))) return { error: "You don't have permission to add resources." }

  const title = String(fd.get('title') ?? '').trim()
  const category = String(fd.get('category') ?? '')
  let url = String(fd.get('url') ?? '').trim()
  if (title.length < 2) return { error: 'Give the resource a title.' }
  if (!(RESOURCE_CATEGORIES as readonly string[]).includes(category)) return { error: 'Choose a category.' }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try { new URL(url) } catch { return { error: 'That link doesn\'t look valid.' } }

  const supabase = await dbFor(me)
  const { error } = await supabase.from('resources').insert({
    title, description: String(fd.get('description') ?? '').trim() || null, category, kind: 'link', url,
    visibility: fd.get('visibility') === 'executive' ? 'executive' : 'everyone', uploaded_by: me.id,
    project_id: String(fd.get('project_id') ?? '') || null, department_id: String(fd.get('department_id') ?? '') || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/resources')
  const pid = String(fd.get('project_id') ?? '')
  if (pid) revalidatePath(`/projects/${pid}`)
  const did = String(fd.get('department_id') ?? '')
  if (did) revalidatePath(`/departments/${did}`)
  return { ok: 'Link added.' }
}

export async function deleteResource(fd: FormData) {
  await requireMember()
  const supabase = await createClient()
  // RLS only returns the row if the caller may delete it.
  const id = String(fd.get('id') ?? '')
  const { data: versions } = await supabase.from('resource_versions').select('storage_path').eq('resource_id', id)
  const { data } = await supabase.from('resources').delete().eq('id', id).select('storage_path')
  const paths = [data?.[0]?.storage_path, ...(versions ?? []).map((v) => v.storage_path)].filter(Boolean) as string[]
  if (data?.length && paths.length) await createAdminClient().storage.from('resources').remove(paths)
  revalidatePath('/resources')
}
