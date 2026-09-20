import { requireMember, isExecOrAbove } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { Card, PageTitle } from '@/components/ui'
import { dayKey } from '@/lib/time'
import { TaskForm } from '../TaskForm'

export const dynamic = 'force-dynamic'

export default async function NewTask() {
  const me = await requireMember()
  const supabase = await createClient()
  const { data: dd } = await supabase.from('org_settings').select('value').eq('key', 'default_task_days').maybeSingle()
  const days = Number(dd?.value ?? 7)
  const defaultDue = days > 0 ? `${dayKey(new Date(Date.now() + days * 86400000))}T17:00` : ''
  const [{ data: members }, { data: projects }, { data: departments }] = await Promise.all([
    supabase.from('team_members').select('id, full_name, title, department_id').eq('active', true).order('full_name'),
    supabase.from('projects').select('id, name').neq('status', 'done').order('name'),
    supabase.from('departments').select('id, name').order('name'),
  ])

  const canAssign = await can(me, 'assign_tasks')
  const exec = isExecOrAbove(me)
  const assignable = (members ?? []).filter((m) => exec || (m.department_id && (me.directed_departments ?? []).includes(m.department_id)))

  return (
    <>
      <PageTitle sub={canAssign ? (exec ? undefined : 'You can assign work to members of the department you lead.') : 'You create tasks for yourself.'}>New task</PageTitle>
      <Card>
        <TaskForm
          canAssign={canAssign}
          defaultDue={defaultDue}
          members={assignable.map((m) => ({ id: m.id, label: m.title ? `${m.full_name} — ${m.title}` : m.full_name }))}
          projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
          departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))}
        />
      </Card>
    </>
  )
}
