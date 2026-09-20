import Link from 'next/link'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isDueToday, isOverdue, fmtDue, PRIORITY_ORDER } from '@/lib/tasks'
import type { Task } from '@/lib/types'
import { Card, PageTitle, StatusBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default async function Dashboard() {
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('assignee_id', me.id)
    .order('due_at', { ascending: true, nullsFirst: false })
  const mine = (data ?? []) as Task[]
  const open = mine.filter((t) => !['completed', 'closed'].includes(t.status))

  const overdue = open.filter((t) => isOverdue(t))
  const today = open.filter((t) => isDueToday(t))
  const upcoming = open.filter((t) => !isOverdue(t) && !isDueToday(t))
  const done = mine.filter((t) => ['completed', 'closed'].includes(t.status))

  // Work others have handed in for me to review
  const { count: toReview } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_by', me.id)
    .in('status', ['submitted', 'under_review'])

  const focus = [...overdue, ...today]
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 6)

  const stats = [
    { label: 'Overdue', n: overdue.length, tone: 'text-red-600', filter: 'overdue' },
    { label: 'Due today', n: today.length, tone: 'text-orange-600', filter: 'today' },
    { label: 'Upcoming', n: upcoming.length, tone: 'text-amber-600', filter: 'upcoming' },
    { label: 'Completed', n: done.length, tone: 'text-green-600', filter: 'completed' },
  ]

  return (
    <>
      <PageTitle sub="What do you need to know and do right now?">
        {greeting()}, {me.full_name.split(' ')[0]}.
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={`/tasks?filter=${s.filter}`}>
            <Card className="transition hover:border-amber-400">
              <p className={`text-3xl font-bold ${s.tone}`}>{s.n}</p>
              <p className="text-sm text-neutral-600">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {isExecOrAbove(me) && (toReview ?? 0) > 0 && (
        <Link href="/tasks?filter=review" className="mt-4 block rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
          <strong>{toReview}</strong> {toReview === 1 ? 'task is' : 'tasks are'} waiting for your review →
        </Link>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Needs your attention</h2>
      {focus.length === 0 ? (
        <Card><p className="text-sm text-neutral-600">Nothing overdue or due today. </p></Card>
      ) : (
        <div className="space-y-2">
          {focus.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`}>
              <Card className="flex items-center justify-between gap-3 transition hover:border-amber-400">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className={`text-xs ${isOverdue(t) ? 'text-red-600' : 'text-neutral-500'}`}>
                    {isOverdue(t) ? 'Overdue · ' : 'Due · '}{fmtDue(t.due_at)}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">My responsibility</p>
        <p className="mt-1 font-medium">{me.title ?? 'Team member'}</p>
        {me.mandate ? <p className="mt-1 text-sm text-neutral-600">{me.mandate}</p>
          : <p className="mt-1 text-sm text-neutral-500">Your mandate hasn&apos;t been set yet. Ask an administrator to define it.</p>}
        <Link href={`/people/${me.id}`} className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline">
          View my role profile →
        </Link>
      </Card>
    </>
  )
}
