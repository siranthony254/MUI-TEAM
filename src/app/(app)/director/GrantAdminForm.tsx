'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { grantAdmin } from './actions'
import { useFormToast } from '@/components/Toaster'

export function GrantAdminForm({ people }: { people: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(grantAdmin, undefined)
  useFormToast(state)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Delegate to
          <select name="member_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Choose a person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Until (optional)
          <input name="until" type="date" className={inputClass} />
        </label>
      </div>
      <p className="text-xs text-neutral-500">
        System admins can add and onboard people, set roles, run analytics, send campaigns and see everything in the system.
        They cannot publish official announcements or delegate admin access. With an end date, access ends by itself.
      </p>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Delegating…' : 'Delegate system admin'}</button>
    </form>
  )
}
