'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { addMember } from './actions'

interface Option { id: string; label: string }

export function AddMemberForm({ departments, people }: { departments: Option[]; people: Option[] }) {
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
        <label className="block text-sm font-medium">Department
          <select name="department_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Reports to
          <select name="reports_to" defaultValue="" className={inputClass}>
            <option value="">No one</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Adding…' : 'Add member'}</button>
    </form>
  )
}
