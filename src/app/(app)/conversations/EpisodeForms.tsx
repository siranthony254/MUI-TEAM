'use client'

import { useActionState, useState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { EPISODE_STAGES, EPISODE_STAGE_LABEL, type Episode, type EpisodeTemplateItem } from '@/lib/types'
import { createEpisode, updateEpisode } from './actions'
import { useFormToast } from '@/components/Toaster'

interface Option { id: string; label: string }

const isoToLocal = (iso: string | null) => {
  if (!iso) return ''
  // Nairobi wall-clock time for <input type="datetime-local">
  const d = new Date(new Date(iso).getTime() + 3 * 3600000)
  return d.toISOString().slice(0, 16)
}

export function NewEpisodeForm({ projects, people, template }: { projects: Option[]; people: Option[]; template: EpisodeTemplateItem[] }) {
  const [state, action, pending] = useActionState(createEpisode, undefined)
  useFormToast(state)
  const [generate, setGenerate] = useState(true)
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">Working title
        <input name="title" required minLength={3} placeholder="e.g. What is university actually preparing us for?" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">The question this episode explores
        <textarea name="question" rows={2} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Guest
          <input name="guest_name" placeholder="Name, or leave empty until confirmed" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Project
          <select name="project_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Recording
          <input name="recording_at" type="datetime-local" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Planned publication
          <input name="publish_on" type="date" className={inputClass} />
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="generate" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="mt-0.5" />
        <span>Create the standard checklist as tasks<span className="block text-xs text-neutral-500">Each is due relative to the recording date. Assign owners below; anything left blank is yours.</span></span>
      </label>

      {generate && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="p-2">Task</th><th className="p-2">Due</th><th className="p-2">Owner</th></tr>
            </thead>
            <tbody>
              {template.map((it) => (
                <tr key={it.id} className="border-t border-neutral-100">
                  <td className="p-2">{it.title} <span className="text-xs text-neutral-400">· {EPISODE_STAGE_LABEL[it.stage]}</span></td>
                  <td className="p-2 text-xs text-neutral-500">{it.offset_days === 0 ? 'Recording day' : it.offset_days < 0 ? `${-it.offset_days}d before` : `${it.offset_days}d after`}</td>
                  <td className="p-2">
                    <select name={`assignee.${it.id}`} defaultValue="" aria-label={`Owner of ${it.title}`} className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs">
                      <option value="">Me</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Creating…' : 'Create episode'}</button>
    </form>
  )
}

export function EditEpisodeForm({ episode }: { episode: Episode }) {
  const [state, action, pending] = useActionState(updateEpisode, undefined)
  useFormToast(state)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={episode.id} />
      <label className="block text-sm font-medium">Title<input name="title" required defaultValue={episode.title} className={inputClass} /></label>
      <label className="block text-sm font-medium">Question<textarea name="question" rows={2} defaultValue={episode.question ?? ''} className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Status
          <select name="status" defaultValue={episode.status} className={inputClass}>
            <option value="planning">Planning</option>
            <option value="recording">Recording</option>
            <option value="post_production">Post-production</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Guest<input name="guest_name" defaultValue={episode.guest_name ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium">Recording<input name="recording_at" type="datetime-local" defaultValue={isoToLocal(episode.recording_at)} className={inputClass} /></label>
        <label className="block text-sm font-medium">Planned publication<input name="publish_on" type="date" defaultValue={episode.publish_on ?? ''} className={inputClass} /></label>
      </div>
      <label className="block text-sm font-medium">Guest notes<textarea name="guest_notes" rows={2} defaultValue={episode.guest_notes ?? ''} className={inputClass} /></label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save episode'}</button>
    </form>
  )
}

export const STAGE_OPTIONS = EPISODE_STAGES
