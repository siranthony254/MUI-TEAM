'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { addOnboardingItem, saveWelcome } from './actions'

export function WelcomeForm({ value }: { value: string }) {
  const [state, action, pending] = useActionState(saveWelcome, undefined)
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">Welcome message
        <textarea name="welcome" rows={4} defaultValue={value} className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save message'}</button>
    </form>
  )
}

export function AddStepForm() {
  const [state, action, pending] = useActionState(addOnboardingItem, undefined)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <label className="block text-sm font-medium">Step
        <input name="title" required minLength={3} placeholder="e.g. Read the MUI constitution" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Details (optional)
        <textarea name="description" rows={2} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Link (optional)
        <input name="link" placeholder="/resources or https://…" className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="everyone" /> Also give this step to everyone already on the team
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Adding…' : 'Add step'}</button>
    </form>
  )
}
