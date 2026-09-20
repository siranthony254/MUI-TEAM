import type { Project, Task, TeamMember } from '@/lib/types'
import { isOverdue } from '@/lib/tasks'

const DAY = 24 * 60 * 60 * 1000
const CLOSED = ['completed', 'closed']

export interface PersonStat { member: TeamMember; open: number; overdue: number; done30: number; lastActivity: number | null }
export interface ProjectStat { project: Project; total: number; done: number; overdue: number; pct: number | null; atRisk: boolean }
export interface DeptStat { id: string | null; name: string; open: number; overdue: number; total: number; done: number; pct: number | null }

/** Who an executive is responsible for: themselves plus everyone who reports to them, transitively. */
export function reportingLine(me: TeamMember, members: TeamMember[]): Set<string> {
  if (me.role === 'super_admin') return new Set(members.map((m) => m.id))
  const ids = new Set<string>([me.id])
  let grew = true
  while (grew) {
    grew = false
    for (const m of members) {
      if (m.reports_to && ids.has(m.reports_to) && !ids.has(m.id)) { ids.add(m.id); grew = true }
    }
  }
  return ids
}

export function computeAnalytics(args: {
  now: number
  scope: Set<string>
  members: TeamMember[]
  tasks: Task[]
  projects: Project[]
  departments: { id: string; name: string }[]
  updatedAt: Record<string, number>   // task id -> last update ms
}) {
  const { now, scope, members, tasks, projects, departments, updatedAt } = args
  const people = members.filter((m) => m.active && scope.has(m.id))
  const scoped = tasks.filter((t) => t.assignee_id && scope.has(t.assignee_id))
  const open = scoped.filter((t) => !CLOSED.includes(t.status))
  const overdue = open.filter((t) => isOverdue(t, now))
  const review = scoped.filter((t) => ['submitted', 'under_review'].includes(t.status))

  const completedIn = (days: number) =>
    scoped.filter((t) => t.completed_at && now - new Date(t.completed_at).getTime() <= days * DAY)
  const done7 = completedIn(7)
  const done30 = completedIn(30)
  const withDue = done30.filter((t) => t.due_at)
  const onTime = withDue.filter((t) => new Date(t.completed_at!).getTime() <= new Date(t.due_at!).getTime())
  const onTimeRate = withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null

  const persons: PersonStat[] = people.map((m) => {
    const mine = scoped.filter((t) => t.assignee_id === m.id)
    const last = mine.map((t) => updatedAt[t.id] ?? 0).reduce((a, b) => Math.max(a, b), 0)
    return {
      member: m,
      open: mine.filter((t) => !CLOSED.includes(t.status)).length,
      overdue: mine.filter((t) => isOverdue(t, now)).length,
      done30: done30.filter((t) => t.assignee_id === m.id).length,
      lastActivity: last || null,
    }
  }).sort((a, b) => b.overdue - a.overdue || b.open - a.open)

  const projectStats: ProjectStat[] = projects
    .filter((p) => p.status !== 'done')
    .map((p) => {
      const pt = tasks.filter((t) => t.project_id === p.id)
      const done = pt.filter((t) => CLOSED.includes(t.status)).length
      const od = pt.filter((t) => isOverdue(t, now)).length
      return {
        project: p, total: pt.length, done, overdue: od,
        pct: pt.length ? Math.round((done / pt.length) * 100) : null,
        atRisk: p.status === 'at_risk' || od > 0,
      }
    })

  const byDept = new Map<string | null, DeptStat>()
  for (const m of people) {
    const key = m.department_id
    if (!byDept.has(key)) {
      byDept.set(key, {
        id: key, name: departments.find((d) => d.id === key)?.name ?? 'No department',
        open: 0, overdue: 0, total: 0, done: 0, pct: null,
      })
    }
    const d = byDept.get(key)!
    for (const t of scoped.filter((t) => t.assignee_id === m.id)) {
      d.total++
      if (CLOSED.includes(t.status)) d.done++
      else { d.open++; if (isOverdue(t, now)) d.overdue++ }
    }
  }
  const depts = [...byDept.values()]
    .map((d) => ({ ...d, pct: d.total ? Math.round((d.done / d.total) * 100) : null }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open)

  // Quiet = has no tasks touched in 14 days (and isn't simply brand new with nothing assigned).
  const quiet = persons.filter((p) => p.lastActivity !== null && now - p.lastActivity > 14 * DAY && p.open === 0)
  const unassigned = persons.filter((p) => p.lastActivity === null)

  return {
    people, open, overdue, review, done7, done30, onTimeRate, onTimeSample: withDue.length,
    persons, projectStats, depts, quiet, unassigned,
  }
}
