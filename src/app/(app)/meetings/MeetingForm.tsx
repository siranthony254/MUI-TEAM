'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { createMeeting } from './actions'

interface Option { id: string; label: string }

export function MeetingForm({ people, projects }: { people: Option[]; projects: Option[] }) {
  const [state, action, pending] = useActionState(createMeeting, undefined)
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">Title
        <input name="title" required minLength={3} placeholder="e.g. Executive Meeting" className={inputClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Starts
          <input name="starts_at" type="datetime-local" required className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Ends (optional)
          <input name="ends_at" type="datetime-local" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Location or link
          <input name="location" placeholder="Room, or a Meet/Zoom link" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Project (optional)
          <select name="project_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">Agenda
        <textarea name="agenda" rows={5} placeholder={'One item per line'} className={inputClass} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Invite</legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="attendees" value={p.id} /> {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Scheduling…' : 'Schedule meeting'}</button>
    </form>
  )
}
