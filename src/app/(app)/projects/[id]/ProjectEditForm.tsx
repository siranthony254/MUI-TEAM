'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import type { Project } from '@/lib/types'
import { updateProject } from '../actions'

interface Option { id: string; label: string }

export function ProjectEditForm({
  project, departments, people,
}: { project: Project; departments: Option[]; people: Option[] }) {
  const [state, action, pending] = useActionState(updateProject, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={project.id} />
      <label className="block text-sm font-medium">Name<input name="name" required defaultValue={project.name} className={inputClass} /></label>
      <label className="block text-sm font-medium">Description
        <textarea name="description" rows={3} defaultValue={project.description ?? ''} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Status
          <select name="status" defaultValue={project.status} className={inputClass}>
            <option value="active">Active</option>
            <option value="at_risk">At risk</option>
            <option value="paused">Paused</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Project director
          <select name="owner_id" defaultValue={project.owner_id ?? ''} className={inputClass}>
            <option value="">None</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Department
          <select name="department_id" defaultValue={project.department_id ?? ''} className={inputClass}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Start<input name="start_date" type="date" defaultValue={project.start_date ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium">Due<input name="due_date" type="date" defaultValue={project.due_date ?? ''} className={inputClass} /></label>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save project'}</button>
    </form>
  )
}
