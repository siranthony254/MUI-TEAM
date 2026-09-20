import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, PageTitle } from '@/components/ui'
import { TaskForm } from '../TaskForm'
import { createTask } from '../actions'

export const dynamic = 'force-dynamic'

export default async function NewTask() {
  const me = await requireMember()
  const supabase = await createClient()
  const [{ data: members }, { data: projects }] = await Promise.all([
    supabase.from('team_members').select('id, full_name, title').eq('active', true).order('full_name'),
    supabase.from('projects').select('id, name').neq('status', 'done').order('name'),
  ])

  return (
    <>
      <PageTitle sub={isExecOrAbove(me) ? undefined : 'Team members create tasks for themselves.'}>New task</PageTitle>
      <Card>
        <TaskForm
          action={createTask}
          canAssign={isExecOrAbove(me)}
          members={(members ?? []).map((m) => ({ id: m.id, label: m.title ? `${m.full_name} — ${m.title}` : m.full_name }))}
          projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
          submitLabel="Create task"
        />
      </Card>
    </>
  )
}
