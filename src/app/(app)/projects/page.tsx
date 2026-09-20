import Link from 'next/link'
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

interface Stats { project_id: string; task_count: number; done_count: number; overdue_count: number; total_weight: number; done_weight: number }

export default async function Projects() {
  const me = await requireMember()
  const supabase = await createClient()
  const [{ data: projects }, { data: stats }, { data: departments }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.rpc('project_stats_all'),
    supabase.from('departments').select('id, name').order('name'),
  ])
  const byProject = new Map(((stats ?? []) as Stats[]).map((s) => [s.project_id, s]))

  return (
    <>
      <PageTitle sub="Progress is weighted: bigger pieces of work count for more.">Projects</PageTitle>

      {(projects ?? []).length === 0 ? (
        <Card><p className="text-sm text-neutral-600">No projects yet.</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(projects as Project[]).map((p) => {
            const s = byProject.get(p.id)
            const pct = s && s.total_weight > 0 ? Math.round((s.done_weight / s.total_weight) * 100) : null
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="h-full transition hover:border-amber-400">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{p.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status.replace('_', ' ')}</span>
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{p.description}</p>}
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
                    <div className="h-full bg-amber-500" style={{ width: `${pct ?? 0}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {pct === null ? 'No tasks yet' : `${pct}% complete · ${s!.done_count}/${s!.task_count} tasks`}
                    {s && s.overdue_count > 0 && <span className="text-red-600"> · {s.overdue_count} overdue</span>}
                  </p>
                </Card>
              </Link>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">Department
                <select name="department_id" defaultValue="" className={inputClass}>
                  <option value="">None</option>
                  {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Due date<input name="due_date" type="date" className={inputClass} /></label>
            </div>
            <button className={buttonClass}>Create project</button>
          </form>
        </Card>
      )}
    </>
  )
}
