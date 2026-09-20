'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { RESOURCE_CATEGORIES } from '@/lib/types'
import type { Announcement, CalendarEvent, Decision, Meeting, Resource, Task } from '@/lib/types'
import { isoToLocalInput } from '@/lib/time'
import {
  updateAnnouncement, updateDecision, updateEvent, updateMeeting, updateResource, updateTask, editMessage,
  type ManageState,
} from './manage-actions'

interface Option { id: string; label: string }

function Feedback({ state }: { state?: ManageState }) {
  return (
    <>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
    </>
  )
}

const label = 'block text-sm font-medium'

export function TaskEditForm({ task, projects, departments }: { task: Task; projects: Option[]; departments: Option[] }) {
  const [state, action, pending] = useActionState(updateTask, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={task.id} />
      <label className={label}>Title<input name="title" required defaultValue={task.title} className={inputClass} /></label>
      <label className={label}>Description<textarea name="description" rows={3} defaultValue={task.description ?? ''} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Priority
          <select name="priority" defaultValue={task.priority} className={inputClass}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </label>
        <label className={label}>Deadline (Nairobi time)<input name="due_at" type="datetime-local" defaultValue={isoToLocalInput(task.due_at)} className={inputClass} /></label>
        <label className={label}>Starts<input name="start_date" type="date" defaultValue={task.start_date ?? ''} className={inputClass} /></label>
        <label className={label}>Weight in project<input name="weight" type="number" min={1} max={100} defaultValue={task.weight} className={inputClass} /></label>
        <label className={label}>Project
          <select name="project_id" defaultValue={task.project_id ?? ''} className={inputClass}>
            <option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className={label}>Department
          <select name="department_id" defaultValue={task.department_id ?? ''} className={inputClass}>
            <option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      </div>
      <label className={label}>Tags (comma separated)<input name="tags" defaultValue={task.tags.join(', ')} className={inputClass} /></label>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="require_approval" defaultChecked={task.require_approval} /> Needs my approval when done</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="requires_evidence" defaultChecked={task.requires_evidence} /> Needs evidence</label>
      </div>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save task'}</button>
    </form>
  )
}

export function MeetingEditForm({ meeting }: { meeting: Meeting }) {
  const [state, action, pending] = useActionState(updateMeeting, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={meeting.id} />
      <label className={label}>Title<input name="title" required defaultValue={meeting.title} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Starts (Nairobi time)<input name="starts_at" type="datetime-local" required defaultValue={isoToLocalInput(meeting.starts_at)} className={inputClass} /></label>
        <label className={label}>Ends<input name="ends_at" type="datetime-local" defaultValue={isoToLocalInput(meeting.ends_at)} className={inputClass} /></label>
      </div>
      <label className={label}>Location or link<input name="location" defaultValue={meeting.location ?? ''} className={inputClass} /></label>
      <label className={label}>Agenda<textarea name="agenda" rows={3} defaultValue={meeting.agenda ?? ''} className={inputClass} /></label>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save meeting'}</button>
    </form>
  )
}

export function DecisionEditForm({ decision, people, projects }: { decision: Decision; people: Option[]; projects: Option[] }) {
  const [state, action, pending] = useActionState(updateDecision, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={decision.id} />
      <label className={label}>Title<input name="title" required defaultValue={decision.title} className={inputClass} /></label>
      <label className={label}>Decision<textarea name="decision" rows={3} required defaultValue={decision.decision} className={inputClass} /></label>
      <label className={label}>Why<textarea name="rationale" rows={2} defaultValue={decision.rationale ?? ''} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Decided on<input name="decided_on" type="date" defaultValue={decision.decided_on} className={inputClass} /></label>
        <label className={label}>Decided by<input name="decided_by" defaultValue={decision.decided_by ?? ''} className={inputClass} /></label>
        <label className={label}>Implementation owner
          <select name="implementation_owner_id" defaultValue={decision.implementation_owner_id ?? ''} className={inputClass}>
            <option value="">None</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className={label}>Project
          <select name="project_id" defaultValue={decision.project_id ?? ''} className={inputClass}>
            <option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save decision'}</button>
    </form>
  )
}

export function EventEditForm({ event }: { event: CalendarEvent }) {
  const [state, action, pending] = useActionState(updateEvent, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={event.id} />
      <label className={label}>Title<input name="title" required defaultValue={event.title} className={inputClass} /></label>
      <label className={label}>Details<textarea name="description" rows={2} defaultValue={event.description ?? ''} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Kind
          <select name="kind" defaultValue={event.kind} className={inputClass}>
            <option value="event">Event</option><option value="recording">Recording</option><option value="publication">Publication</option>
            <option value="deadline">Deadline</option><option value="other">Other</option>
          </select>
        </label>
        <label className={label}>Who can see it
          <select name="visibility" defaultValue={event.visibility} className={inputClass}>
            <option value="everyone">Everyone</option><option value="executive">Executives only</option>
          </select>
        </label>
        <label className={label}>Starts (Nairobi time)<input name="starts_at" type="datetime-local" required defaultValue={isoToLocalInput(event.starts_at)} className={inputClass} /></label>
        <label className={label}>Ends<input name="ends_at" type="datetime-local" defaultValue={isoToLocalInput(event.ends_at)} className={inputClass} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="all_day" defaultChecked={event.all_day} /> All day</label>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save event'}</button>
    </form>
  )
}

export function ResourceEditForm({ resource }: { resource: Resource }) {
  const [state, action, pending] = useActionState(updateResource, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={resource.id} />
      <label className={label}>Title<input name="title" required defaultValue={resource.title} className={inputClass} /></label>
      <label className={label}>Description<textarea name="description" rows={2} defaultValue={resource.description ?? ''} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Category
          <select name="category" defaultValue={resource.category} className={inputClass}>
            {RESOURCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className={label}>Who can see it
          <select name="visibility" defaultValue={resource.visibility} className={inputClass}>
            <option value="everyone">Everyone</option><option value="executive">Executives only</option>
          </select>
        </label>
      </div>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save details'}</button>
    </form>
  )
}

export function AnnouncementEditForm({ announcement }: { announcement: Announcement }) {
  const [state, action, pending] = useActionState(updateAnnouncement, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={announcement.id} />
      <label className={label}>Title<input name="title" required defaultValue={announcement.title} className={inputClass} /></label>
      <label className={label}>Message<textarea name="body" rows={4} required defaultValue={announcement.body} className={inputClass} /></label>
      <label className={label}>Priority
        <select name="priority" defaultValue={announcement.priority} className={inputClass}>
          <option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option>
        </select>
      </label>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save announcement'}</button>
    </form>
  )
}

/** Inline editor for a chat message: click "Edit", change the text, save. */
export function MessageEdit({ id, body }: { id: string; body: string }) {
  const [state, action, pending] = useActionState(editMessage, undefined)
  return (
    <details className="mt-0.5 inline-block align-top">
      <summary className="cursor-pointer select-none text-xs text-neutral-400 hover:text-amber-700">Edit</summary>
      <form action={action} className="mt-1 w-[min(28rem,80vw)] space-y-1">
        <input type="hidden" name="id" value={id} />
        <textarea name="body" required rows={3} defaultValue={body} className={inputClass} />
        <Feedback state={state} />
        <button disabled={pending} className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-[#0D1F35]">{pending ? 'Saving…' : 'Save'}</button>
      </form>
    </details>
  )
}
