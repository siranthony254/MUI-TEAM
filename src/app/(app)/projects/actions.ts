'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'

export interface ProjectState { error?: string; ok?: string }

const STATUSES = ['active', 'at_risk', 'paused', 'done']
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null

export async function createProject(fd: FormData) {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return

  const name = String(fd.get('name') ?? '').trim()
  if (name.length < 3) return

  const supabase = await createClient()
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
  const me = await requireMember()
  if (!isExecOrAbove(me)) return { error: 'Only executives can edit projects.' }
  const id = String(fd.get('id') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  const status = String(fd.get('status') ?? 'active')
  if (name.length < 3) return { error: 'Give the project a name.' }
  if (!STATUSES.includes(status)) return { error: 'Invalid status.' }

  const supabase = await createClient()
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
  const me = await requireMember()
  if (!isExecOrAbove(me)) return
  const projectId = String(fd.get('project_id') ?? '')
  const memberId = String(fd.get('member_id') ?? '')
  if (!projectId || !memberId) return
  const supabase = await createClient()
  await supabase.from('project_members').upsert({ project_id: projectId, member_id: memberId })
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(fd: FormData) {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return
  const projectId = String(fd.get('project_id') ?? '')
  const memberId = String(fd.get('member_id') ?? '')
  const supabase = await createClient()
  await supabase.from('project_members').delete().eq('project_id', projectId).eq('member_id', memberId)
  revalidatePath(`/projects/${projectId}`)
}
