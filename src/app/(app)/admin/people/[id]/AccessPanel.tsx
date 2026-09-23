'use client'

import { useActionState } from 'react'
import { inputClass } from '@/components/ui'
import { deactivateMember, reactivateMember, resetAccess } from '../../actions'
import { useFormToast } from '@/components/Toaster'

interface Option { id: string; label: string }

export function AccessPanel({
  memberId, active, heirs, defaultHeir,
}: { memberId: string; active: boolean; heirs: Option[]; defaultHeir: string }) {
  const [resetState, resetAction, resetting] = useActionState(resetAccess, undefined)
  useFormToast(resetState)
  const [offState, offAction, offing] = useActionState(deactivateMember, undefined)
  useFormToast(offState)
  const [onState, onAction, oning] = useActionState(reactivateMember, undefined)
  useFormToast(onState)

  const msg = (s?: { error?: string; ok?: string }) => (
    <>
      {s?.error && <p role="alert" className="mt-2 text-sm text-red-600">{s.error}</p>}
      {s?.ok && <p role="status" className="mt-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">{s.ok}</p>}
    </>
  )

  return (
    <div className="space-y-6">
      <form action={resetAction}>
        <input type="hidden" name="id" value={memberId} />
        <p className="mb-2 text-sm text-neutral-600">Issue a new one-time password. The current password stops working immediately.</p>
        <button disabled={resetting}
          onClick={(e) => { if (!confirm('Reset this person’s access? Their current password will stop working.')) e.preventDefault() }}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 dark:border-white/15 dark:bg-[#0B1420] dark:text-neutral-200 dark:hover:bg-white/10">
          {resetting ? 'Resetting…' : 'Reset access'}
        </button>
        {msg(resetState)}
      </form>

      {active ? (
        <form action={offAction} className="border-t border-neutral-100 pt-4">
          <input type="hidden" name="id" value={memberId} />
          <p className="mb-2 text-sm text-neutral-600">
            Deactivating blocks their sign-in and moves their open tasks, review duties and project ownership to the person below.
            Their history (tasks, messages, reports, activity) is kept.
          </p>
          <label className="block text-sm font-medium">Their open work goes to
            <select name="reassign_to" defaultValue={defaultHeir} required className={inputClass}>
              <option value="" disabled>Choose a person</option>
              {heirs.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </select>
          </label>
          <button disabled={offing}
            onClick={(e) => { if (!confirm('Deactivate this member? They will be signed out and unable to log in.')) e.preventDefault() }}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
            {offing ? 'Deactivating…' : 'Deactivate member'}
          </button>
          {msg(offState)}
        </form>
      ) : (
        <form action={onAction} className="border-t border-neutral-100 pt-4">
          <input type="hidden" name="id" value={memberId} />
          <p className="mb-2 text-sm text-neutral-600">This member is deactivated. Reactivating restores their access; their old work stays where it is now.</p>
          <button disabled={oning} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400 disabled:opacity-60">
            {oning ? 'Reactivating…' : 'Reactivate member'}
          </button>
          {msg(onState)}
        </form>
      )}
    </div>
  )
}
