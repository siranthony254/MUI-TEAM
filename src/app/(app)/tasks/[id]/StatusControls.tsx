'use client'

import { useActionState } from 'react'
import type { Transition } from '@/lib/tasks'
import { inputClass } from '@/components/ui'
import { changeStatus } from '../actions'
import { useFormToast } from '@/components/Toaster'

const TONE = {
  primary: 'bg-amber-500 text-[#0D1F35] hover:bg-amber-400',
  neutral: 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50',
  danger: 'bg-red-600 text-white hover:bg-red-500',
}

export function StatusControls({ id, transitions }: { id: string; transitions: Transition[] }) {
  const [state, action, pending] = useActionState(changeStatus, undefined)
  useFormToast(state)
  if (transitions.length === 0) return null

  const needsNote = transitions.some((t) => t.needsNote)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {needsNote && (
        <label className="block text-sm font-medium">
          Note (required for evidence, a revision request, or when you're blocked)
          <textarea name="note" rows={3} className={inputClass} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          // The clicked button's name/value is submitted with the form.
          <button key={t.to} name="to" value={t.to} disabled={pending}
            className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${TONE[t.tone]}`}>
            {t.label}
          </button>
        ))}
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
