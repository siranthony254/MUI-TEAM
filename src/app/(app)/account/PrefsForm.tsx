'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { saveNotificationPrefs } from './actions'
import { useFormToast } from '@/components/Toaster'

export function PrefsForm({
  email, push, sms, phone,
}: { email: boolean; push: boolean; sms: boolean; phone: string }) {
  const [state, action, pending] = useActionState(saveNotificationPrefs, undefined)
  useFormToast(state)
  return (
    <form action={action} className="max-w-sm space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify_email" defaultChecked={email} /> Email me about assignments and deadlines
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify_push" defaultChecked={push} /> Push notifications on my devices
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify_sms" defaultChecked={sms} /> Text me when something is due today or overdue
      </label>
      <label className="block text-sm font-medium">Phone (for SMS)
        <input name="phone" type="tel" defaultValue={phone} placeholder="0712 345 678" className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save preferences'}</button>
    </form>
  )
}
