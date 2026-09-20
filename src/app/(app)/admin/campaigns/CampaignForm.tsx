'use client'

import { useActionState, useState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { sendCampaign } from './actions'

interface Option { id: string; label: string }

export function CampaignForm({ departments, people }: { departments: Option[]; people: Option[] }) {
  const [state, action, pending] = useActionState(sendCampaign, undefined)
  const [audience, setAudience] = useState('all')
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <label className="block text-sm font-medium">Title
        <input name="title" required minLength={3} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Message
        <textarea name="body" rows={5} required maxLength={1000} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Link (optional)
        <input name="link" placeholder="/resources or https://…" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Send to
        <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={inputClass}>
          <option value="all">Everyone</option>
          <option value="executives">Executives (and system admins)</option>
          <option value="members">Team members only</option>
          {departments.map((d) => <option key={d.id} value={`department:${d.id}`}>{d.label} department</option>)}
          <option value="people">Specific people…</option>
        </select>
      </label>
      {audience === 'people' && (
        <fieldset className="grid gap-1 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">People</legend>
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="people" value={p.id} /> {p.label}</label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend className="text-sm font-medium">Also send by</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <label className="flex items-center gap-2 text-neutral-500"><input type="checkbox" checked disabled /> In-app (always)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="channels" value="email" defaultChecked /> Email</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="channels" value="push" defaultChecked /> Push</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="channels" value="sms" /> SMS</label>
        </div>
        <p className="mt-1 text-xs text-neutral-500">People only get email, push or SMS if they turned that channel on. SMS costs money, so it is off by default.</p>
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.ok}</p>}
      <button disabled={pending}
        onClick={(e) => { if (!confirm('Send this campaign now? It can’t be recalled.')) e.preventDefault() }}
        className={buttonClass}>{pending ? 'Sending…' : 'Send campaign'}</button>
    </form>
  )
}
