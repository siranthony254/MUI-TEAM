'use client'

import { useActionState, useEffect, useState } from 'react'
import { CalendarClock, CheckSquare, Scale } from 'lucide-react'
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/ui'
import { useFormToast } from '@/components/Toaster'
import { createEvent } from '@/app/(app)/calendar/actions'
import { createTask } from '@/app/(app)/tasks/actions'
import { createDecision } from '@/app/(app)/decisions/actions'
import { listActiveMembers } from '@/app/(app)/assistant-actions'
import type { Proposal } from '@/lib/assistant/proposals'

const KINDS = ['event', 'recording', 'publication', 'deadline', 'other']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const label = 'block text-sm font-medium'

/**
 * What Ask MUI proposed, as a normal editable form — nothing is created until the person reviews
 * it and presses the button themselves. Submits through the exact same server actions (and so the
 * exact same permission rules) as creating one by hand from Calendar, Tasks, or Decisions.
 */
export function ProposalCard({ proposal, onDone }: { proposal: Proposal; onDone: () => void }) {
  if (proposal.type === 'event') return <EventProposal p={proposal} onDone={onDone} />
  if (proposal.type === 'task') return <TaskProposal p={proposal} onDone={onDone} />
  return <DecisionProposal p={proposal} onDone={onDone} />
}

function Shell({ icon: Icon, title, children, state, onDone }: {
  icon: typeof CalendarClock; title: string; children: React.ReactNode
  state?: { error?: string; ok?: string; id?: string }; onDone: () => void
}) {
  useEffect(() => { if (state?.ok || state?.id) onDone() }, [state]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-1 w-[min(320px,80vw)] rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        <Icon size={13} aria-hidden /> {title} — review and confirm
      </p>
      {children}
      {state?.error && <p role="alert" className="mt-2 text-xs text-red-600">{state.error}</p>}
    </div>
  )
}

function EventProposal({ p, onDone }: { p: Extract<Proposal, { type: 'event' }>; onDone: () => void }) {
  const [state, action, pending] = useActionState(createEvent, undefined)
  useFormToast(state)
  return (
    <form action={action}>
      <Shell icon={CalendarClock} title="New calendar event" state={state} onDone={onDone}>
        <div className="space-y-2">
          <label className={label}>Title<input name="title" required defaultValue={p.title} className={inputClass} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Type
              <select name="kind" defaultValue={KINDS.includes(p.kind) ? p.kind : 'event'} className={inputClass}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className={label}>Starts<input name="starts_at" type="datetime-local" required defaultValue={p.starts_at} className={inputClass} /></label>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="all_day" defaultChecked={p.all_day} /> All day</label>
          <div className="flex gap-2 pt-1">
            <button disabled={pending} className={`${buttonClass} flex-1 !py-1.5 text-xs`}>{pending ? 'Creating…' : 'Create event'}</button>
            <button type="button" onClick={onDone} className={`${secondaryButtonClass} !py-1.5 text-xs`}>Discard</button>
          </div>
        </div>
      </Shell>
    </form>
  )
}

function TaskProposal({ p, onDone }: { p: Extract<Proposal, { type: 'task' }>; onDone: () => void }) {
  const [state, action, pending] = useActionState(createTask, undefined)
  useFormToast(state)
  const [people, setPeople] = useState<{ id: string; label: string }[]>([])
  const [assignee, setAssignee] = useState('')

  useEffect(() => {
    listActiveMembers().then((list) => {
      setPeople(list)
      const guess = p.assignee_name ? list.find((m) => m.label.toLowerCase().includes(p.assignee_name!.toLowerCase())) : null
      setAssignee(guess?.id ?? '')
    })
  }, [p.assignee_name])

  return (
    <form action={action}>
      <Shell icon={CheckSquare} title="New task" state={state} onDone={onDone}>
        <div className="space-y-2">
          <label className={label}>Title<input name="title" required defaultValue={p.title} className={inputClass} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Priority
              <select name="priority" defaultValue={PRIORITIES.includes(p.priority ?? '') ? p.priority : 'normal'} className={inputClass}>
                {PRIORITIES.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className={label}>Due<input name="due_at" type="datetime-local" defaultValue={p.due_at ?? ''} className={inputClass} /></label>
          </div>
          <label className={label}>Assign to
            <select name="assignee_id" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass}>
              <option value="">Myself</option>
              {people.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <div className="flex gap-2 pt-1">
            <button disabled={pending} className={`${buttonClass} flex-1 !py-1.5 text-xs`}>{pending ? 'Creating…' : 'Create task'}</button>
            <button type="button" onClick={onDone} className={`${secondaryButtonClass} !py-1.5 text-xs`}>Discard</button>
          </div>
        </div>
      </Shell>
    </form>
  )
}

function DecisionProposal({ p, onDone }: { p: Extract<Proposal, { type: 'decision' }>; onDone: () => void }) {
  const [state, action, pending] = useActionState(createDecision, undefined)
  useFormToast(state)
  return (
    <form action={action}>
      <Shell icon={Scale} title="Record a decision" state={state} onDone={onDone}>
        <div className="space-y-2">
          <label className={label}>Title<input name="title" required defaultValue={p.title} className={inputClass} /></label>
          <label className={label}>Decision<textarea name="decision" required rows={2} defaultValue={p.decision} className={inputClass} /></label>
          {p.rationale && <label className={label}>Why<textarea name="rationale" rows={2} defaultValue={p.rationale} className={inputClass} /></label>}
          <div className="flex gap-2 pt-1">
            <button disabled={pending} className={`${buttonClass} flex-1 !py-1.5 text-xs`}>{pending ? 'Recording…' : 'Record decision'}</button>
            <button type="button" onClick={onDone} className={`${secondaryButtonClass} !py-1.5 text-xs`}>Discard</button>
          </div>
        </div>
      </Shell>
    </form>
  )
}
