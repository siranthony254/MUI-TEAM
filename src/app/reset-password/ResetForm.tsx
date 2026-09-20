'use client'

import { useActionState } from 'react'
import { setNewPassword } from './actions'

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, undefined)
  const cls = 'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500'
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium text-neutral-700">New password (at least 10 characters)
        <input name="password" type="password" minLength={10} required autoComplete="new-password" className={cls} />
      </label>
      <label className="block text-sm font-medium text-neutral-700">Confirm it
        <input name="confirm" type="password" minLength={10} required autoComplete="new-password" className={cls} />
      </label>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button disabled={pending}
        className="w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-[#0D1F35] hover:bg-amber-400 disabled:opacity-60">
        {pending ? 'Saving…' : 'Set password and continue'}
      </button>
    </form>
  )
}
