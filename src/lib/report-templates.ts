import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReportTemplate } from './types'

/** A fallback used only if the organisation-wide default row is somehow missing (should never happen post-migration). */
const FALLBACK_SECTIONS: ReportTemplate['sections'] = [
  { key: 'activities', label: 'Activities', hint: 'What did you and your team work on?' },
  { key: 'completed', label: 'Completed', hint: 'What was finished or delivered?' },
  { key: 'challenges', label: 'Challenges', hint: 'What got in the way?' },
  { key: 'metrics', label: 'Metrics', hint: 'Any numbers worth recording (only real ones)' },
  { key: 'recommendations', label: 'Recommendations', hint: 'What should change or be decided?' },
]

/**
 * The report template a person should fill in: their department's own template if it has one,
 * otherwise the organisation-wide default. Personal (non-department) reports always get the default.
 */
export async function resolveReportTemplate(supabase: SupabaseClient, departmentId: string | null): Promise<ReportTemplate['sections']> {
  const [{ data: specific }, { data: fallback }] = await Promise.all([
    departmentId
      ? supabase.from('report_templates').select('sections').eq('department_id', departmentId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('report_templates').select('sections').is('department_id', null).maybeSingle(),
  ])
  const sections = (specific?.sections ?? fallback?.sections) as ReportTemplate['sections'] | undefined
  return sections && sections.length > 0 ? sections : FALLBACK_SECTIONS
}
