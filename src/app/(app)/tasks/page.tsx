import Link from 'next/link'
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
  const { data } = await (filter === 'assigned' || filter === 'review'
    ? base.eq('assigned_by', me.id)
    : base.eq('assignee_id', me.id))
  let tasks = (data ?? []) as Task[]

  const isClosed = (t: Task) => ['completed', 'closed'].includes(t.status)
  tasks = tasks.filter((t) => {
    switch (filter) {
      case 'today': return isDueToday(t)
      case 'overdue': return isOverdue(t)
      case 'upcoming': return !isClosed(t) && !isOverdue(t) && !isDueToday(t)
      case 'completed': return isClosed(t)
      case 'review': return ['submitted', 'under_review'].includes(t.status)
      case 'assigned': return true
      default: return !isClosed(t)
    }
  })

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
              <Card className="flex items-center justify-between gap-3 transition hover:border-amber-400">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className={`text-xs ${isOverdue(t) ? 'text-red-600' : 'text-neutral-500'}`}>
                    {fmtDue(t.due_at)} · <PriorityLabel priority={t.priority} />
                  </p>
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
