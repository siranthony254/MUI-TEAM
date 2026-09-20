import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { dayKey, fmtDay, monthParam, parseMonthParam, shiftMonth, TZ } from '@/lib/time'
import type { CalendarEvent, Episode, Meeting, Project, Task } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'
import { EventForm } from './EventForm'
import { deleteEvent } from './actions'

export const dynamic = 'force-dynamic'

type Kind = 'task' | 'meeting' | 'project' | CalendarEvent['kind']
interface Item { day: string; time: string | null; title: string; href: string | null; kind: Kind; sub?: string; eventId?: string; canDelete?: boolean }

const STYLE: Record<Kind, string> = {
  task: 'bg-blue-100 text-blue-900',
  meeting: 'bg-purple-100 text-purple-900',
  project: 'bg-green-100 text-green-900',
  event: 'bg-amber-100 text-amber-900',
  recording: 'bg-red-100 text-red-900',
  publication: 'bg-teal-100 text-teal-900',
  deadline: 'bg-orange-100 text-orange-900',
  other: 'bg-neutral-200 text-neutral-800',
}
const LABEL: Record<Kind, string> = {
  task: 'Task due', meeting: 'Meeting', project: 'Project due', event: 'Event',
  recording: 'Recording', publication: 'Publication', deadline: 'Deadline', other: 'Other',
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-KE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

export default async function Calendar({ searchParams }: { searchParams: Promise<{ m?: string; scope?: string }> }) {
  const { m, scope: rawScope } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  const { year, month } = parseMonthParam(m)
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const next = shiftMonth(year, month, 1)
  const prev = shiftMonth(year, month, -1)
  const from = `${first}T00:00:00+03:00`
  const to = `${next.year}-${String(next.month).padStart(2, '0')}-01T00:00:00+03:00`
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  // Whose deadlines to show: just mine, my department's, or (executives) everyone I can see.
  const scope = rawScope === 'team' && isExecOrAbove(me) ? 'team' : rawScope === 'department' && me.department_id ? 'department' : 'mine'
  const { data: peers } = scope === 'department'
    ? await supabase.from('team_members').select('id').eq('department_id', me.department_id!).eq('active', true)
    : { data: null }
  const { data: allMembers } = await supabase.from('team_members').select('id, full_name')
  const short = (id: string | null) => (allMembers ?? []).find((x) => x.id === id)?.full_name?.split(' ')[0] ?? ''

  let taskQuery = supabase.from('tasks').select('id, title, due_at, status, assignee_id')
    .not('status', 'in', '(completed,closed)').gte('due_at', from).lt('due_at', to)
  if (scope === 'mine') taskQuery = taskQuery.eq('assignee_id', me.id)
  if (scope === 'department') taskQuery = taskQuery.in('assignee_id', (peers ?? []).map((p) => p.id))

  const [{ data: tasks }, { data: meetings }, { data: events }, { data: projects }, { data: episodes }] = await Promise.all([
    taskQuery,
    supabase.from('meetings').select('id, title, starts_at, status').neq('status', 'cancelled').gte('starts_at', from).lt('starts_at', to),
    supabase.from('calendar_events').select('*').gte('starts_at', from).lt('starts_at', to),
    supabase.from('projects').select('id, name, due_date, status').neq('status', 'done')
      .gte('due_date', first).lt('due_date', to.slice(0, 10)),
    supabase.from('episodes').select('id, number, title, recording_at, publish_on, status').neq('status', 'archived')
      .or(`and(recording_at.gte.${from},recording_at.lt.${to}),and(publish_on.gte.${first},publish_on.lt.${to.slice(0, 10)})`),
  ])

  const items: Item[] = [
    ...((tasks ?? []) as Task[]).map((t) => ({
      day: dayKey(t.due_at!), time: timeOf(t.due_at!), kind: 'task' as const, href: `/tasks/${t.id}`,
      title: scope === 'mine' ? t.title : `${t.title} (${short(t.assignee_id)})`,
    })),
    ...((meetings ?? []) as Meeting[]).map((x) => ({ day: dayKey(x.starts_at), time: timeOf(x.starts_at), title: x.title, href: `/meetings/${x.id}`, kind: 'meeting' as const })),
    ...((events ?? []) as CalendarEvent[]).map((e) => ({
      day: dayKey(e.starts_at), time: e.all_day ? null : timeOf(e.starts_at), title: e.title, kind: e.kind,
      sub: [e.description, e.visibility === 'executive' ? 'Executives only' : null].filter(Boolean).join(' · ') || undefined,
      eventId: e.id, canDelete: me.role === 'super_admin' || e.created_by === me.id, href: `/calendar/events/${e.id}`,
    })),
    ...((episodes ?? []) as Pick<Episode, 'id' | 'number' | 'title' | 'recording_at' | 'publish_on'>[]).flatMap((ep) => [
      ...(ep.recording_at && ep.recording_at >= from && ep.recording_at < to
        ? [{ day: dayKey(ep.recording_at), time: timeOf(ep.recording_at), title: `Ep ${ep.number}: ${ep.title}`, href: `/conversations/${ep.id}`, kind: 'recording' as const }]
        : []),
      ...(ep.publish_on && ep.publish_on >= first && ep.publish_on < to.slice(0, 10)
        ? [{ day: ep.publish_on, time: null, title: `Ep ${ep.number} publishes`, href: `/conversations/${ep.id}`, kind: 'publication' as const }]
        : []),
    ]),
    ...((projects ?? []) as Project[]).map((p) => ({ day: p.due_date!, time: null, title: p.name, href: `/projects/${p.id}`, kind: 'project' as const })),
  ].sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? ''))

  const byDay = new Map<string, Item[]>()
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it])

  const monthName = new Date(`${first}T12:00:00+03:00`).toLocaleDateString('en-KE', { timeZone: TZ, month: 'long', year: 'numeric' })
  const offset = (new Date(`${first}T12:00:00+03:00`).getUTCDay() + 6) % 7   // Monday-first
  const today = dayKey()
  const cells: (string | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (cells.length % 7) cells.push(null)

  return (
    <>
      <PageTitle sub="Your tasks, meetings, project deadlines and team events in one place.">Calendar</PageTitle>

      <div className="mb-3 flex gap-2">
        {([['mine', 'Mine'], ...(me.department_id ? [['department', 'My department']] : []), ...(isExecOrAbove(me) ? [['team', 'Whole team']] : [])] as [string, string][]).map(([k, label]) => (
          <Link key={k} href={`/calendar?scope=${k}&m=${monthParam(year, month)}`}
            className={`rounded-full border px-3 py-1 text-sm ${scope === k ? 'border-[#0D1F35] bg-[#0D1F35] text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>
            {label}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <Link href={`/calendar?scope=${scope}&m=${monthParam(prev.year, prev.month)}`} aria-label="Previous month" className="rounded-lg p-2 hover:bg-neutral-100"><ChevronLeft size={20} /></Link>
        <div className="text-center">
          <p className="font-semibold">{monthName}</p>
          <Link href={`/calendar?scope=${scope}`} className="text-xs text-amber-700 hover:underline">Today</Link>
        </div>
        <Link href={`/calendar?scope=${scope}&m=${monthParam(next.year, next.month)}`} aria-label="Next month" className="rounded-lg p-2 hover:bg-neutral-100"><ChevronRight size={20} /></Link>
      </div>

      {/* Month grid (larger screens) */}
      <div className="hidden overflow-hidden rounded-xl border border-neutral-200 bg-white md:block">
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-center text-xs font-medium text-neutral-500">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div key={i} className={`min-h-[96px] border-b border-r border-neutral-100 p-1 ${d === today ? 'bg-amber-50' : ''}`}>
              {d && (
                <>
                  <p className={`mb-1 text-xs ${d === today ? 'font-bold text-amber-700' : 'text-neutral-500'}`}>{Number(d.slice(8))}</p>
                  {(byDay.get(d) ?? []).slice(0, 3).map((it, j) => {
                    const chip = <span className={`mb-0.5 block truncate rounded px-1 py-0.5 text-[11px] ${STYLE[it.kind]}`}>{it.time ? `${it.time} ` : ''}{it.title}</span>
                    return it.href ? <Link key={j} href={it.href}>{chip}</Link> : <div key={j}>{chip}</div>
                  })}
                  {(byDay.get(d) ?? []).length > 3 && <p className="text-[11px] text-neutral-400">+{(byDay.get(d) ?? []).length - 3} more</p>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Agenda list (all screens; the primary view on phones) */}
      <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Agenda</h2>
      {items.length === 0 ? <Card><p className="text-sm text-neutral-600">Nothing scheduled this month.</p></Card> : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day}>
              <p className={`mb-1 text-sm font-medium ${day === today ? 'text-amber-700' : 'text-neutral-700'}`}>
                {fmtDay(day)}{day === today && ' · Today'}
              </p>
              <div className="space-y-1">
                {list.map((it, j) => {
                  const row = (
                    <Card className="flex items-center gap-3 py-3">
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${STYLE[it.kind]}`}>{LABEL[it.kind]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{it.title}</span>
                        <span className="block truncate text-xs text-neutral-500">{it.time ?? 'All day'}{it.sub ? ` · ${it.sub}` : ''}</span>
                      </span>
                      {it.eventId && it.canDelete && (
                        <form action={deleteEvent}>
                          <input type="hidden" name="id" value={it.eventId} />
                          <button className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
                        </form>
                      )}
                    </Card>
                  )
                  return it.href ? <Link key={j} href={it.href}>{row}</Link> : <div key={j}>{row}</div>
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(await can(me, 'add_event')) && (
        <Card id="new" className="mt-8">
          <h2 className="mb-3 font-semibold">Add an event</h2>
          <EventForm />
        </Card>
      )}
    </>
  )
}
