'use client'

import { useActionState, useState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { createAnnouncement } from './actions'
import { useFormToast } from '@/components/Toaster'

export function AnnouncementForm({ departments }: { departments: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createAnnouncement, undefined)
  useFormToast(state)
  const [audience, setAudience] = useState('all')
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <label className="block text-sm font-medium">Title
        <input name="title" required minLength={3} placeholder="e.g. Semester execution plan" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Message
        <textarea name="body" rows={6} required className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Audience
          <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={inputClass}>
            <option value="all">Whole team</option>
            <option value="executives">Executives only</option>
            <option value="department">One department</option>
          </select>
        </label>
        {audience === 'department' && (
          <label className="block text-sm font-medium">Department
            <select name="department_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>Choose…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">Priority
          <select name="priority" defaultValue="normal" className={inputClass}>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent (also sent by SMS to those who opted in)</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Publish at (leave empty to publish now)
          <input name="publish_at" type="datetime-local" className={inputClass} />
        </label>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Publishing…' : 'Publish announcement'}</button>
    </form>
  )
}
