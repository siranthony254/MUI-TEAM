'use client'

import { useActionState, useState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { createEvent } from './actions'
import { useFormToast } from '@/components/Toaster'

export function EventForm() {
  const [state, action, pending] = useActionState(createEvent, undefined)
  useFormToast(state)
  const [allDay, setAllDay] = useState(false)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <label className="block text-sm font-medium">Title
        <input name="title" required minLength={3} placeholder="e.g. Episode 003 recording" className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Type
          <select name="kind" defaultValue="event" className={inputClass}>
            <option value="event">Event</option>
            <option value="recording">Recording</option>
            <option value="publication">Publication</option>
            <option value="deadline">Deadline</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Visible to
          <select name="visibility" defaultValue="everyone" className={inputClass}>
            <option value="everyone">Whole team</option>
            <option value="executive">Executives only</option>
          </select>
        </label>
        <label className="block text-sm font-medium">{allDay ? 'Date' : 'Starts'}
          <input name="starts_at" type={allDay ? 'date' : 'datetime-local'} required className={inputClass} />
        </label>
        {!allDay && (
          <label className="block text-sm font-medium">Ends (optional)
            <input name="ends_at" type="datetime-local" className={inputClass} />
          </label>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      <label className="block text-sm font-medium">Notes
        <textarea name="description" rows={2} className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Adding…' : 'Add to calendar'}</button>
    </form>
  )
}
