import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDue, isDueToday, isOverdue } from '@/lib/tasks'
import type { Task } from '@/lib/types'
import { Card, PageTitle, PriorityLabel, StatusBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

const FILTERS = [
  ['all', 'All open'],
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['overdue', 'Overdue'],
  ['submitted', 'Submitted'],
  ['delegated', 'Delegated'],
  ['review', 'To review'],
  ['assigned', 'Assigned by me'],
  ['completed', 'Completed'],
] as const

export default async function MyWork({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter = 'all' } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  // RLS decides visibility; these queries just narrow it.
  const base = supabase.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false })
  const scoped =
    filter === 'assigned' || filter === 'review' ? base.eq('assigned_by', me.id)
    : filter === 'delegated' ? base.eq('delegated_by', me.id)
    : base.eq('assignee_id', me.id)

  const [{ data }, { data: members }, { data: projects }] = await Promise.all([
    scoped,
    supabase.from('team_members').select('id, full_name'),
    supabase.from('projects').select('id, name'),
  ])
  const nameOf = (id: string | null) => (members ?? []).find((m) => m.id === id)?.full_name ?? '—'
  const projectOf = (id: string | null) => (projects ?? []).find((p) => p.id === id)?.name

  const isClosed = (t: Task) => ['completed', 'closed'].includes(t.status)
  const tasks = ((data ?? []) as Task[]).filter((t) => {
    switch (filter) {
      case 'today': return isDueToday(t)
      case 'overdue': return isOverdue(t)
      case 'upcoming': return !isClosed(t) && !isOverdue(t) && !isDueToday(t)
      case 'completed': return isClosed(t)
      case 'submitted': return ['submitted', 'under_review'].includes(t.status)
      case 'review': return ['submitted', 'under_review'].includes(t.status)
      case 'delegated': return !isClosed(t)
      case 'assigned': return true
      default: return !isClosed(t)
    }
  })

  const showAssignee = filter === 'assigned' || filter === 'review' || filter === 'delegated'

  return (
    <>
      <PageTitle>My Work</PageTitle>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`/tasks?filter=${key}`}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${
              filter === key ? 'border-[#0D1F35] bg-[#0D1F35] text-white' : 'border-neutral-300 bg-white text-neutral-700'
            }`}>
            {label}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <Card><p className="text-sm text-neutral-600">No tasks here.</p></Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`}>
              <Card className="flex items-start justify-between gap-3 transition hover:border-amber-400">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  {projectOf(t.project_id) && <p className="truncate text-xs text-neutral-500">{projectOf(t.project_id)}</p>}
                  <p className={`mt-0.5 text-xs ${isOverdue(t) ? 'text-red-600' : 'text-neutral-500'}`}>
                    Due {fmtDue(t.due_at)} · <PriorityLabel priority={t.priority} />
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-neutral-500">
                    {showAssignee
                      ? <><span>{nameOf(t.original_assignee_id && filter === 'delegated' ? t.original_assignee_id : t.assigned_by)}</span><ArrowRight size={11} aria-hidden /><span className="font-medium text-neutral-700">{nameOf(t.assignee_id)}</span></>
                      : <span>Assigned by {t.assigned_by === me.id ? 'you' : nameOf(t.assigned_by)}</span>}
                    {t.delegated_by && filter !== 'delegated' && <span>· delegated by {nameOf(t.delegated_by)}</span>}
                  </p>
                  {t.tags.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {t.tags.map((tag) => <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">#{tag}</span>)}
                    </p>
                  )}
                </div>
                <StatusBadge status={t.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
