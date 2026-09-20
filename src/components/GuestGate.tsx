'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { GUEST_PATHS } from './nav-items'

/**
 * External collaborators only see their tasks, shared projects and project chats. The database already
 * hides everything else; this just sends them back to their own home if they type another address.
 */
export function GuestGate({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const allowed = path === '/' || GUEST_PATHS.some((p) => p !== '/' && (path === p || path.startsWith(`${p}/`)))
  useEffect(() => { if (!allowed) router.replace('/') }, [allowed, router])
  return allowed ? <>{children}</> : null
}
