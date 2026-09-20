import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { channelEnabled } from '@/lib/notify/channels'
import { fmtDateTime } from '@/lib/time'
import { ROLE_LABEL, type TeamMember } from '@/lib/types'
import { Card, PageTitle, SectionTitle, buttonClass, inputClass } from '@/components/ui'
import { AddMemberForm } from './AddMemberForm'
import { addDepartment } from './actions'

export const dynamic = 'force-dynamic'

function Stat({ label, value, sub, tone = '' }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Card>
      <p className={`text-3xl font-bold ${tone}`}>{value}</p>
      <p className="text-sm text-neutral-600">{label}</p>
      {sub && <p className="mt-1 text-xs text-neutral-400">{sub}</p>}
    </Card>
  )
}

function Health({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok === null ? 'bg-neutral-300' : ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <span><span className="font-medium">{label}</span>{detail && <span className="text-neutral-500"> — {detail}</span>}</span>
    </li>
  )
}

export default async function AdminHome() {
  const me = await requireRole('super_admin')
  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [members, departments, projects, openTasks, overdueTasks, pending, sent24, lastRun, dbProbe] = await Promise.all([
    admin.from('team_members').select('*').order('full_name'),
    admin.from('departments').select('id, name').order('name'),
    admin.from('projects').select('id', { count: 'exact', head: true }).neq('status', 'done'),
    admin.from('tasks').select('id', { count: 'exact', head: true }).not('status', 'in', '(completed,closed)'),
    admin.from('tasks').select('id', { count: 'exact', head: true }).not('status', 'in', '(completed,closed)').lt('due_at', new Date().toISOString()),
    admin.from('notifications').select('id', { count: 'exact', head: true }).or('email_sent_at.is.null,push_sent_at.is.null,sms_sent_at.is.null').gte('created_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
    admin.from('notifications').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('system_runs').select('*').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('team_members').select('id', { count: 'exact', head: true }),
  ])

  const people = (members.data ?? []) as TeamMember[]
  const active = people.filter((m) => m.active)
  const run = lastRun.data as { ran_at: string; error: string | null; failed: number; reminders: number; spawned: number } | null
  const runAgeMin = run ? (Date.now() - new Date(run.ran_at).getTime()) / 60000 : null
  const schedulerOk = run ? runAgeMin! <= 15 && !run.error : false
  const noPhones = active.filter((m) => m.notify_sms && !m.phone).length
  const director = active.find((m) => m.is_director)
  const topRolesLocked = !!director && !me.is_director

  return (
    <>
      <PageTitle sub="System administration: people, roles, onboarding, campaigns and platform health.">System admin</PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active users" value={active.length} sub={`${people.length - active.length} inactive`} />
        <Stat label="Departments" value={(departments.data ?? []).length} />
        <Stat label="Live projects" value={projects.count ?? 0} />
        <Stat label="Active tasks" value={openTasks.count ?? 0} sub={`${overdueTasks.count ?? 0} overdue`} tone={overdueTasks.count ? '' : ''} />
        <Stat label="Notifications (24h)" value={sent24.count ?? 0} />
        <Stat label="Awaiting delivery" value={pending.count ?? 0} tone={(pending.count ?? 0) > 20 ? 'text-orange-600' : ''} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Link href="/admin/onboarding"><Card className="h-full transition hover:border-amber-400"><p className="font-semibold">Onboarding</p><p className="mt-0.5 text-xs text-neutral-500">Welcome message and the checklist new members get.</p></Card></Link>
        <Link href="/admin/campaigns"><Card className="h-full transition hover:border-amber-400"><p className="font-semibold">Campaigns</p><p className="mt-0.5 text-xs text-neutral-500">Send a message to part of the team.</p></Card></Link>
        <Link href="/analytics"><Card className="h-full transition hover:border-amber-400"><p className="font-semibold">Analytics</p><p className="mt-0.5 text-xs text-neutral-500">Organisation-wide command centre.</p></Card></Link>
      </div>

      <Card className="mt-4">
        <SectionTitle>Executive Director</SectionTitle>
        <p className="text-sm">{director ? <><strong>{director.full_name}</strong>{director.title ? ` — ${director.title}` : ''}. Only they can publish official announcements and delegate system-admin access.</> : <span className="text-neutral-600">Not set yet. Add the Executive Director as a member below (or open their profile and tick &ldquo;Executive Director&rdquo;) so the initiative&apos;s leader has their own desk. Until then, a system admin can set this up.</span>}</p>
      </Card>

      <Card className="mt-4">
        <SectionTitle>System health</SectionTitle>
        <ul className="divide-y divide-neutral-50">
          <Health ok={!dbProbe.error} label="Database" detail={dbProbe.error ? dbProbe.error.message : 'reachable'} />
          <Health
            ok={run ? schedulerOk : false}
            label="Scheduler (reminders & delivery)"
            detail={run
              ? `${run.error ? `last run failed: ${run.error}` : `last ran ${fmtDateTime(run.ran_at)}`}${runAgeMin! > 15 ? ' — more than 15 minutes ago' : ''}`
              : 'has never run. Set up the cron job from the README so reminders are sent.'}
          />
          <Health ok={channelEnabled.email()} label="Email delivery" detail={channelEnabled.email() ? 'configured' : 'not configured (RESEND_API_KEY)'} />
          <Health ok={channelEnabled.push()} label="Push notifications" detail={channelEnabled.push() ? 'configured' : 'not configured (VAPID keys)'} />
          <Health ok={channelEnabled.sms()} label="SMS delivery" detail={channelEnabled.sms() ? 'configured' : 'not configured (Africa\'s Talking)'} />
          {noPhones > 0 && <Health ok={false} label="SMS opt-ins without a phone number" detail={`${noPhones} member(s) will not receive texts`} />}
        </ul>
      </Card>

      <Card className="mt-4">
        <SectionTitle>Team ({people.length})</SectionTitle>
        <ul className="divide-y divide-neutral-100">
          {people.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/people/${m.id}`} className={`flex items-center justify-between gap-3 py-2 hover:bg-neutral-50 ${m.active ? '' : 'opacity-60'}`}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.full_name}{!m.active && ' (inactive)'}</span>
                  <span className="block truncate text-xs text-neutral-500">{m.title ?? '—'} · {m.email}</span>
                </span>
                <span className="text-xs font-medium text-neutral-600">{ROLE_LABEL[m.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/activity" className="mt-3 inline-block text-sm font-medium text-amber-700 hover:underline">Organisation-wide activity →</Link>
      </Card>

      <Card className="mt-4">
        <SectionTitle>Add a team member</SectionTitle>
        <AddMemberForm
          departments={(departments.data ?? []).map((d) => ({ id: d.id, label: d.name }))}
          people={active.map((m) => ({ id: m.id, label: m.full_name }))}
          topRolesLocked={topRolesLocked}
        />
      </Card>

      <Card className="mt-4">
        <SectionTitle>Departments</SectionTitle>
        <p className="mb-3 text-sm text-neutral-600">{(departments.data ?? []).map((d) => d.name).join(' · ') || 'None yet.'}</p>
        <form action={addDepartment} className="flex gap-2">
          <input name="name" placeholder="e.g. Conversations" required className={inputClass} />
          <button className={`${buttonClass} mt-1`}>Add</button>
        </form>
      </Card>
    </>
  )
}
