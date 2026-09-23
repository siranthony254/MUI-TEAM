'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { buttonClass } from '@/components/ui'
import { enablePush, getPushState, type PushState } from '@/lib/push'

const DISMISS_KEY = 'mui-push-banner-dismissed'

/**
 * The dashboard's own nudge to turn notifications on — this is what actually makes tasks, mentions
 * and updates show up on the lock screen / notification tray while the app is closed, the way
 * WhatsApp does. Web push only ever turns on when a person explicitly agrees on their own device;
 * nothing server-side can switch it on for them, so this has to be the thing that asks.
 */
export function PushBanner() {
  const [state, setState] = useState<PushState>('loading')
  const [dismissed, setDismissed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1') } catch { setDismissed(false) }
    getPushState(vapidKey).then(setState).catch(() => setState('unsupported'))
  }, [vapidKey])

  if (state !== 'off' || dismissed) return null

  async function enable() {
    setBusy(true)
    setError('')
    const res = await enablePush(vapidKey)
    setState(res.state)
    if (res.error) setError(res.error)
    setBusy(false)
  }

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <Bell size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Turn on notifications</p>
        <p className="mt-0.5 text-amber-900/80 dark:text-amber-200/70">
          So a new task, mention or update reaches you the moment it happens — even with the app closed — the same way a WhatsApp message does.
        </p>
        {error && <p role="alert" className="mt-1 text-red-700 dark:text-red-400">{error}</p>}
        <div className="mt-2 flex items-center gap-3">
          <button onClick={enable} disabled={busy} className={buttonClass}>{busy ? 'Turning on…' : 'Turn on notifications'}</button>
          <button onClick={dismiss} className="text-xs font-medium text-amber-900/70 hover:underline dark:text-amber-200/60">Not now</button>
        </div>
      </div>
    </div>
  )
}
