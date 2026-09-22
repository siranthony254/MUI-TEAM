'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import type { TeamMember } from '@/lib/types'
import { updateMember } from '../../actions'
import { useFormToast } from '@/components/Toaster'

interface Option { id: string; label: string }

export function EditMemberForm({
  member, departments, people, topRolesLocked,
}: { member: TeamMember; departments: Option[]; people: Option[]; topRolesLocked: boolean }) {
  const [state, action, pending] = useActionState(updateMember, undefined)
  useFormToast(state)
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={member.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Full name<input name="full_name" required defaultValue={member.full_name} className={inputClass} /></label>
        <label className="block text-sm font-medium">Phone<input name="phone" defaultValue={member.phone ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium">Title<input name="title" defaultValue={member.title ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium">Access level
          <select name="role" defaultValue={member.role} className={inputClass}>
            <option value="member">Team Member</option>
            <option value="guest">Guest / external collaborator</option>
            <option value="executive">Executive</option>
            <option value="super_admin" disabled={topRolesLocked && member.role !== 'super_admin'}>System Admin</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Department
          <select name="department_id" defaultValue={member.department_id ?? ''} className={inputClass}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Reports to
          <select name="reports_to" defaultValue={member.reports_to ?? ''} className={inputClass}>
            <option value="">No one</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <label className={`flex items-start gap-2 text-sm ${topRolesLocked ? 'text-neutral-400' : ''}`}>
        <input type="checkbox" name="is_director" defaultChecked={member.is_director} disabled={topRolesLocked} className="mt-0.5" />
        <span>Executive Director (must hold the Executive access level)</span>
      </label>
      {topRolesLocked && <p className="text-xs text-neutral-500">Only the Executive Director can change system-admin access or the Director role.</p>}
      <label className="block text-sm font-medium">Mandate — why does this role exist?
        <textarea name="mandate" rows={3} defaultValue={member.mandate ?? ''} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Authority — what can they decide without asking?
        <textarea name="authority" rows={3} defaultValue={member.authority ?? ''} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Responsibilities (one per line)
        <textarea name="responsibilities" rows={5} defaultValue={member.responsibilities.join('\n')} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Deliverables (one per line)
        <textarea name="deliverables" rows={4} defaultValue={member.deliverables.join('\n')} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">How success is measured (one per line)
        <textarea name="success_measures" rows={3} defaultValue={(member.success_measures ?? []).join('\n')} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Start date
        <input name="start_date" type="date" defaultValue={member.start_date ?? ''} className={`${inputClass} max-w-[200px]`} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
