'use client'

import { useEffect } from 'react'

/**
 * Keeps the home-screen app icon's badge count in step with what's unread — the same idea as
 * WhatsApp's icon badge. Only does anything when the app is installed and the browser supports
 * the Badging API (Chrome/Edge on Android and desktop; Safari on iOS does not, as of this build).
 */
export function BadgeSync({ count }: { count: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (!nav.setAppBadge || !nav.clearAppBadge) return
    (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge())?.catch(() => {})
  }, [count])
  return null
}
