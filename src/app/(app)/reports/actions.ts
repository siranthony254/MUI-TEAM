'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { deliverSoon } from '@/lib/notify/after'
import { monthRange } from '@/lib/time'
import { can } from '@/lib/permissions'

export interface ReportState { error?: string; ok?: string }

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * Open (or resume) a report for a chosen period. Personal reports are open to
 * everyone; department reports to executives, who submit on a department's behalf.
 */
export async function createReport(_prev: ReportState | undefined, fd: FormData): Promise<ReportState> {
  const me = await requireMember()
  const kind = fd.get('kind') === 'department' ? 'department' : 'personal'
  const month = monthRange()
  const start = text(fd, 'period_start') ?? month.start
  const end = text(fd, 'period_end') ?? month.end
  const departmentId = kind === 'department' ? text(fd, 'department_id') ?? me.department_id : me.department_id

  if (kind === 'department' && !(await can(me, 'submit_department_report'))) return { error: "You don't have permission to submit department reports." }
  if (kind === 'department' && !isExecOrAbove(me) && !(me.directed_departments ?? []).includes(departmentId ?? '')) {
    return { error: 'You can submit reports only for a department you lead.' }
  }
  if (kind === 'department' && !departmentId) return { error: 'Choose the department this report is for.' }
  if (!isDate(start) || !isDate(end)) return { error: 'Choose a reporting period.' }
  if (end < start) return { error: 'The period ends before it starts.' }

  const supabase = await createClient()
  let query = supabase.from('reports').select('id')
    .eq('author_id', me.id).eq('kind', kind).eq('period_start', start).eq('period_end', end)
  query = departmentId ? query.eq('department_id', departmentId) : query.is('department_id', null)
  const { data: existing } = await query.maybeSingle()
  if (existing) redirect(`/reports/${existing.id}`)

  const { data, error } = await supabase
    .from('reports')
    .insert({ author_id: me.id, kind, department_id: departmentId, period_start: start, period_end: end })
    .select('id')
    .single()
  if (error) return { error: error.message }
  redirect(`/reports/${data.id}`)
}

export async function saveReport(_prev: ReportState | undefined, fd: FormData): Promise<ReportState> {
  await requireMember()
  const id = String(fd.get('id') ?? '')
  const submit = fd.get('intent') === 'submit'

  const fields = {
    activities: text(fd, 'activities'),
    completed: text(fd, 'completed'),
    challenges: text(fd, 'challenges'),
    metrics: text(fd, 'metrics'),
    recommendations: text(fd, 'recommendations'),
  }
  if (submit && !fields.activities && !fields.completed) {
    return { error: 'Describe your activities or what was completed before submitting.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reports')
    .update({
      ...fields,
      ...(submit ? { status: 'submitted', submitted_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  // Submitted reports are locked: RLS returns no row for them.
  if (!data || data.length === 0) return { error: 'This report has already been submitted and can no longer be edited.' }

  revalidatePath('/reports')
  revalidatePath(`/reports/${id}`)
  if (submit) {
    deliverSoon()
    redirect(`/reports/${id}`)
  }
  return { ok: 'Draft saved.' }
}
