'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { addMember } from './actions'

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMember, undefined)
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Full name<input name="full_name" required className={inputClass} /></label>
        <label className="block text-sm font-medium">Email<input name="email" type="email" required className={inputClass} /></label>
        <label className="block text-sm font-medium">Title<input name="title" placeholder="e.g. Insights Director" className={inputClass} /></label>
        <label className="block text-sm font-medium">Access level
          <select name="role" defaultValue="member" className={inputClass}>
            <option value="member">Team Member</option>
            <option value="executive">Executive</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </label>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Adding…' : 'Add member'}</button>
    </form>
  )
}
