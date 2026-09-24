import Link from 'next/link'
import { CalendarRange, ClipboardList, Megaphone, UserCheck, Users } from 'lucide-react'
import type { TeamMember } from '@/lib/types'
import { hasScope, can } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { fmtDateTime } from '@/lib/time'
import { Card, EmptyState, SectionTitle } from '@/components/ui'

/**
 * The day-to-day operational to-dos for whoever runs the office — onboarding, meeting logistics,
 * scheduled announcements, this week's calendar, and quick people-admin shortcuts. Each piece only
 * shows for someone who actually holds the matching delegated capability, so this composes itself
 * from whatever a Director has handed someone, rather than assuming a fixed "Secretary" role.
 */
export async function SecretaryWidgets({ me }: { me: TeamMember }) {
  const [canOnboarding, canMeetings, canCampaigns, canPeople] = await Promise.all([
    hasScope(me, 'admin.onboarding'),
    can(me, 'schedule_meeting'),
    can(me, 'send_campaign'),
    hasScope(me, 'admin.people'),
  ])
  if (!canOnboarding && !canMeetings && !canCampaigns && !canPeople) return null

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString()

  const [{ data: onboarding }, { data: upcomingMeetings }, { data: scheduledAnn }, { data: weekEvents }] = await Promise.all([
    canOnboarding
      ? admin.from('member_onboarding').select('member_id, team_members!member_onboarding_member_id_fkey(full_name)').is('done_at', null)
      : Promise.resolve({ data: [] }),
    canMeetings
      ? admin.from('meetings').select('id, title, starts_at, agenda').eq('status', 'scheduled').gte('starts_at', now).lte('starts_at', weekAhead).order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    canCampaigns
      ? admin.from('announcements').select('id, title, publish_at').is('notified_at', null).gt('publish_at', now).order('publish_at', { ascending: true }).limit(5)
      : Promise.resolve({ data: [] }),
    canMeetings
      ? admin.from('calendar_events').select('id, title, starts_at, kind').gte('starts_at', now).lte('starts_at', weekAhead).order('starts_at', { ascending: true }).limit(6)
      : Promise.resolve({ data: [] }),
  ])

  const pendingPeople = new Map<string, string>()
  for (const row of (onboarding ?? []) as { member_id: string; team_members?: { full_name: string } | { full_name: string }[] }[]) {
    const tm = row.team_members
    const name = Array.isArray(tm) ? tm[0]?.full_name : tm?.full_name
    if (name) pendingPeople.set(row.member_id, name)
  }
  const needsPrep = (upcomingMeetings ?? []).filter((m) => !m.agenda?.trim())

  return (
    <>
      <div className="mt-8" />
      <SectionTitle icon={ClipboardList}>Office &amp; logistics</SectionTitle>
      <p className="-mt-1 mb-3 text-sm text-neutral-500 dark:text-neutral-400">Your delegated to-dos — this only shows what you've actually been given access to.</p>

      <div className="grid gap-4 md:grid-cols-2">
        {canOnboarding && (
          <Card>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#0D1F35] dark:text-white"><UserCheck size={14} aria-hidden /> Onboarding in progress</p>
            {pendingPeople.size === 0 ? <EmptyState icon={UserCheck} label="Everyone's fully onboarded." /> : (
              <ul className="space-y-1.5">
                {[...pendingPeople.entries()].map(([id, name]) => (
                  <li key={id}><Link href={`/people/${id}`} className="text-sm hover:underline">{name}</Link></li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canMeetings && (
          <Card>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#0D1F35] dark:text-white"><CalendarRange size={14} aria-hidden /> Meetings needing an agenda</p>
            {needsPrep.length === 0 ? <EmptyState icon={CalendarRange} label="All this week's meetings are prepped." /> : (
              <ul className="space-y-1.5">
                {needsPrep.map((m) => (
                  <li key={m.id}><Link href={`/meetings/${m.id}`} className="block text-sm hover:underline">
                    <span className="font-medium">{m.title}</span>
                    <span className="block text-xs text-neutral-500">{fmtDateTime(m.starts_at)}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canCampaigns && (
          <Card>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#0D1F35] dark:text-white"><Megaphone size={14} aria-hidden /> Scheduled announcements</p>
            {(scheduledAnn ?? []).length === 0 ? <EmptyState icon={Megaphone} label="Nothing queued." /> : (
              <ul className="space-y-1.5">
                {scheduledAnn!.map((a) => (
                  <li key={a.id} className="text-sm"><span className="font-medium">{a.title}</span><span className="block text-xs text-neutral-500">Publishes {fmtDateTime(a.publish_at)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canMeetings && (
          <Card>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#0D1F35] dark:text-white"><CalendarRange size={14} aria-hidden /> This week on the calendar</p>
            {(weekEvents ?? []).length === 0 ? <EmptyState icon={CalendarRange} label="Nothing scheduled this week." /> : (
              <ul className="space-y-1.5">
                {weekEvents!.map((e) => (
                  <li key={e.id} className="text-sm"><span className="font-medium">{e.title}</span><span className="block text-xs capitalize text-neutral-500">{e.kind} · {fmtDateTime(e.starts_at)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {canPeople && (
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/admin#new-member" className="flex items-center gap-1 font-medium text-amber-700 hover:underline"><Users size={14} aria-hidden /> Add a member →</Link>
          <Link href="/admin" className="font-medium text-amber-700 hover:underline">People admin →</Link>
        </div>
      )}
    </>
  )
}
