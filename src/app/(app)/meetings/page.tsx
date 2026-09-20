import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireMember } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime } from '@/lib/time'
import type { Meeting } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

function Row({ m }: { m: Meeting }) {
  return (
    <Link href={`/meetings/${m.id}`}>
      <Card className="flex items-center justify-between gap-3 transition hover:border-amber-400">
        <div className="min-w-0">
          <p className="truncate font-medium">{m.title}</p>
          <p className="text-xs text-neutral-500">{fmtDateTime(m.starts_at)}{m.location ? ` · ${m.location}` : ''}</p>
        </div>
        {m.status !== 'scheduled' && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            m.status === 'held' ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-600'}`}>
            {m.status}
          </span>
        )}
      </Card>
    </Link>
  )
}

export default async function Meetings() {
  const me = await requireMember()
  const supabase = await createClient()
  const { data } = await supabase.from('meetings').select('*').order('starts_at', { ascending: true })
  const all = (data ?? []) as Meeting[]

  const now = Date.now()
  const upcoming = all.filter((m) => m.status === 'scheduled' && new Date(m.ends_at ?? m.starts_at).getTime() >= now)
  const past = all.filter((m) => !upcoming.includes(m)).reverse()

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageTitle sub="Agendas, minutes and the actions that come out of them.">Meetings</PageTitle>
        {(await can(me, 'schedule_meeting')) && (
          <Link href="/meetings/new"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">
            <Plus size={16} aria-hidden /> Schedule
          </Link>
        )}
      </div>

      <SectionTitle>Upcoming</SectionTitle>
      {upcoming.length === 0 ? <Card><p className="text-sm text-neutral-600">No upcoming meetings.</p></Card>
        : <div className="space-y-2">{upcoming.map((m) => <Row key={m.id} m={m} />)}</div>}

      {past.length > 0 && (
        <>
          <div className="mt-8" />
          <SectionTitle>Past</SectionTitle>
          <div className="space-y-2">{past.map((m) => <Row key={m.id} m={m} />)}</div>
        </>
      )}
    </>
  )
}
