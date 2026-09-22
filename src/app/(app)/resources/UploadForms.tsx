'use client'

import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass, inputClass } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { RESOURCE_CATEGORIES } from '@/lib/types'
import { addLinkResource, prepareUpload, saveFileResource } from './actions'
import { useFormToast } from '@/components/Toaster'

const MAX_MB = 25

function CategoryAndVisibility() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">Category
        <select name="category" defaultValue="" required className={inputClass}>
          <option value="" disabled>Choose…</option>
          {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Visible to
        <select name="visibility" defaultValue="everyone" className={inputClass}>
          <option value="everyone">Whole team</option>
          <option value="executive">Executives only</option>
        </select>
      </label>
    </div>
  )
}

export function UploadFileForm({ projectId }: { projectId?: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setOk('')
    const form = new FormData(e.currentTarget)
    const file = form.get('file') as File | null
    if (!file || file.size === 0) return setError('Choose a file.')
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Files can be up to ${MAX_MB} MB. For larger files, add a link instead.`)

    setBusy(true)
    try {
      const prep = await prepareUpload(file.name, file.size)
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? 'Could not start the upload.')

      const { error: upErr } = await createClient().storage
        .from('resources')
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined })
      if (upErr) throw new Error('The upload failed. Check your connection and try again.')

      const res = await saveFileResource({
        path: prep.path, fileName: file.name, mime: file.type, size: file.size,
        title: String(form.get('title') ?? '') || file.name.replace(/\.[^.]+$/, ''),
        description: String(form.get('description') ?? ''),
        category: String(form.get('category') ?? ''),
        visibility: String(form.get('visibility') ?? 'everyone'),
        projectId,
      })
      if (res.error) throw new Error(res.error)
      setOk('Uploaded.')
      formRef.current?.reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium">File (up to {MAX_MB} MB)
        <input name="file" type="file" required className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1`} />
      </label>
      <label className="block text-sm font-medium">Title
        <input name="title" placeholder="Defaults to the file name" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Description
        <textarea name="description" rows={2} className={inputClass} />
      </label>
      <CategoryAndVisibility />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {ok && <p role="status" className="text-sm text-green-700">{ok}</p>}
      <button disabled={busy} className={buttonClass}>{busy ? 'Uploading…' : 'Upload file'}</button>
    </form>
  )
}

export function AddLinkForm({ projectId }: { projectId?: string }) {
  const [state, action, pending] = useActionState(addLinkResource, undefined)
  useFormToast(state)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      {projectId && <input type="hidden" name="project_id" value={projectId} />}
      <label className="block text-sm font-medium">Link (Google Drive, Notion, a website…)
        <input name="url" required placeholder="https://" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Title
        <input name="title" required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Description
        <textarea name="description" rows={2} className={inputClass} />
      </label>
      <CategoryAndVisibility />
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Adding…' : 'Add link'}</button>
    </form>
  )
}
