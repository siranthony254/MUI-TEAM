import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Project } from '@/lib/types'
import { Card, PageTitle, buttonClass, inputClass } from '@/components/ui'
import { createProject } from './actions'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<Project['status'], string> = {
  active: 'bg-green-100 text-green-800',
  at_risk: 'bg-red-100 text-red-800',
  paused: 'bg-neutral-200 text-neutral-700',
  done: 'bg-blue-100 text-blue-800',
}

export default async function Projects() {
  const me = await requireMember()
  const supabase = await createClient()
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('tasks').select('project_id, status').not('project_id', 'is', null),
  ])

  const progress = (pid: string) => {
    const all = (tasks ?? []).filter((t) => t.project_id === pid)
    if (all.length === 0) return null
    const done = all.filter((t) => ['completed', 'closed'].includes(t.status)).length
    return Math.round((done / all.length) * 100)
  }

  return (
    <>
      <PageTitle sub="Progress is the share of a project's tasks that are completed.">Projects</PageTitle>

      {(projects ?? []).length === 0 ? (
        <Card><p className="text-sm text-neutral-600">No projects yet.</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(projects as Project[]).map((p) => {
            const pct = progress(p.id)
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{p.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status.replace('_', ' ')}</span>
                </div>
                {p.description && <p className="mt-1 text-sm text-neutral-600">{p.description}</p>}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
                  <div className="h-full bg-amber-500" style={{ width: `${pct ?? 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-neutral-500">{pct === null ? 'No tasks yet' : `${pct}% of tasks completed`}</p>
              </Card>
            )
          })}
        </div>
      )}

      {isExecOrAbove(me) && (
        <Card className="mt-8">
          <h2 className="mb-3 font-semibold">Create a project</h2>
          <form action={createProject} className="space-y-3">
            <label className="block text-sm font-medium">Name<input name="name" required minLength={3} className={inputClass} /></label>
            <label className="block text-sm font-medium">Description<textarea name="description" rows={3} className={inputClass} /></label>
            <label className="block text-sm font-medium">Due date<input name="due_date" type="date" className={inputClass} /></label>
            <button className={buttonClass}>Create project</button>
          </form>
        </Card>
      )}
    </>
  )
}
