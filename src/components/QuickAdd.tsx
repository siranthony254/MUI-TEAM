'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'

export interface QuickItem { href: string; label: string; hint: string }

/** The global "+" menu. The server decides which items this person may see. */
export function QuickAdd({ items }: { items: QuickItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) { if (e.key === 'Escape') setOpen(false); return }
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">
        <Plus size={16} aria-hidden /> Create
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#101C2C]">
          {items.map((i) => (
            <li key={i.href + i.label} role="none">
              <Link role="menuitem" href={i.href} onClick={() => setOpen(false)} className="block px-4 py-2 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{i.label}</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{i.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
