import type { TaskStatus, TaskPriority } from '@/lib/types'
import { STATUS_LABEL } from '@/lib/types'

const STATUS_STYLE: Record<TaskStatus, string> = {
  not_started: 'bg-neutral-100 text-neutral-700',
  in_progress: 'bg-blue-100 text-blue-800',
  submitted: 'bg-purple-100 text-purple-800',
  under_review: 'bg-purple-100 text-purple-800',
  needs_revision: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
  closed: 'bg-neutral-200 text-neutral-600',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  urgent: 'text-red-700',
  high: 'text-orange-600',
  normal: 'text-neutral-500',
  low: 'text-neutral-400',
}

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return <span className={`text-xs font-medium capitalize ${PRIORITY_STYLE[priority]}`}>{priority}</span>
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-neutral-200 bg-white p-4 ${className}`}>{children}</section>
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold text-[#0D1F35]">{children}</h1>
      {sub && <p className="mt-1 text-sm text-neutral-500">{sub}</p>}
    </div>
  )
}

export const inputClass =
  'mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500'
export const buttonClass =
  'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400 disabled:opacity-60'
