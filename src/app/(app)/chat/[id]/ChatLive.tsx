'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { markRead } from '../actions'

/**
 * Wraps the server-rendered message list: keeps it fresh (realtime push, with a
 * slow poll as a safety net), scrolls to the newest message, and marks the
 * channel read.
 */
export function ChatLive({
  channelId, count, children,
}: { channelId: string; count: number; children: React.ReactNode }) {
  const router = useRouter()
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
    markRead(channelId).catch(() => {})
  }, [channelId, count])

  useEffect(() => {
    const supabase = createClient()
    const sub = supabase
      .channel(`chat:${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        () => router.refresh(),
      )
      .subscribe()

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 20000)

    return () => {
      clearInterval(poll)
      supabase.removeChannel(sub)
    }
  }, [channelId, router])

  return (
    <div>
      {children}
      <div ref={bottom} />
    </div>
  )
}
