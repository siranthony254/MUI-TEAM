'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { prepareAttachmentUpload, saveAttachment } from '@/app/(app)/attachments/actions'
import { postMessage, searchRefs, type Ref } from '../actions'

/**
 * Message box. Enter sends, Shift+Enter adds a line.
 *   @name / @Executive / @Department  -> notifies people
 *   #something                        -> links a task or project
 *   paperclip                         -> attach files
 */
export function Composer({ channelId, labels }: { channelId: string; labels: string[] }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [refs, setRefs] = useState<Ref[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [refHits, setRefHits] = useState<Ref[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const before = text.slice(0, caret)
  const mentionQuery = /(?:^|\s)@([^@\n]{0,30})$/.exec(before)?.[1]
  const refQuery = /(?:^|\s)#([^#\n]{0,40})$/.exec(before)?.[1]

  const mentionHits = mentionQuery === undefined ? [] :
    labels.filter((l) => l.toLowerCase().startsWith(mentionQuery.toLowerCase()) && l.toLowerCase() !== mentionQuery.toLowerCase()).slice(0, 5)

  useEffect(() => {
    if (refQuery === undefined || refQuery.length < 1) { setRefHits([]); return }
    let live = true
    const t = setTimeout(async () => { const r = await searchRefs(refQuery); if (live) setRefHits(r) }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [refQuery])

  function insertAtCaret(pattern: RegExp, replacement: string) {
    const head = text.slice(0, caret).replace(pattern, replacement)
    setText(head + text.slice(caret))
    setCaret(head.length)
    requestAnimationFrame(() => { areaRef.current?.focus(); areaRef.current?.setSelectionRange(head.length, head.length) })
  }
  const pickMention = (label: string) => insertAtCaret(/@[^@\n]{0,30}$/, `@${label} `)
  function pickRef(r: Ref) {
    insertAtCaret(/#[^#\n]{0,40}$/, `#${r.label} `)
    setRefs((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]))
    setRefHits([])
  }

  async function send() {
    if (busy || (!text.trim() && files.length === 0)) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.set('channel_id', channelId)
      fd.set('body', text.trim() || (files.length ? `Shared ${files.length === 1 ? 'a file' : `${files.length} files`}` : ''))
      fd.set('refs', JSON.stringify(refs))
      const res = await postMessage(undefined, fd)
      if (res?.error || !res?.messageId) throw new Error(res?.error ?? 'Could not send.')

      const failed: string[] = []
      for (const file of files) {
        try {
          const prep = await prepareAttachmentUpload('message', res.messageId, file.name, file.size)
          if (prep.error || !prep.path || !prep.token) throw new Error(prep.error)
          const { error: upErr } = await createClient().storage.from('attachments').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined })
          if (upErr) throw upErr
          const saved = await saveAttachment({ type: 'message', entityId: res.messageId, path: prep.path, fileName: file.name, mime: file.type, size: file.size })
          if (saved.error) throw new Error(saved.error)
        } catch { failed.push(file.name) }
      }
      if (failed.length) setError(`Sent, but these files didn't upload: ${failed.join(', ')}`)
      setText(''); setRefs([]); setFiles([]); setRefHits([])
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    } finally {
      setBusy(false)
    }
  }

  type Suggestion = { key: string; text: string; sub?: string; onPick: () => void }
  const suggestions: Suggestion[] = mentionHits.length > 0
    ? mentionHits.map((l) => ({ key: `m-${l}`, text: `@${l}`, onPick: () => pickMention(l) }))
    : refHits.map((r) => ({ key: `r-${r.id}`, text: `#${r.label}`, sub: r.type, onPick: () => pickRef(r) }))

  return (
    <div className="relative border-t border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-[#101C2C]">
      {suggestions.length > 0 && (
        <ul role="listbox" className="absolute bottom-full left-3 mb-1 w-72 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#101C2C]">
          {suggestions.map((s) => (
            <li key={s.key}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); s.onPick() }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-amber-50">
                <span className="truncate">{s.text}</span>
                {s.sub && <span className="shrink-0 rounded bg-neutral-100 px-1.5 text-[10px] uppercase text-neutral-500">{s.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs">
              {f.name}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-600">×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach files"
          className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"><Paperclip size={18} aria-hidden /></button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          maxLength={4000}
          placeholder="Message… @ to mention, # to link a task or project"
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart) }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
          }}
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button onClick={() => void send()} disabled={busy || (!text.trim() && files.length === 0)}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400 disabled:opacity-50">
          {busy ? '…' : 'Send'}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
