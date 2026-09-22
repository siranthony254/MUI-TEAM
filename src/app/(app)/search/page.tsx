import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime, fmtDay } from '@/lib/time'
import { Card, PageTitle, SectionTitle, EmptyState} from '@/components/ui'

export const dynamic = 'force-dynamic'

const LIMIT = 8

/** Strip characters that would change the meaning of a PostgREST filter. */
const clean = (q: string) => q.replace(/[%_,()\\*"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <div className="mb-6">
      <SectionTitle>{title} ({count})</SectionTitle>
      <Card className="p-0"><ul className="divide-y divide-neutral-100">{children}</ul></Card>
    </div>
  )
}

function Row({ href, title, sub }: { href: string; title: string; sub?: string | null }) {
  return (
    <li>
      <Link href={href} className="block px-4 py-3 hover:bg-neutral-50">
        <span className="block text-sm font-medium">{title}</span>
        {sub && <span className="block truncate text-xs text-neutral-500">{sub}</span>}
      </Link>
    </li>
  )
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw = '' } = await searchParams
  await requireMember()
  const q = clean(raw)
  const supabase = await createClient()
  const like = `%${q}%`

  const ready = q.length >= 2
  // Everything below runs with the searcher's own permissions: they only ever find what they may see.
  const [people, tasks, projects, files, meetings, decisions, announcements, messages, channels] = ready
    ? await Promise.all([
        supabase.from('team_members').select('id, full_name, title, email').eq('active', true).or(`full_name.ilike.${like},title.ilike.${like},email.ilike.${like}`).limit(LIMIT),
        supabase.from('tasks').select('id, title, status, due_at').or(`title.ilike.${like},description.ilike.${like}`).limit(LIMIT),
        supabase.from('projects').select('id, name, description').or(`name.ilike.${like},description.ilike.${like}`).limit(LIMIT),
        supabase.from('resources').select('id, title, category, kind').or(`title.ilike.${like},description.ilike.${like}`).limit(LIMIT),
        supabase.from('meetings').select('id, title, starts_at').ilike('title', like).limit(LIMIT),
        supabase.from('decisions').select('id, number, title, decision').or(`title.ilike.${like},decision.ilike.${like}`).limit(LIMIT),
        supabase.from('announcements').select('id, title, publish_at').or(`title.ilike.${like},body.ilike.${like}`).limit(LIMIT),
        supabase.from('messages').select('id, channel_id, body, created_at').ilike('body', like).is('deleted_at', null).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('channels').select('id, name'),
      ])
    : [null, null, null, null, null, null, null, null, null]

  const chan = (id: string) => (channels?.data ?? []).find((c) => c.id === id)?.name ?? 'chat'
  const total = [people, tasks, projects, files, meetings, decisions, announcements, messages].reduce((n, r) => n + (r?.data?.length ?? 0), 0)

  return (
    <>
      <PageTitle sub="Find people, tasks, projects, files, meetings, decisions, announcements and messages.">Search</PageTitle>

      <form className="mb-6 flex gap-2">
        <input name="q" defaultValue={raw} autoFocus placeholder="Search everything you have access to…" aria-label="Search"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        <button className="rounded-lg bg-amber-500 px-5 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">Search</button>
      </form>

      {!ready ? (
        <Card><p className="text-sm text-neutral-600">Type at least two characters.</p></Card>
      ) : total === 0 ? (
        <Card><EmptyState icon={SearchX} label={`Nothing found for “${q}”.`} /></Card>
      ) : (
        <>
          <Group title="People" count={people!.data?.length ?? 0}>
            {people!.data?.map((p) => <Row key={p.id} href={`/people/${p.id}`} title={p.full_name} sub={[p.title, p.email].filter(Boolean).join(' · ')} />)}
          </Group>
          <Group title="Tasks" count={tasks!.data?.length ?? 0}>
            {tasks!.data?.map((t) => <Row key={t.id} href={`/tasks/${t.id}`} title={t.title} sub={`${String(t.status).replace('_', ' ')}${t.due_at ? ` · due ${fmtDateTime(t.due_at)}` : ''}`} />)}
          </Group>
          <Group title="Projects" count={projects!.data?.length ?? 0}>
            {projects!.data?.map((p) => <Row key={p.id} href={`/projects/${p.id}`} title={p.name} sub={p.description} />)}
          </Group>
          <Group title="Files" count={files!.data?.length ?? 0}>
            {files!.data?.map((f) => <Row key={f.id} href={`/resources/${f.id}`} title={f.title} sub={f.category} />)}
          </Group>
          <Group title="Meetings" count={meetings!.data?.length ?? 0}>
            {meetings!.data?.map((m) => <Row key={m.id} href={`/meetings/${m.id}`} title={m.title} sub={fmtDateTime(m.starts_at)} />)}
          </Group>
          <Group title="Decisions" count={decisions!.data?.length ?? 0}>
            {decisions!.data?.map((d) => <Row key={d.id} href="/decisions" title={`#${String(d.number).padStart(3, '0')} ${d.title}`} sub={d.decision} />)}
          </Group>
          <Group title="Announcements" count={announcements!.data?.length ?? 0}>
            {announcements!.data?.map((a) => <Row key={a.id} href="/announcements" title={a.title} sub={fmtDay(a.publish_at)} />)}
          </Group>
          <Group title="Messages" count={messages!.data?.length ?? 0}>
            {messages!.data?.map((m) => <Row key={m.id} href={`/chat/${m.channel_id}`} title={m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body} sub={`#${chan(m.channel_id)} · ${fmtDateTime(m.created_at)}`} />)}
          </Group>
        </>
      )}
    </>
  )
}
