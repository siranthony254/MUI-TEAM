import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { TaskStatus, TaskPriority } from '@/lib/types'
import { STATUS_LABEL } from '@/lib/types'

const STATUS_STYLE: Record<TaskStatus, string> = {
  not_started: 'bg-neutral-100 text-neutral-700',
  in_progress: 'bg-blue-100 text-blue-800',
  submitted: 'bg-purple-100 text-purple-800',
  under_review: 'bg-purple-100 text-purple-800',
  needs_revision: 'bg-red-100 text-red-800',
  blocked: 'bg-orange-100 text-orange-800',
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

export function Card({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-xl border border-neutral-200/80 bg-white p-4 shadow-sm shadow-neutral-900/[0.04] ${className}`}>
      {children}
    </section>
  )
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
  'mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 hover:border-neutral-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40'
export const buttonClass =
  'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] shadow-sm shadow-amber-900/10 transition-all duration-150 hover:bg-amber-400 hover:shadow active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100'
export const secondaryButtonClass =
  'rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-all duration-150 hover:border-neutral-400 hover:bg-neutral-50 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100'

export function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-neutral-500">
      {Icon && <Icon size={14} aria-hidden className="text-amber-600" />}
      {children}
    </h2>
  )
}

/**
 * A gentler way to say "there's nothing here yet" — an icon and a human sentence instead of a
 * bare line of gray text, with room for one action (a link, a button) when there's an obvious
 * next step.
 */
export function EmptyState({
  icon: Icon, label, hint, action,
}: { icon?: LucideIcon; label: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {Icon && (
        <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Icon size={20} aria-hidden />
        </span>
      )}
      <p className="text-sm font-medium text-neutral-700">{label}</p>
      {hint && <p className="max-w-sm text-sm text-neutral-500">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** A small labelled number for dashboards and summary rows — a step up from a bare stat. */
export function StatTile({
  icon: Icon, label, value, tone = 'neutral', href,
}: { icon?: LucideIcon; label: string; value: React.ReactNode; tone?: 'neutral' | 'red' | 'orange' | 'amber' | 'green' | 'blue'; href?: string }) {
  const TONE: Record<string, string> = {
    neutral: 'text-neutral-700 bg-neutral-100',
    red: 'text-red-700 bg-red-50',
    orange: 'text-orange-700 bg-orange-50',
    amber: 'text-amber-700 bg-amber-50',
    green: 'text-green-700 bg-green-50',
    blue: 'text-blue-700 bg-blue-50',
  }
  const body = (
    <Card className={`flex items-center gap-3 ${href ? 'transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
      {Icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE[tone]}`}><Icon size={18} aria-hidden /></span>}
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none text-[#0D1F35]">{value}</span>
        <span className="block truncate text-xs text-neutral-500">{label}</span>
      </span>
    </Card>
  )
  return href ? <Link href={href} className="block">{body}</Link> : body
}

/** A small ring of current momentum — how much of what's on your plate right now is already done. */
export function ProgressRing({ value, size = 56, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`${pct}% ${label ?? 'complete'}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-neutral-200" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round"
          className="text-amber-500 transition-[stroke-dashoffset] duration-700 ease-out"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
        />
        <text x={size / 2} y={size / 2} dy=".08em" textAnchor="middle" className="rotate-90 fill-[#0D1F35] text-[13px] font-bold" style={{ transformOrigin: 'center', transformBox: 'fill-box' }}>
          {pct}%
        </text>
      </svg>
      {label && <span className="text-[11px] text-neutral-500">{label}</span>}
    </div>
  )
}
