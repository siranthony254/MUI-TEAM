'use client'

import { useActionState, useEffect, useRef } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { addComment, requestExtension } from '../collab-actions'

export function CommentForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(addComment, undefined)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state?.ok) ref.current?.reset() }, [state])
  return (
    <form ref={ref} action={action} className="mt-3 space-y-2">
      <input type="hidden" name="task_id" value={taskId} />
      <textarea name="body" rows={2} required maxLength={2000} placeholder="Add a comment…" className={inputClass} />
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Posting…' : 'Comment'}</button>
    </form>
  )
}

export function ExtensionForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(requestExtension, undefined)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="task_id" value={taskId} />
      <label className="block text-sm font-medium">Why do you need more time?
        <textarea name="reason" rows={3} required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">New deadline you&rsquo;re asking for
        <input name="requested_due" type="datetime-local" required className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Sending…' : 'Request extension'}</button>
    </form>
  )
}
