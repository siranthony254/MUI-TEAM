'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Keeps the open screen in step with the database.
 *  - a new notification for you, or any change to a task you can see, refreshes the page (throttled)
 *  - coming back to the app after being away, or regaining the network, refreshes it too
 * Refreshing re-runs the server rendering, so what you see is always what everyone else sees.
 */
export function LiveSync({ memberId }: { memberId: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    const refresh = () => {
      if (timer.current) return                     // already scheduled: collapse bursts into one refresh
      timer.current = setTimeout(() => { timer.current = null; router.refresh() }, 1500)
    }

    const supabase = createClient()
    const channel = supabase
      .channel(`sync:${memberId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${memberId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refresh)
      .subscribe()

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return }
      if (hiddenAt.current && Date.now() - hiddenAt.current > 45_000) router.refresh()
      hiddenAt.current = null
    }
    const onOnline = () => router.refresh()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [memberId, router])

  return null
}
