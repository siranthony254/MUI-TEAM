'use client'

import { useActionState } from 'react'
import { buttonClass } from '@/components/ui'
import { CAPABILITIES, type EditableLevel, type Matrix } from '@/lib/capabilities'
import { savePermissions } from './actions'
import { useFormToast } from '@/components/Toaster'

const LEVELS: { id: EditableLevel; label: string; hint: string }[] = [
  { id: 'executive', label: 'Executive', hint: 'incl. the Executive Director' },
  { id: 'department_director', label: 'Dept. director', hint: 'leads a department' },
  { id: 'member', label: 'Team member', hint: '' },
]

export function PermissionMatrix({ matrix }: { matrix: Matrix }) {
  const [state, action, pending] = useActionState(savePermissions, undefined)
  useFormToast(state)
  return (
    <form action={action}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-2 pr-3">Capability</th>
              <th className="px-2 py-2 text-center">System admin</th>
              {LEVELS.map((l) => (
                <th key={l.id} className="px-2 py-2 text-center">{l.label}{l.hint && <span className="block text-[10px] normal-case text-neutral-400">{l.hint}</span>}</th>
              ))}
              <th className="px-2 py-2 text-center">Guest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {CAPABILITIES.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-3"><span className="font-medium">{c.label}</span><span className="block text-xs text-neutral-500">{c.hint}</span></td>
                <td className="px-2 py-2 text-center text-green-700" aria-label="always">✓</td>
                {LEVELS.map((l) => (
                  <td key={l.id} className="px-2 py-2 text-center">
                    <input type="checkbox" name={`${l.id}.${c.id}`} defaultChecked={matrix[l.id][c.id]} aria-label={`${c.label}: ${l.label}`} />
                  </td>
                ))}
                <td className="px-2 py-2 text-center text-neutral-300" aria-label="never">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        System admins always have every capability; guests never do. Some things are fixed by design and not listed here: only the
        Executive Director publishes official announcements and delegates system-admin access, and only system admins manage people and roles.
      </p>
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={`${buttonClass} mt-3`}>{pending ? 'Saving…' : 'Save permissions'}</button>
    </form>
  )
}
