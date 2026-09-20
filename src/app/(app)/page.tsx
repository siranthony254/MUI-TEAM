import Link from 'next/link'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isDueToday, isOverdue, fmtDue, PRIORITY_ORDER } from '@/lib/tasks'
import type { Task } from '@/lib/types'
import { fmtDateTime, nairobiHour } from '@/lib/time'
import { Card, PageTitle, StatusBadge } from '@/components/ui'
import { markOnboardingDone } from './home-actions'

export const dynamic = 'force-dynamic'

function greeting() {
  const h = nairobiHour()
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

  // Welcome + onboarding checklist, and the latest official announcement.
  const [{ data: welcome }, { data: onboarding }, { data: latestAnn }] = await Promise.all([
    supabase.from('org_settings').select('value').eq('key', 'welcome_message').maybeSingle(),
    supabase.from('member_onboarding').select('item_id, done_at, onboarding_items(title, description, link, position)').eq('member_id', me.id),
    supabase.from('announcements').select('id, title, body, publish_at, priority')
      .lte('publish_at', new Date().toISOString())
      .gte('publish_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('publish_at', { ascending: false }).limit(1),
  ])
  type Step = { item_id: string; done_at: string | null; onboarding_items: { title: string; description: string | null; link: string | null; position: number } | { title: string; description: string | null; link: string | null; position: number }[] | null }
  const steps = ((onboarding ?? []) as unknown as Step[])
    .map((r) => ({ ...r, item: Array.isArray(r.onboarding_items) ? r.onboarding_items[0] : r.onboarding_items }))
    .filter((r) => r.item)
    .sort((a, b) => a.item!.position - b.item!.position)
  const pendingSteps = steps.filter((s) => !s.done_at)

  // Work I handed on and am still waiting for.
  const { count: delegatedOut } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('delegated_by', me.id)
    .not('status', 'in', '(completed,closed)')

  const { data: nextMeetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at')
    .eq('status', 'scheduled')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(3)

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

      {me.is_director && (
        <Link href="/director" className="mb-4 block rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 transition hover:border-amber-400">
          <strong>Executive Director&apos;s desk</strong> — official announcements, what needs you, and delegating system administration while you&apos;re away →
        </Link>
      )}

      {(latestAnn ?? []).length > 0 && (
        <Link href="/announcements" className="mb-4 block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-amber-400">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Official announcement</p>
          <p className="mt-0.5 font-semibold text-[#0D1F35]">{latestAnn![0].title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{latestAnn![0].body}</p>
        </Link>
      )}

      {pendingSteps.length > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <p className="font-semibold text-[#0D1F35]">Welcome to MUI</p>
          {welcome?.value && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{welcome.value}</p>}
          <ul className="mt-3 space-y-2">
            {steps.map((st) => (
              <li key={st.item_id} className="flex items-start gap-3 text-sm">
                <span aria-hidden className={`mt-1 h-4 w-4 shrink-0 rounded border ${st.done_at ? 'border-green-600 bg-green-600' : 'border-neutral-400 bg-white'}`} />
                <span className="min-w-0 flex-1">
                  <span className={st.done_at ? 'text-neutral-400 line-through' : 'font-medium'}>{st.item!.title}</span>
                  {st.item!.description && !st.done_at && <span className="block text-xs text-neutral-600">{st.item!.description}</span>}
                </span>
                {!st.done_at && (
                  <span className="flex shrink-0 items-center gap-3">
                    {st.item!.link && (st.item!.link.startsWith('/')
                      ? <Link href={st.item!.link} className="text-xs font-medium text-amber-700 hover:underline">Open</Link>
                      : <a href={st.item!.link} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-700 hover:underline">Open</a>)}
                    <form action={markOnboardingDone}>
                      <input type="hidden" name="item_id" value={st.item_id} />
                      <button className="text-xs font-medium text-neutral-600 hover:underline">Mark done</button>
                    </form>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

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

      {(delegatedOut ?? 0) > 0 && (
        <Link href="/tasks?filter=delegated" className="mt-4 block rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          <strong>{delegatedOut}</strong> delegated {delegatedOut === 1 ? 'task is' : 'tasks are'} awaiting others →
        </Link>
      )}

      {isExecOrAbove(me) && (toReview ?? 0) > 0 && (
        <Link href="/tasks?filter=review" className="mt-4 block rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
          <strong>{toReview}</strong> {toReview === 1 ? 'task is' : 'tasks are'} waiting for your review →
        </Link>
      )}

      {isExecOrAbove(me) && (
        <Link href="/analytics" className="mt-3 block text-sm font-medium text-amber-700 hover:underline">
          Open the command centre →
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

      {(nextMeetings ?? []).length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Coming up</h2>
          <div className="space-y-2">
            {(nextMeetings ?? []).map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`}>
                <Card className="transition hover:border-amber-400">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-neutral-500">{fmtDateTime(m.starts_at)}</p>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      <Card className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">My responsibility</p>
        <p className="mt-1 font-medium">{me.title ?? 'Team member'}</p>
        {me.mandate ? <p className="mt-1 text-sm text-neutral-600">{me.mandate}</p>
          : <p className="mt-1 text-sm text-neutral-500">Your mandate hasn&apos;t been set yet. Ask an administrator to define it.</p>}
        <Link href="/responsibilities" className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline">
          See my full role, responsibilities and commitments →
        </Link>
      </Card>
    </>
  )
}
