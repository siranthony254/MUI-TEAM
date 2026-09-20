'use client'

import { useEffect } from 'react'
import { startPwa } from './pwa-store'

/**
 * Mounted once in the root layout, so it runs on every page including the sign-in screen:
 * a first-time visitor gets the service worker and can be offered the install prompt straight away.
 */
export function PwaBoot() {
  useEffect(() => {
    startPwa()
    // Registered in production only; a service worker in `next dev` just makes stale-cache confusion.
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
    }
  }, [])
  return null
}
