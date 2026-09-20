'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import type { FormState } from './actions'

interface Option { id: string; label: string }

/** Shared by "new task" and "delegate" (delegate passes parentId + a fixed title prefill). */
export function TaskForm({
  action, members, projects, canAssign, parentId, defaultTitle = '', submitLabel,
}: {
  action: (prev: FormState | undefined, fd: FormData) => Promise<FormState>
  members: Option[]
  projects: Option[]
  canAssign: boolean
  parentId?: string
  defaultTitle?: string
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, undefined)
  return (
    <form action={formAction} className="space-y-4">
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <label className="block text-sm font-medium">Task title
        <input name="title" required minLength={3} defaultValue={defaultTitle} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Description
        <textarea name="description" rows={4} className={inputClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {canAssign && (
          <label className="block text-sm font-medium">Assign to
            <select name="assignee_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>Choose a person</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">Project
          <select name="project_id" defaultValue="" className={inputClass}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Priority
          <select name="priority" defaultValue="normal" className={inputClass}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Due
          <input name="due_at" type="datetime-local" className={inputClass} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requires_evidence" /> Require a completion note when submitted
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : submitLabel}</button>
    </form>
  )
}
