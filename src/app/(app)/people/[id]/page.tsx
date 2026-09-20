import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isOverdue } from '@/lib/tasks'
import { fmtDateTime } from '@/lib/time'
import { ROLE_LABEL, type ActivityEntry, type Task, type TeamMember } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { Avatar } from '@/components/Avatar'
import { startDm } from '../../chat/actions'

export const dynamic = 'force-dynamic'

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">Not set yet.</p>
  return <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('team_members').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const person = data as TeamMember

  // Everything below is narrowed by RLS to what the viewer may see.
  const [{ data: taskData }, { data: delegatedData }, { data: projectRows }, { data: taskProjects }, { data: activityData }, { data: departments }, { data: manager }] =
    await Promise.all([
      supabase.from('tasks').select('*').eq('assignee_id', id),
      supabase.from('tasks').select('id, status').eq('delegated_by', id).not('status', 'in', '(completed,closed)'),
      supabase.from('project_members').select('project_id').eq('member_id', id),
      supabase.from('tasks').select('project_id').eq('assignee_id', id).not('project_id', 'is', null),
      supabase.from('activity_log').select('*').eq('actor_id', id).order('created_at', { ascending: false }).limit(15),
      supabase.from('departments').select('id, name'),
      person.reports_to ? supabase.from('team_members').select('id, full_name').eq('id', person.reports_to).maybeSingle() : Promise.resolve({ data: null }),
    ])

  const tasks = (taskData ?? []) as Task[]
  const open = tasks.filter((t) => !['completed', 'closed'].includes(t.status))
  const overdue = open.filter((t) => isOverdue(t)).length
  const done = tasks.length - open.length
  const delegated = (delegatedData ?? []).length

  const projectIds = [...new Set([...(projectRows ?? []).map((r) => r.project_id), ...(taskProjects ?? []).map((r) => r.project_id)])]
  const { data: projects } = projectIds.length
    ? await supabase.from('projects').select('id, name, status').in('id', projectIds)
    : { data: [] as { id: string; name: string; status: string }[] }

  const department = (departments ?? []).find((d) => d.id === person.department_id)?.name

  return (
    <>
      <Link href="/people" className="text-sm text-neutral-500 hover:underline">← People</Link>
      <div className="mt-2" />
      <div className="mb-2"><Avatar name={person.full_name} url={person.avatar_url} size={72} /></div>
      <PageTitle sub={`${person.title ?? ROLE_LABEL[person.role]} · ${ROLE_LABEL[person.role]}${department ? ` · ${department}` : ''}${person.active ? '' : ' · inactive'}`}>
        {person.full_name}
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><p className="text-2xl font-bold">{open.length}</p><p className="text-xs text-neutral-500">Active tasks</p></Card>
        <Card><p className="text-2xl font-bold text-red-600">{overdue}</p><p className="text-xs text-neutral-500">Overdue</p></Card>
        <Card><p className="text-2xl font-bold text-green-600">{done}</p><p className="text-xs text-neutral-500">Completed</p></Card>
        <Card><p className="text-2xl font-bold text-purple-700">{delegated}</p><p className="text-xs text-neutral-500">Delegated out</p></Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle>Mandate</SectionTitle>
          <p className="text-sm">{person.mandate ?? <span className="text-neutral-500">Not set yet.</span>}</p>
          <div className="mt-4" />
          <SectionTitle>Authority</SectionTitle>
          <p className="text-sm">{person.authority ?? <span className="text-neutral-500">Not set yet.</span>}</p>
          {manager && <><div className="mt-4" /><SectionTitle>Reports to</SectionTitle><p className="text-sm"><Link href={`/people/${manager.id}`} className="hover:underline">{manager.full_name}</Link></p></>}
        </Card>
        <Card>
          <SectionTitle>Responsibilities</SectionTitle>
          <List items={person.responsibilities} />
          <div className="mt-4" />
          <SectionTitle>Deliverables</SectionTitle>
          <List items={person.deliverables} />
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle>Projects</SectionTitle>
        {(projects ?? []).length === 0 ? <p className="text-sm text-neutral-500">Not on any project you can see.</p> : (
          <ul className="flex flex-wrap gap-2">
            {(projects ?? []).map((p) => (
              <li key={p.id}><Link href={`/projects/${p.id}`} className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:border-amber-400">{p.name}</Link></li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <SectionTitle>Recent activity</SectionTitle>
        {(activityData ?? []).length === 0 ? <p className="text-sm text-neutral-500">Nothing you can see yet.</p> : (
          <ul className="space-y-1 text-sm">
            {((activityData ?? []) as ActivityEntry[]).map((a) => (
              <li key={a.id}>{a.summary}<span className="ml-1 text-xs text-neutral-400">· {fmtDateTime(a.created_at)}</span></li>
            ))}
          </ul>
        )}
        {me.role === 'super_admin' && <Link href={`/activity?person=${person.id}`} className="mt-3 inline-block text-sm font-medium text-amber-700 hover:underline">Full activity →</Link>}
      </Card>

      {person.id !== me.id && me.role !== 'guest' && (
        <form action={startDm} className="mt-4">
          <input type="hidden" name="member_id" value={person.id} />
          <button className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">Send a message</button>
        </form>
      )}

      <Card className="mt-4">
        <SectionTitle>Contact</SectionTitle>
        <p className="text-sm"><a className="text-amber-700 hover:underline" href={`mailto:${person.email}`}>{person.email}</a></p>
        {person.phone && <p className="text-sm"><a className="text-amber-700 hover:underline" href={`tel:${person.phone}`}>{person.phone}</a></p>}
      </Card>

      {me.role === 'super_admin' && (
        <Link href={`/admin/people/${person.id}`} className="mt-4 inline-block text-sm font-medium text-amber-700 hover:underline">
          Edit role, mandate and responsibilities →
        </Link>
      )}
    </>
  )
}
