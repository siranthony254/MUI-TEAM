'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { postMessage } from '../actions'

/** Textarea with @mention suggestions. Enter sends, Shift+Enter adds a line. */
export function Composer({ channelId, labels }: { channelId: string; labels: string[] }) {
  const [state, action, pending] = useActionState(postMessage, undefined)
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (state?.sent) setText('')
  }, [state?.sent])

  // The word being typed after an "@" just before the caret.
  const query = /(?:^|\s)@([^@\n]{0,30})$/.exec(text.slice(0, caret))?.[1]
  const suggestions = query === undefined ? [] :
    labels.filter((l) => l.toLowerCase().startsWith(query.toLowerCase()) && l.toLowerCase() !== query.toLowerCase()).slice(0, 5)

  function pick(label: string) {
    const before = text.slice(0, caret).replace(/@[^@\n]{0,30}$/, `@${label} `)
    const next = before + text.slice(caret)
    setText(next)
    setCaret(before.length)
    requestAnimationFrame(() => {
      areaRef.current?.focus()
      areaRef.current?.setSelectionRange(before.length, before.length)
    })
  }

  return (
    <form ref={formRef} action={action} className="relative border-t border-neutral-200 bg-white p-3">
      <input type="hidden" name="channel_id" value={channelId} />
      {suggestions.length > 0 && (
        <ul role="listbox" className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pick(s) }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50">
                @{s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={areaRef}
          name="body"
          rows={1}
          value={text}
          maxLength={4000}
          placeholder="Message… use @ to mention someone"
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart) }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (text.trim()) formRef.current?.requestSubmit()
            }
          }}
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button disabled={pending || !text.trim()}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400 disabled:opacity-50">
          Send
        </button>
      </div>
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
