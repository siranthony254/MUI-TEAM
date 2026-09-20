import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isOverdue } from '@/lib/tasks'
import { ROLE_LABEL, type Task } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function Responsibilities() {
  const me = await requireMember()
  const supabase = await createClient()

  const [{ data: taskData }, { data: delegated }, { data: pm }, { data: taskProjects }, { data: departments }, { data: manager }] = await Promise.all([
    supabase.from('tasks').select('*').eq('assignee_id', me.id),
    supabase.from('tasks').select('id').eq('delegated_by', me.id).not('status', 'in', '(completed,closed)'),
    supabase.from('project_members').select('project_id').eq('member_id', me.id),
    supabase.from('tasks').select('project_id').eq('assignee_id', me.id).not('project_id', 'is', null),
    supabase.from('departments').select('id, name'),
    me.reports_to ? supabase.from('team_members').select('id, full_name, title').eq('id', me.reports_to).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const open = ((taskData ?? []) as Task[]).filter((t) => !['completed', 'closed'].includes(t.status))
  const projectIds = [...new Set([...(pm ?? []).map((r) => r.project_id), ...(taskProjects ?? []).map((r) => r.project_id)])]
  const { data: projects } = projectIds.length
    ? await supabase.from('projects').select('id, name').in('id', projectIds)
    : { data: [] as { id: string; name: string }[] }
  const department = (departments ?? []).find((d) => d.id === me.department_id)?.name

  const List = ({ items }: { items: string[] }) =>
    items.length === 0 ? <p className="text-sm text-neutral-500">Not set yet. Ask an administrator to define it.</p>
      : <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>

  return (
    <>
      <PageTitle sub="What you own in general. Tasks are what you need to do now.">My role</PageTitle>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{ROLE_LABEL[me.role]}{department ? ` · ${department}` : ''}</p>
        <p className="mt-1 text-xl font-bold text-[#0D1F35]">{me.title ?? 'Team member'}</p>
        {manager && <p className="mt-1 text-sm text-neutral-600">Reports to <Link href={`/people/${manager.id}`} className="font-medium hover:underline">{manager.full_name}</Link>{manager.title ? `, ${manager.title}` : ''}</p>}
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card><SectionTitle>Mandate</SectionTitle><p className="text-sm">{me.mandate ?? <span className="text-neutral-500">Not set yet.</span>}</p></Card>
        <Card><SectionTitle>Authority — what you can decide without asking</SectionTitle><p className="text-sm">{me.authority ?? <span className="text-neutral-500">Not set yet.</span>}</p></Card>
        <Card><SectionTitle>Responsibilities</SectionTitle><List items={me.responsibilities} /></Card>
        <Card><SectionTitle>Deliverables</SectionTitle><List items={me.deliverables} /></Card>
        {(me.success_measures ?? []).length > 0 && <Card className="md:col-span-2"><SectionTitle>How success is measured</SectionTitle><List items={me.success_measures} /></Card>}
      </div>

      <Card className="mt-4">
        <SectionTitle>Current commitments</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link href="/tasks"><p className="text-2xl font-bold">{open.length}</p><p className="text-xs text-neutral-500">Active tasks</p></Link>
          <Link href="/tasks?filter=overdue"><p className={`text-2xl font-bold ${open.some((t) => isOverdue(t)) ? 'text-red-600' : ''}`}>{open.filter((t) => isOverdue(t)).length}</p><p className="text-xs text-neutral-500">Overdue</p></Link>
          <Link href="/tasks?filter=delegated"><p className="text-2xl font-bold text-purple-700">{(delegated ?? []).length}</p><p className="text-xs text-neutral-500">Delegated out</p></Link>
          <div><p className="text-2xl font-bold">{(projects ?? []).length}</p><p className="text-xs text-neutral-500">Projects</p></div>
        </div>
        {(projects ?? []).length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {(projects ?? []).map((p) => <li key={p.id}><Link href={`/projects/${p.id}`} className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:border-amber-400">{p.name}</Link></li>)}
          </ul>
        )}
      </Card>
    </>
  )
}
