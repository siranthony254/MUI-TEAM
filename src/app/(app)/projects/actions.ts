'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'

export async function createProject(formData: FormData) {
  const me = await requireMember()
  if (!isExecOrAbove(me)) return

  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 3) return

  const supabase = await createClient()
  await supabase.from('projects').insert({
    name,
    description: String(formData.get('description') ?? '').trim() || null,
    due_date: String(formData.get('due_date') ?? '') || null,
    owner_id: me.id,
    created_by: me.id,
  })
  revalidatePath('/projects')
}
