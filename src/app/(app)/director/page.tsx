import Link from 'next/link'
import { requireDirector } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDay, fmtDateTime } from '@/lib/time'
import { isOverdue } from '@/lib/tasks'
import type { Announcement, Project, Report, Task, TeamMember } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { GrantAdminForm } from './GrantAdminForm'
import { revokeAdmin } from './actions'

export const dynamic = 'force-dynamic'

function Action({ href, title, hint }: { href: string; title: string; hint: string }) {
  return (
    <Link href={href}>
      <Card className="h-full transition hover:border-amber-400">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
      </Card>
    </Link>
  )
}

export default async function DirectorDesk() {
  const me = await requireDirector()
  const supabase = await createClient()
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: review }, { data: reports }, { data: allTasks }, { data: projects }, { data: members }, { data: scheduled }, { data: decisions }] =
    await Promise.all([
      supabase.from('tasks').select('id, title, assignee_id, status').eq('assigned_by', me.id).in('status', ['submitted', 'under_review']),
      supabase.from('reports').select('id, author_id, kind, period_start, submitted_at').eq('status', 'submitted').gte('submitted_at', monthAgo).neq('author_id', me.id).order('submitted_at', { ascending: false }),
      supabase.from('tasks').select('id, status, due_at').not('status', 'in', '(completed,closed)'),
      supabase.from('projects').select('id, name, status').neq('status', 'done'),
      supabase.from('team_members').select('*').eq('active', true).order('full_name'),
      supabase.from('announcements').select('id, title, publish_at').gt('publish_at', new Date().toISOString()),
      supabase.from('decisions').select('id').eq('status', 'active'),
    ])

  const people = (members ?? []) as TeamMember[]
  const nameOf = (id: string | null) => people.find((m) => m.id === id)?.full_name ?? '—'
  const overdue = ((allTasks ?? []) as Pick<Task, 'status' | 'due_at'>[]).filter((t) => isOverdue(t)).length
  const atRisk = ((projects ?? []) as Pick<Project, 'status'>[]).filter((p) => p.status === 'at_risk').length
  const admins = people.filter((m) => m.role === 'super_admin')
  const candidates = people.filter((m) => m.role !== 'super_admin' && m.id !== me.id)

  return (
    <>
      <PageTitle sub="What depends on you, and who is covering the system when you are away.">Executive Director&apos;s desk</PageTitle>

      <SectionTitle>Needs your attention</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Link href="/tasks?filter=review"><Card className="transition hover:border-amber-400"><p className="text-3xl font-bold text-purple-700">{(review ?? []).length}</p><p className="text-sm text-neutral-600">Tasks awaiting your review</p></Card></Link>
        <Link href="/reports"><Card className="transition hover:border-amber-400"><p className="text-3xl font-bold">{(reports ?? []).length}</p><p className="text-sm text-neutral-600">Reports submitted (30 days)</p></Card></Link>
        <Link href="/tasks?filter=overdue"><Card className="transition hover:border-amber-400"><p className={`text-3xl font-bold ${overdue ? 'text-red-600' : 'text-green-600'}`}>{overdue}</p><p className="text-sm text-neutral-600">Overdue across MUI</p></Card></Link>
        <Link href="/analytics"><Card className="transition hover:border-amber-400"><p className={`text-3xl font-bold ${atRisk ? 'text-orange-600' : 'text-green-600'}`}>{atRisk}</p><p className="text-sm text-neutral-600">Projects flagged at risk</p></Card></Link>
      </div>

      {(review ?? []).length > 0 && (
        <Card className="mt-3">
          <ul className="space-y-1 text-sm">
            {(review ?? []).slice(0, 6).map((t) => (
              <li key={t.id}><Link href={`/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link><span className="text-neutral-500"> — {nameOf(t.assignee_id)}</span></li>
            ))}
          </ul>
        </Card>
      )}

      {(reports ?? []).length > 0 && (
        <Card className="mt-3">
          <p className="mb-1 text-sm font-medium">Recently submitted reports</p>
          <ul className="space-y-1 text-sm">
            {((reports ?? []) as Pick<Report, 'id' | 'author_id' | 'kind' | 'submitted_at'>[]).slice(0, 5).map((r) => (
              <li key={r.id}><Link href={`/reports/${r.id}`} className="hover:underline">{nameOf(r.author_id)} · {r.kind}</Link><span className="text-neutral-500"> · {fmtDay(r.submitted_at)}</span></li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-8" />
      <SectionTitle>Run the initiative</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <Action href="/announcements" title="Publish an official announcement" hint={`Only you can. ${(scheduled ?? []).length} scheduled.`} />
        <Action href="/admin/campaigns" title="Send a campaign" hint="A targeted message by app, email, push or SMS." />
        <Action href="/analytics" title="Command centre" hint="Organisation-wide health and exceptions." />
        <Action href="/decisions" title="Decisions register" hint={`${(decisions ?? []).length} active decisions.`} />
        <Action href="/meetings/new" title="Schedule a meeting" hint="Invite the executive team or anyone." />
        <Action href="/activity" title="Organisation activity" hint="Everything that happened, with before and after." />
      </div>

      <div className="mt-8" />
      <SectionTitle>System administration cover</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-neutral-600">
          Delegate system administration to a secretary or another executive so people can be onboarded, roles set and updates
          made while you are away. Give an end date and access ends automatically.
        </p>
        <p className="mb-2 text-sm font-medium">Who holds it now</p>
        <ul className="divide-y divide-neutral-100">
          {admins.length === 0 && <li className="py-2 text-sm text-neutral-500">No system admins.</li>}
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{a.full_name}</span>
                <span className="block text-xs text-neutral-500">
                  {a.admin_granted_by
                    ? `Delegated by ${nameOf(a.admin_granted_by)} · ${a.admin_until ? `ends ${fmtDateTime(a.admin_until)}` : 'until you revoke'}`
                    : 'Platform account'}
                </span>
              </span>
              {a.admin_granted_by && (
                <form action={revokeAdmin}>
                  <input type="hidden" name="member_id" value={a.id} />
                  <button className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50">Revoke</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <p className="mb-2 text-sm font-medium">Delegate to someone</p>
          <GrantAdminForm people={candidates.map((p) => ({ id: p.id, label: `${p.full_name}${p.title ? ` — ${p.title}` : ''}` }))} />
        </div>
      </Card>
    </>
  )
}
