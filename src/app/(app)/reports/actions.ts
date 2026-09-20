'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireMember } from '@/lib/auth'
import { deliverSoon } from '@/lib/notify/after'
import { monthRange } from '@/lib/time'

export interface ReportState { error?: string; ok?: string }

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null

/** Open (or resume) this month's report. One per person per month. */
export async function startReport() {
  const me = await requireMember()
  const { start, end } = monthRange()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('reports').select('id').eq('author_id', me.id).eq('period_start', start).maybeSingle()
  if (existing) redirect(`/reports/${existing.id}`)

  const { data, error } = await supabase
    .from('reports')
    .insert({ author_id: me.id, department_id: me.department_id, period_start: start, period_end: end })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
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
