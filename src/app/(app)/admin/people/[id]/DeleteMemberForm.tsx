'use client'

import { useActionState } from 'react'
import { inputClass } from '@/components/ui'
import { deleteMember } from '../../../manage-actions'
import { useFormToast } from '@/components/Toaster'

interface Option { id: string; label: string }

/** Permanent removal of a person's account: the one control with no undo, so it asks for their name. */
export function DeleteMemberForm({ member, heirs }: { member: { id: string; full_name: string }; heirs: Option[] }) {
  const [state, action, pending] = useActionState(deleteMember, undefined)
  useFormToast(state)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={member.id} />
      <p className="text-sm text-neutral-700">
        This removes {member.full_name}&apos;s login and profile for good. Their messages in chat and their own reports go with them.
        If you only want them to stop having access, <strong>deactivate</strong> them instead: that keeps the history.
      </p>
      <label className="block text-sm font-medium">Hand their open tasks and projects to
        <select name="reassign_to" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose a person…</option>
          {heirs.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Type <em>{member.full_name}</em> to confirm
        <input name="confirm_name" required autoComplete="off" className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
        {pending ? 'Deleting…' : 'Delete this user permanently'}
      </button>
    </form>
  )
}
