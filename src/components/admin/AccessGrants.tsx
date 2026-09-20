'use client'

import { useActionState, useState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { ACCESS_PRESETS, ADMIN_SCOPES, CAPABILITIES, type Capability, type Scope } from '@/lib/capabilities'
import { saveGrants } from '@/app/(app)/admin/actions'

type Choice = 'default' | 'allow' | 'deny'

export interface GrantsInitial {
  caps: Partial<Record<Capability, 'allow' | 'deny'>>
  scopes: Scope[]
  until: string          // YYYY-MM-DD or ''
}

/** Per-person access: what their level gives them, plus extra capabilities and slices of administration. */
function Fields({
  initial, defaults, canGrantPermissions,
}: { initial: GrantsInitial; defaults?: Record<string, boolean>; canGrantPermissions: boolean }) {
  const [caps, setCaps] = useState<Record<string, Choice>>(
    Object.fromEntries(CAPABILITIES.map((c) => [c.id, initial.caps[c.id] ?? 'default'])),
  )
  const [scopes, setScopes] = useState<Set<string>>(new Set(initial.scopes))
  const [until, setUntil] = useState(initial.until)

  function applyPreset(id: string) {
    const p = ACCESS_PRESETS.find((x) => x.id === id)
    if (!p) return
    setCaps(Object.fromEntries(CAPABILITIES.map((c) => [c.id, p.caps[c.id] ?? 'default'])))
    setScopes((prev) => {
      const next = new Set(p.scopes as string[])
      // A Permissions slice already held stays unless the person removes it themselves.
      if (prev.has('admin.permissions')) next.add('admin.permissions')
      return next
    })
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="grants_present" value="1" />

      <div>
        <p className="mb-1 text-sm font-medium">Start from a preset</p>
        <div className="flex flex-wrap gap-2">
          {ACCESS_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => applyPreset(p.id)} title={p.hint}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm hover:border-amber-400">{p.label}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-500">Presets just fill in the choices below; you can change anything before saving.</p>
      </div>

      <fieldset className="rounded-xl border border-neutral-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">What they can do</legend>
        <ul className="divide-y divide-neutral-100">
          {CAPABILITIES.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs text-neutral-500">{c.hint}</span>
              </span>
              <select name={`cap.${c.id}`} value={caps[c.id]} onChange={(e) => setCaps((p) => ({ ...p, [c.id]: e.target.value as Choice }))}
                aria-label={c.label} className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm">
                <option value="default">Follow their level{defaults ? ` (${defaults[c.id] ? 'yes' : 'no'})` : ''}</option>
                <option value="allow">Always allow</option>
                <option value="deny">Never allow</option>
              </select>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="rounded-xl border border-neutral-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">System administration they can do</legend>
        <p className="mb-2 text-xs text-neutral-500">
          Delegate part of the admin console without making them a full system admin. They can never make anyone a system admin or the Director.
        </p>
        <div className="space-y-2">
          {ADMIN_SCOPES.map((s) => {
            const locked = s.id === 'admin.permissions' && !canGrantPermissions
            return (
              <label key={s.id} className={`flex items-start gap-2 text-sm ${locked ? 'text-neutral-400' : ''}`}>
                <input type="checkbox" name={`scope.${s.id}`} disabled={locked} checked={scopes.has(s.id)}
                  onChange={(e) => setScopes((prev) => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })}
                  className="mt-0.5" />
                <span>{s.label}<span className="block text-xs text-neutral-500">{s.hint}{locked ? ' — only the Executive Director or a system admin can grant this.' : ''}</span></span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <label className="block text-sm font-medium">All of the above ends on (optional)
        <input name="until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inputClass} max-w-[200px]`} />
        <span className="mt-1 block text-xs font-normal text-neutral-500">Useful for cover while someone is away. Leave empty for no end date.</span>
      </label>
    </div>
  )
}

/** Embedded in another form (adding a member): no save button of its own. */
export function AccessGrantsFields(props: { defaults?: Record<string, boolean>; canGrantPermissions: boolean }) {
  return <Fields initial={{ caps: {}, scopes: [], until: '' }} {...props} />
}

/** Stand-alone panel on a person's page. */
export function AccessGrantsPanel({
  memberId, initial, defaults, canGrantPermissions,
}: { memberId: string; initial: GrantsInitial; defaults: Record<string, boolean>; canGrantPermissions: boolean }) {
  const [state, action, pending] = useActionState(saveGrants, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="member_id" value={memberId} />
      <Fields initial={initial} defaults={defaults} canGrantPermissions={canGrantPermissions} />
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save access'}</button>
    </form>
  )
}
