'use client'

/**
 * A button inside a <form action={serverAction}> that asks "are you sure?" first.
 * Used for every destructive control so nothing is deleted by a stray tap.
 */
export function ConfirmButton({
  message, children, className = 'text-xs text-neutral-400 hover:text-red-600',
}: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      className={className}
      onClick={(e) => { if (!window.confirm(message)) e.preventDefault() }}
    >
      {children}
    </button>
  )
}

/** Collapsible panel for edit forms, so the page stays quiet until someone wants to change something. */
export function ManagePanel({ label = 'Edit', children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-3 rounded-lg border border-neutral-200 bg-neutral-50 open:bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-[#0D1F35] hover:text-amber-700">{label}</summary>
      <div className="border-t border-neutral-200 p-3">{children}</div>
    </details>
  )
}
