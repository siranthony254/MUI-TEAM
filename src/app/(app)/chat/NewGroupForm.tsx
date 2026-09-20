'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { createGroup } from './actions'

export function NewGroupForm({ people }: { people: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createGroup, undefined)
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">Group name
        <input name="name" required minLength={2} className={inputClass} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Members</legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="members" value={p.id} /> {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Creating…' : 'Create group'}</button>
    </form>
  )
}
