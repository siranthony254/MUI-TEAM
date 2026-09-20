'use server'

import { revalidatePath } from 'next/cache'
import { requireScope } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { CAPABILITIES, type EditableLevel } from '@/lib/capabilities'

export interface PermState { error?: string; ok?: string }

const LEVELS: EditableLevel[] = ['executive', 'department_director', 'member']

export async function savePermissions(_prev: PermState | undefined, fd: FormData): Promise<PermState> {
  const me = await requireScope('admin.permissions')
  const rows = LEVELS.flatMap((level) =>
    CAPABILITIES.map((c) => ({ level, capability: c.id, allowed: fd.get(`${level}.${c.id}`) === 'on' })))

  const admin = createAdminClient()
  const { error } = await admin.from('role_permissions').upsert(rows, { onConflict: 'level,capability' })
  if (error) return { error: error.message }

  await admin.rpc('log_activity', {
    p_actor: me.id, p_action: 'permissions.updated', p_type: 'member', p_id: me.id,
    p_summary: `${me.full_name} updated the permission matrix`, p_field: null, p_from: null, p_to: null, p_project: null,
  })
  revalidatePath('/', 'layout')
  return { ok: 'Permissions saved. They apply immediately.' }
}
