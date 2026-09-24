'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireMember } from '@/lib/auth'
import { DOC_TEMPLATES } from '@/lib/documents/templates'

export interface DocTemplateState { error?: string; ok?: string }

/** Replaces the whole set of templates featured on a department's page — checkboxes in, one save. */
export async function setDepartmentTemplates(_prev: DocTemplateState | undefined, fd: FormData): Promise<DocTemplateState> {
  const me = await requireMember()
  const departmentId = String(fd.get('department_id') ?? '')
  if (!departmentId) return { error: 'Missing department.' }
  const chosen = new Set(fd.getAll('templates').map(String))
  const valid = DOC_TEMPLATES.map((t) => t.slug).filter((s) => chosen.has(s))

  const supabase = await createClient()
  const { error: delErr } = await supabase.from('department_document_templates').delete().eq('department_id', departmentId)
  if (delErr) return { error: "You don't have permission to change this department's templates." }
  if (valid.length) {
    const { error } = await supabase.from('department_document_templates').insert(
      valid.map((slug) => ({ department_id: departmentId, template_slug: slug, added_by: me.id })),
    )
    if (error) return { error: error.message }
  }
  revalidatePath(`/departments/${departmentId}`)
  return { ok: 'Saved.' }
}
