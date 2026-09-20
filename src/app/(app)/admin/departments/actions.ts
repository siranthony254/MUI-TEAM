'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function saveDepartment(fd: FormData) {
  const me = await requireRole('super_admin')
  const id = String(fd.get('id') ?? '')
  const admin = createAdminClient()
  const name = String(fd.get('name') ?? '').trim()
  const patch = {
    name: name || undefined,
    description: String(fd.get('description') ?? '').trim() || null,
    director_id: String(fd.get('director_id') ?? '') || null,
  }
  if (id) {
    await admin.from('departments').update(patch).eq('id', id)
    await admin.rpc('log_activity', {
      p_actor: me.id, p_action: 'department.updated', p_type: 'department', p_id: id,
      p_summary: `${me.full_name} updated the ${name || 'department'} settings`, p_field: null, p_from: null, p_to: null, p_project: null,
    })
  } else if (name.length >= 2) {
    const { data } = await admin.from('departments').insert({ ...patch, name }).select('id')
    if (data?.[0]) await admin.rpc('log_activity', {
      p_actor: me.id, p_action: 'department.created', p_type: 'department', p_id: data[0].id,
      p_summary: `${me.full_name} created the ${name} department`, p_field: null, p_from: null, p_to: null, p_project: null,
    })
  }
  revalidatePath('/', 'layout')
}
