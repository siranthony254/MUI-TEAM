'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { changePassword } from './actions'

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined)
  return (
    <form action={action} className="max-w-sm space-y-3">
      <label className="block text-sm font-medium">New password (min. 10 characters)
        <input name="password" type="password" minLength={10} required autoComplete="new-password" className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Update password'}</button>
    </form>
  )
}
