'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

type ToastKind = 'success' | 'error'
interface Toast { id: number; kind: ToastKind; message: string }

// A tiny pub/sub so `toast()` can be called from any client component without a Context
// provider — one <Toaster /> mounted once in the root layout listens for these.
const EVENT = 'mui-toast'
let seq = 0

export function toast(kind: ToastKind, message: string) {
  if (typeof window === 'undefined' || !message) return
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, kind, message } }))
}

/**
 * Wires a server action's `{ error?, ok? }` result up to a toast, on top of whatever the form
 * already renders inline. One line inside a form component — the existing markup is untouched.
 */
export function useFormToast(state: { error?: string; ok?: string } | undefined) {
  const seen = useRef<{ error?: string; ok?: string } | undefined>(undefined)
  useEffect(() => {
    if (!state || state === seen.current) return
    seen.current = state
    if (state.error) toast('error', state.error)
    else if (state.ok) toast('success', state.ok)
  }, [state])
}

const AUTO_DISMISS_MS = 5000

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail
      setToasts((cur) => [...cur.slice(-2), t]) // keep the stack short
      window.setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), AUTO_DISMISS_MS)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`animate-pop-in pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
            t.kind === 'error'
              ? 'border-red-200 bg-red-50/95 text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300'
              : 'border-green-200 bg-green-50/95 text-green-800 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300'
          }`}
        >
          {t.kind === 'error' ? <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />}
          <span>{t.message}</span>
          <button
            onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
            className="ml-1 shrink-0 text-current/60 hover:text-current" aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
