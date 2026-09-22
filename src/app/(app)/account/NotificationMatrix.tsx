'use client'

import { useActionState } from 'react'
import { buttonClass } from '@/components/ui'
import type { Group, PrefRow } from '@/lib/notify/groups'
import { saveNotificationMatrix } from './actions'
import { useFormToast } from '@/components/Toaster'

const CHANNELS = [['in_app', 'In-app'], ['email', 'Email'], ['push', 'Push'], ['sms', 'SMS']] as const

export function NotificationMatrix({
  groups, prefs, mandatory, masters,
}: {
  groups: Group[]
  prefs: PrefRow[]
  mandatory: string[]
  masters: { email: boolean; push: boolean; sms: boolean }
}) {
  const [state, action, pending] = useActionState(saveNotificationMatrix, undefined)
  useFormToast(state)
  const value = (g: Group, ch: (typeof CHANNELS)[number][0]) => {
    const row = prefs.find((p) => p.event_group === g.id)
    return row ? row[ch] : g.defaults[ch]
  }
  return (
    <form action={action}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-2 pr-3">Event</th>
              {CHANNELS.map(([k, label]) => (
                <th key={k} className="px-2 py-2 text-center">
                  {label}
                  {k !== 'in_app' && !masters[k as 'email' | 'push' | 'sms'] && <span className="block text-[10px] normal-case text-neutral-400">turned off above</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {groups.map((g) => {
              const locked = mandatory.includes(g.id)
              return (
                <tr key={g.id}>
                  <td className="py-2 pr-3">
                    <span className="font-medium">{g.label}</span>
                    {locked && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">required by admin</span>}
                    <span className="block text-xs text-neutral-500">{g.hint}</span>
                  </td>
                  {CHANNELS.map(([ch]) => {
                    const forced = locked && ch !== 'sms'
                    return (
                      <td key={ch} className="px-2 py-2 text-center">
                        <input
                          type="checkbox" name={`${g.id}.${ch}`} defaultChecked={forced || value(g, ch)} disabled={forced}
                          aria-label={`${g.label} by ${ch}`} />
                        {forced && <input type="hidden" name={`${g.id}.${ch}`} value="on" />}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={`${buttonClass} mt-3`}>{pending ? 'Saving…' : 'Save event settings'}</button>
    </form>
  )
}
