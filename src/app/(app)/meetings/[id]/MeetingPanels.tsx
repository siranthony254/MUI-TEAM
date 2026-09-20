'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { addActionItem, recordDecision, saveMeetingOutcome } from '../actions'

interface Option { id: string; label: string }

function Feedback({ state }: { state?: { error?: string; ok?: string } }) {
  return (
    <>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
    </>
  )
}

export function OutcomeForm({
  id, status, minutes, attendees,
}: {
  id: string
  status: string
  minutes: string
  attendees: { id: string; label: string; attended: boolean | null }[]
}) {
  const [state, action, pending] = useActionState(saveMeetingOutcome, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm font-medium">Status
        <select name="status" defaultValue={status} className={inputClass}>
          <option value="scheduled">Scheduled</option>
          <option value="held">Held</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Minutes
        <textarea name="minutes" rows={8} defaultValue={minutes} placeholder="What was discussed and agreed" className={inputClass} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Who attended (recorded when status is Held)</legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {attendees.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="present" value={a.id} defaultChecked={a.attended === true} /> {a.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save minutes'}</button>
    </form>
  )
}

export function DecisionForm({ meetingId }: { meetingId: string }) {
  const [state, action, pending] = useActionState(recordDecision, undefined)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <label className="block text-sm font-medium">Title
        <input name="title" required className={inputClass} placeholder="e.g. Conversations is the primary semester initiative" />
      </label>
      <label className="block text-sm font-medium">The decision
        <textarea name="decision" rows={3} required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Why (so it makes sense in six months)
        <textarea name="rationale" rows={2} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Decided by
        <input name="decided_by" defaultValue="Executive Team" className={inputClass} />
      </label>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Record decision'}</button>
    </form>
  )
}

export function ActionItemForm({ meetingId, people }: { meetingId: string; people: Option[] }) {
  const [state, action, pending] = useActionState(addActionItem, undefined)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <label className="block text-sm font-medium">Action
        <input name="title" required minLength={3} placeholder="e.g. Confirm venue" className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Responsible
          <select name="assignee_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Choose a person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Due
          <input name="due_at" type="datetime-local" className={inputClass} />
        </label>
      </div>
      <Feedback state={state} />
      <button disabled={pending} className={buttonClass}>{pending ? 'Assigning…' : 'Create task'}</button>
    </form>
  )
}
