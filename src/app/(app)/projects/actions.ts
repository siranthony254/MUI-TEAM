'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { can, dbFor } from '@/lib/permissions'
import { deliverSoon } from '@/lib/notify/after'


export interface ProjectState { error?: string; ok?: string }

const STATUSES = ['active', 'at_risk', 'paused', 'done']
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null

/** Executives with the capability manage any project; anyone else with it, only their own. */
async function projectDb(me: Awaited<ReturnType<typeof requireMember>>, projectId: string) {
  if (!(await can(me, 'create_project'))) return null
  if (isExecOrAbove(me)) return await createClient()
  const { data } = await (await createClient()).from('projects').select('owner_id').eq('id', projectId).maybeSingle()
  return data?.owner_id === me.id ? await dbFor(me) : null
}

export async function createProject(fd: FormData) {
  deliverSoon()
  const me = await requireMember()
  if (!(await can(me, 'create_project'))) return

  const name = String(fd.get('name') ?? '').trim()
  if (name.length < 3) return

  const supabase = await dbFor(me)
  const { data } = await supabase.from('projects').insert({
    name,
    description: text(fd, 'description'),
    department_id: text(fd, 'department_id'),
    due_date: text(fd, 'due_date'),
    owner_id: me.id,
    created_by: me.id,
  }).select('id')
  revalidatePath('/projects')
  // The creator can't necessarily read the row back yet under every policy; fall back to the list.
  if (data?.[0]?.id) redirect(`/projects/${data[0].id}`)
}

export async function updateProject(_prev: ProjectState | undefined, fd: FormData): Promise<ProjectState> {
  deliverSoon()
  const me = await requireMember()
  const id = String(fd.get('id') ?? '')
  const supabase = await projectDb(me, id)
  if (!supabase) return { error: "You don't have permission to edit this project." }
  const name = String(fd.get('name') ?? '').trim()
  const status = String(fd.get('status') ?? 'active')
  if (name.length < 3) return { error: 'Give the project a name.' }
  if (!STATUSES.includes(status)) return { error: 'Invalid status.' }

  const { data, error } = await supabase.from('projects').update({
    name, status,
    description: text(fd, 'description'),
    department_id: text(fd, 'department_id'),
    owner_id: text(fd, 'owner_id'),
    start_date: text(fd, 'start_date'),
    due_date: text(fd, 'due_date'),
  }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Only executives can edit projects.' }

  revalidatePath(`/projects/${id}`)
  revalidatePath('/projects')
  return { ok: 'Saved.' }
}

export async function addProjectMember(fd: FormData) {
  deliverSoon()
  const me = await requireMember()
  const projectId = String(fd.get('project_id') ?? '')
  const memberId = String(fd.get('member_id') ?? '')
  if (!projectId || !memberId) return
  const supabase = await projectDb(me, projectId)
  if (!supabase) return
  await supabase.from('project_members').upsert({ project_id: projectId, member_id: memberId })
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(fd: FormData) {
  const me = await requireMember()
  const projectId = String(fd.get('project_id') ?? '')
  const memberId = String(fd.get('member_id') ?? '')
  const supabase = await projectDb(me, projectId)
  if (!supabase) return
  await supabase.from('project_members').delete().eq('project_id', projectId).eq('member_id', memberId)
  revalidatePath(`/projects/${projectId}`)
}
