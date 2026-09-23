'use client'

export type PushState = 'loading' | 'unsupported' | 'blocked' | 'off' | 'on'

function urlBase64ToUint8Array(base64: string) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** The current state of push notifications on this device, without prompting for anything. */
export async function getPushState(vapidKey: string): Promise<PushState> {
  if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Asks for permission and subscribes this device. Must be called from a user gesture (a click). */
export async function enablePush(vapidKey: string): Promise<{ state: PushState; error?: string }> {
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration('/')) ??
      (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
    await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { state: permission === 'denied' ? 'blocked' : 'off' }

    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) })
    const { savePushSubscription } = await import('@/app/(app)/account/actions')
    const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)))
    if (res.error) return { state: 'off', error: res.error }
    return { state: 'on' }
  } catch (e) {
    return { state: 'off', error: e instanceof Error ? e.message : 'Could not turn on notifications.' }
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const { removePushSubscription } = await import('@/app/(app)/account/actions')
  await removePushSubscription(sub.endpoint)
  await sub.unsubscribe()
}
