'use client'

import { useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui'
import { removePushSubscription, savePushSubscription } from './actions'

function urlBase64ToUint8Array(base64: string) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type State = 'loading' | 'unsupported' | 'blocked' | 'off' | 'on'

/** Subscribes/unsubscribes THIS device for web push. */
export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<State>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
    if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    navigator.serviceWorker.getRegistration('/').then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription()
      setState(sub ? 'on' : 'off')
    })
  }, [vapidKey])

  async function enable() {
    setBusy(true)
    setError('')
    try {
      const reg =
        (await navigator.serviceWorker.getRegistration('/')) ??
        (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
      await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)))
      if (res.error) throw new Error(res.error)
      setState('on')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn on notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return null
  return (
    <div className="space-y-2 text-sm">
      {state === 'unsupported' && (
        <p className="text-neutral-600">
          This browser can&apos;t receive push notifications.
          {isIOS && ' On iPhone, add MUI Team to your Home Screen first (Share → Add to Home Screen), then open it from there.'}
        </p>
      )}
      {state === 'blocked' && (
        <p className="text-neutral-600">Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.</p>
      )}
      {state === 'off' && <button onClick={enable} disabled={busy} className={buttonClass}>Turn on notifications for this device</button>}
      {state === 'on' && (
        <>
          <p className="text-green-700">Notifications are on for this device.</p>
          <button onClick={disable} disabled={busy} className="text-sm font-medium text-neutral-600 hover:underline">Turn off for this device</button>
        </>
      )}
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </div>
  )
}
