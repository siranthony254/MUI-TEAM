import type { Task } from '@/lib/types'

const CLOSED = ['completed', 'closed']

/**
 * Weighted completion: a task's weight is its share of the project, so
 * "Recording" (weight 30) counts for more than "Guest confirmation" (weight 10).
 * With every weight at the default of 1 this is a plain count.
 */
export function weightedProgress(tasks: Pick<Task, 'status' | 'weight'>[]): number | null {
  const total = tasks.reduce((n, t) => n + (t.weight || 1), 0)
  if (total === 0) return null
  const done = tasks.filter((t) => CLOSED.includes(t.status)).reduce((n, t) => n + (t.weight || 1), 0)
  return Math.round((done / total) * 100)
}
