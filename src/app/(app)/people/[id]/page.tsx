import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isOverdue } from '@/lib/tasks'
import { ROLE_LABEL, type Task, type TeamMember } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'

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

  // RLS narrows this to tasks the viewer is allowed to see.
  const { data: taskData } = await supabase.from('tasks').select('*').eq('assignee_id', id)
  const tasks = (taskData ?? []) as Task[]
  const open = tasks.filter((t) => !['completed', 'closed'].includes(t.status))
  const overdue = open.filter((t) => isOverdue(t)).length
  const done = tasks.length - open.length

  return (
    <>
      <Link href="/people" className="text-sm text-neutral-500 hover:underline">← People</Link>
      <div className="mt-2" />
      <PageTitle sub={`${person.title ?? ROLE_LABEL[person.role]} · ${ROLE_LABEL[person.role]}`}>{person.full_name}</PageTitle>

      <div className="grid grid-cols-3 gap-3">
        <Card><p className="text-2xl font-bold">{open.length}</p><p className="text-xs text-neutral-500">Open tasks</p></Card>
        <Card><p className="text-2xl font-bold text-red-600">{overdue}</p><p className="text-xs text-neutral-500">Overdue</p></Card>
        <Card><p className="text-2xl font-bold text-green-600">{done}</p><p className="text-xs text-neutral-500">Completed</p></Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Mandate</h2>
          <p className="text-sm">{person.mandate ?? <span className="text-neutral-500">Not set yet.</span>}</p>
          <h2 className="mt-4 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Authority</h2>
          <p className="text-sm">{person.authority ?? <span className="text-neutral-500">Not set yet.</span>}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Responsibilities</h2>
          <List items={person.responsibilities} />
          <h2 className="mt-4 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Deliverables</h2>
          <List items={person.deliverables} />
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Contact</h2>
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
