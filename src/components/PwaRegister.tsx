'use client'

import { useEffect } from 'react'

/** Registers the service worker once the signed-in shell has mounted. */
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
    }
  }, [])
  return null
}
