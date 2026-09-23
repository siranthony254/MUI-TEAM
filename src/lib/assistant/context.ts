import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeamMember } from '@/lib/types'
import { fmtDue } from '@/lib/tasks'
import { ROLE_LABEL } from '@/lib/types'

/**
 * What this particular person and their situation look like right now — fetched fresh each
 * message, through their own session so it can never show more than they could already see
 * themselves in the app.
 */
export async function buildPersonContext(supabase: SupabaseClient, me: TeamMember): Promise<string> {
  const [{ data: dept }, { data: tasks }, { data: knowledge }] = await Promise.all([
    me.department_id ? supabase.from('departments').select('name').eq('id', me.department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('tasks').select('title, status, due_at, priority').eq('assignee_id', me.id)
      .not('status', 'in', '(completed,closed)').order('due_at', { ascending: true, nullsFirst: false }).limit(8),
    me.department_id
      ? supabase.from('assistant_knowledge').select('topic, answer').or(`department_id.is.null,department_id.eq.${me.department_id}`).limit(40)
      : supabase.from('assistant_knowledge').select('topic, answer').is('department_id', null).limit(40),
  ])

  const taskLines = (tasks ?? []).length
    ? (tasks ?? []).map((t) => `  - "${t.title}" (${t.status}, ${t.priority} priority, due ${fmtDue(t.due_at)})`).join('\n')
    : '  (none open right now)'
  const knowledgeLines = (knowledge ?? []).length
    ? (knowledge ?? []).map((k) => `  - ${k.topic}: ${k.answer}`).join('\n')
    : '  (nothing specific has been added yet)'

  return `
THE PERSON ASKING
- Name: ${me.full_name} (${me.preferred_name || me.full_name.split(' ')[0]})
- Access level: ${ROLE_LABEL[me.role]}${me.is_director ? ' — the Executive Director' : ''}
- Title: ${me.title ?? 'not set'}
- Department: ${(dept as { name?: string } | null)?.name ?? 'none set'}
- Their open tasks:
${taskLines}

THINGS DIRECTORS HAVE TAUGHT YOU (org-specific — trust these over general guesses)
${knowledgeLines}
`.trim()
}
