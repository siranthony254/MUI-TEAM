'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass, inputClass } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { prepareAttachmentUpload, saveAttachment } from '../attachments/actions'
import { createTask } from './actions'

interface Option { id: string; label: string }

export function ChannelPicker() {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Notify by</legend>
      <input type="hidden" name="channels_present" value="1" />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-2 text-neutral-500"><input type="checkbox" checked disabled /> In-app (always)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="channels" value="email" defaultChecked /> Email</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="channels" value="push" defaultChecked /> Push</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="channels" value="sms" defaultChecked /> SMS</label>
      </div>
      <p className="mt-1 text-xs text-neutral-500">Each person also has their own opt-ins; SMS only reaches people who turned it on.</p>
    </fieldset>
  )
}

export function TaskForm({
  members, projects, departments, canAssign,
}: { members: Option[]; projects: Option[]; departments: Option[]; canAssign: boolean }) {
  const router = useRouter()
  const filesRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recurrence, setRecurrence] = useState('none')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const fd = new FormData(e.currentTarget)
      const files = Array.from(filesRef.current?.files ?? [])
      fd.delete('files')

      const res = await createTask(undefined, fd)
      if (res.error || !res.id) throw new Error(res.error ?? 'Could not create the task.')

      const failed: string[] = []
      for (const file of files) {
        try {
          const prep = await prepareAttachmentUpload('task', res.id, file.name, file.size)
          if (prep.error || !prep.path || !prep.token) throw new Error(prep.error)
          const { error: upErr } = await createClient().storage
            .from('attachments').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined })
          if (upErr) throw upErr
          const saved = await saveAttachment({ type: 'task', entityId: res.id, path: prep.path, fileName: file.name, mime: file.type, size: file.size })
          if (saved.error) throw new Error(saved.error)
        } catch {
          failed.push(file.name)
        }
      }
      // The task exists either way; a failed upload is reported on its page rather than losing the task.
      router.push(`/tasks/${res.id}${failed.length ? `?upload_failed=${encodeURIComponent(failed.join(', '))}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-medium">Task title
        <input name="title" required minLength={3} className={inputClass} />
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
        <label className="block text-sm font-medium">Department
          <select name="department_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
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
        <label className="block text-sm font-medium">Start date
          <input name="start_date" type="date" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Due (date and time)
          <input name="due_at" type="datetime-local" className={inputClass} />
        </label>
        {canAssign && (
          <label className="block text-sm font-medium">Weight in its project (1–100)
            <input name="weight" type="number" min={1} max={100} defaultValue={1} className={inputClass} />
          </label>
        )}
        <label className="block text-sm font-medium">Tags (comma separated)
          <input name="tags" placeholder="research, episode-4" className={inputClass} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Repeats
          <select name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={inputClass}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        {recurrence !== 'none' && (
          <label className="block text-sm font-medium">Stop repeating after (optional)
            <input name="recurrence_until" type="date" className={inputClass} />
          </label>
        )}
      </div>
      {recurrence !== 'none' && (
        <p className="text-xs text-neutral-500">The next occurrence is created when this one is completed, with its deadline moved forward.</p>
      )}

      <div className="space-y-2">
        {canAssign && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="require_approval" defaultChecked /> Require approval when submitted (uncheck if no sign-off is needed)
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requires_evidence" /> Require a completion note when submitted
        </label>
      </div>

      {canAssign && <ChannelPicker />}

      <label className="block text-sm font-medium">Attachments
        <input ref={filesRef} name="files" type="file" multiple
          className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1`} />
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className={buttonClass}>{busy ? 'Creating…' : 'Create task'}</button>
    </form>
  )
}
