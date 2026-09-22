'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember } from '@/lib/auth'

export interface TemplateState { error?: string; ok?: string }

/**
 * Saves a report template — the organisation-wide default (no department_id) or one department's
 * own. Access is enforced by the database (system admins, the Director, or that department's own
 * director); this just gives a friendly error instead of a bare RLS failure.
 */
export async function saveTemplate(_prev: TemplateState | undefined, fd: FormData): Promise<TemplateState> {
  const me = await requireMember()
  const departmentId = String(fd.get('department_id') ?? '') || null
  const name = String(fd.get('name') ?? '').trim() || 'Report template'
  let sections: unknown
  try {
    sections = JSON.parse(String(fd.get('sections') ?? '[]'))
  } catch {
    return { error: 'Could not read the sections you entered.' }
  }
  if (!Array.isArray(sections) || sections.length === 0) return { error: 'Add at least one section.' }

  const supabase = await createClient()
  let query = supabase.from('report_templates').select('id')
  query = departmentId ? query.eq('department_id', departmentId) : query.is('department_id', null)
  const { data: current } = await query.maybeSingle()

  const patch = { department_id: departmentId, name, sections, updated_by: me.id, updated_at: new Date().toISOString() }
  const { error } = current
    ? await supabase.from('report_templates').update(patch).eq('id', current.id)
    : await supabase.from('report_templates').insert(patch)
  if (error) return { error: "You don't have permission to edit this template, or it could not be saved." }

  revalidatePath('/admin/departments')
  revalidatePath('/reports')
  return { ok: 'Template saved. Reports already in progress keep the questions they were started with.' }
}
