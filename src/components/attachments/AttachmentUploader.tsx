'use client'

import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass, inputClass } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { addAttachmentLink, prepareAttachmentUpload, saveAttachment } from '@/app/(app)/attachments/actions'

type EntityType = 'task' | 'report' | 'decision'

/** Upload a file (direct to storage via a signed URL) or attach a link. */
export function AttachmentUploader({ type, entityId }: { type: EntityType; entityId: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linkState, linkAction, linkPending] = useActionState(addAttachmentLink, undefined)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setBusy(true)
    try {
      const prep = await prepareAttachmentUpload(type, entityId, file.name, file.size)
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? 'Could not start the upload.')
      const { error: upErr } = await createClient().storage
        .from('attachments').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined })
      if (upErr) throw new Error('The upload failed. Check your connection and try again.')
      const res = await saveAttachment({ type, entityId, path: prep.path, fileName: file.name, mime: file.type, size: file.size })
      if (res.error) throw new Error(res.error)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
      <label className="block text-sm font-medium">
        Attach a file (up to 25 MB)
        <input ref={fileRef} type="file" onChange={onFile} disabled={busy}
          className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1`} />
      </label>
      {busy && <p className="text-sm text-neutral-500">Uploading…</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <form action={linkAction} className="flex flex-wrap items-end gap-2" key={linkState?.ok ? 'done' : 'open'}>
        <input type="hidden" name="entity_type" value={type} />
        <input type="hidden" name="entity_id" value={entityId} />
        <label className="block flex-1 text-sm font-medium">Or a link
          <input name="url" required placeholder="https://" className={inputClass} />
        </label>
        <button disabled={linkPending} className={buttonClass}>Attach link</button>
      </form>
      {linkState?.error && <p role="alert" className="text-sm text-red-600">{linkState.error}</p>}
    </div>
  )
}
