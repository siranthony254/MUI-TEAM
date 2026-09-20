'use client'

import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass, inputClass } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { prepareUpload } from '../actions'
import { replaceResourceFile, replaceResourceLink, shareResource } from '../viewer-actions'

export function CopyLink() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
      }}
      className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-neutral-50">
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  )
}

export function ShareForm({ resourceId, people }: { resourceId: string; people: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(shareResource, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={resourceId} />
      <fieldset className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">Send to</legend>
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="people" value={p.id} /> {p.label}</label>
        ))}
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Sharing…' : 'Share'}</button>
    </form>
  )
}

export function ReplaceFileForm({ resourceId }: { resourceId: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return setError('Choose the new file.')
    setError(''); setOk(''); setBusy(true)
    try {
      const prep = await prepareUpload(file.name, file.size)
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? 'Could not start the upload.')
      const { error: upErr } = await createClient().storage.from('resources').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined })
      if (upErr) throw new Error('The upload failed. Check your connection and try again.')
      const res = await replaceResourceFile({ id: resourceId, path: prep.path, fileName: file.name, mime: file.type, size: file.size })
      if (res.error) throw new Error(res.error)
      setOk(res.ok ?? 'Replaced.')
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium">New version (up to 25 MB)
        <input ref={fileRef} type="file" required className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1`} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {ok && <p role="status" className="text-sm text-green-700">{ok}</p>}
      <button disabled={busy} className={buttonClass}>{busy ? 'Uploading…' : 'Replace file'}</button>
    </form>
  )
}

export function ReplaceLinkForm({ resourceId, current }: { resourceId: string; current: string }) {
  const [state, action, pending] = useActionState(replaceResourceLink, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={resourceId} />
      <label className="block text-sm font-medium">New address
        <input name="url" required defaultValue={current} className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Update link'}</button>
    </form>
  )
}
