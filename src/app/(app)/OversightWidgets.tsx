import Link from 'next/link'
import { AlertTriangle, CalendarClock, ClipboardCheck, FileWarning } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { fmtDay, fmtDateTime, monthRange } from '@/lib/time'
import { isOverdue } from '@/lib/tasks'
import { Card, EmptyState, SectionTitle } from '@/components/ui'
import type { Task } from '@/lib/types'

/**
 * Organisation-wide follow-through — for whoever's been delegated 'org_oversight' (a Vice
 * Executive Director / deputy, typically), not just the Director themselves. Reads through the
 * admin client since this deliberately crosses every department, which their own session's RLS
 * wouldn't otherwise show them; the capability check by the caller is what gates it.
 */
export async function OversightWidgets() {
  const admin = createAdminClient()
  const month = monthRange()
  const now = new Date().toISOString()

  const [{ data: overdueRows }, { data: dueSoonRows }, { data: heldMeetings }, { data: departments }, { data: deptReports }] = await Promise.all([
    admin.from('tasks').select('id, title, due_at, priority, assignee_id, team_members!tasks_assignee_id_fkey(full_name, department_id)')
      .not('status', 'in', '(completed,closed)').lt('due_at', now).order('due_at', { ascending: true }).limit(8),
    admin.from('tasks').select('id, title, due_at, assignee_id, team_members!tasks_assignee_id_fkey(full_name)')
      .not('status', 'in', '(completed,closed)').gte('due_at', now).lte('due_at', new Date(Date.now() + 7 * 86400000).toISOString())
      .order('due_at', { ascending: true }).limit(8),
    admin.from('meetings').select('id, title, starts_at').eq('status', 'held').or('minutes.is.null,minutes.eq.').order('starts_at', { ascending: false }).limit(6),
    admin.from('departments').select('id, name'),
    admin.from('reports').select('department_id, status').eq('kind', 'department').gte('period_start', month.start).lte('period_start', month.end),
  ])

  const nameOf = (row: unknown) => {
    const tm = (row as { team_members?: { full_name: string } | { full_name: string }[] })?.team_members
    return (Array.isArray(tm) ? tm[0]?.full_name : tm?.full_name) ?? '—'
  }
  const submitted = new Set((deptReports ?? []).filter((r) => r.status === 'submitted').map((r) => r.department_id))
  const drafted = new Set((deptReports ?? []).filter((r) => r.status === 'draft').map((r) => r.department_id))

  return (
    <>
      <div className="mt-8" />
      <SectionTitle icon={AlertTriangle}>Organisation follow-through</SectionTitle>
      <p className="-mt-1 mb-3 text-sm text-neutral-500 dark:text-neutral-400">Across every department — this is the deputy view, not just your own work.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">Overdue, org-wide</p>
          {(overdueRows ?? []).length === 0 ? (
            <EmptyState icon={ClipboardCheck} label="Nothing overdue anywhere." />
          ) : (
            <ul className="space-y-2">
              {(overdueRows as (Task & { team_members?: unknown })[] ?? []).map((t) => (
                <li key={t.id}><Link href={`/tasks/${t.id}`} className="block text-sm hover:underline">
                  <span className="font-medium">{t.title}</span>
                  <span className="block text-xs text-red-600">{nameOf(t)} · was due {fmtDay(t.due_at)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Due in the next 7 days</p>
          {(dueSoonRows ?? []).length === 0 ? (
            <EmptyState icon={CalendarClock} label="Nothing coming due this week." />
          ) : (
            <ul className="space-y-2">
              {(dueSoonRows as (Task & { team_members?: unknown })[] ?? []).map((t) => (
                <li key={t.id}><Link href={`/tasks/${t.id}`} className="block text-sm hover:underline">
                  <span className="font-medium">{t.title}</span>
                  <span className="block text-xs text-neutral-500">{nameOf(t)} · due {fmtDay(t.due_at)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="mb-2 text-sm font-semibold text-[#0D1F35] dark:text-white">Meetings held, no minutes yet</p>
          {(heldMeetings ?? []).length === 0 ? (
            <EmptyState icon={FileWarning} label="All caught up." />
          ) : (
            <ul className="space-y-2">
              {heldMeetings!.map((m) => (
                <li key={m.id}><Link href={`/meetings/${m.id}`} className="block text-sm hover:underline">
                  <span className="font-medium">{m.title}</span>
                  <span className="block text-xs text-neutral-500">{fmtDateTime(m.starts_at)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="mb-2 text-sm font-semibold text-[#0D1F35] dark:text-white">{month.label} department reports</p>
          <ul className="space-y-1.5">
            {(departments ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/departments/${d.id}`} className="hover:underline">{d.name}</Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  submitted.has(d.id) ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
                    : drafted.has(d.id) ? 'bg-neutral-200 text-neutral-700 dark:bg-white/10 dark:text-neutral-300'
                      : 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300'}`}>
                  {submitted.has(d.id) ? 'Submitted' : drafted.has(d.id) ? 'Draft' : 'Not started'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
