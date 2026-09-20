import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDue } from '@/lib/tasks'
import type { AppNotification } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

async function markAllRead() {
  'use server'
  const me = await requireMember()
  const supabase = await createClient()
  await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me.id).is('read_at', null)
  revalidatePath('/', 'layout')
}

export default async function Notifications() {
  const me = await requireMember()
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', me.id)
    .order('created_at', { ascending: false })
    .limit(100)
  const items = (data ?? []) as AppNotification[]
  const unread = items.filter((n) => !n.read_at).length

  return (
    <>
      <PageTitle>Notifications</PageTitle>
      {unread > 0 && (
        <form action={markAllRead} className="mb-4">
          <button className="text-sm font-medium text-amber-700 hover:underline">Mark all as read</button>
        </form>
      )}
      {items.length === 0 ? (
        <Card><p className="text-sm text-neutral-600">You&apos;re all caught up.</p></Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const body = (
              <Card className={n.read_at ? '' : 'border-amber-300 bg-amber-50'}>
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-sm text-neutral-600">{n.body}</p>}
                <p className="mt-1 text-xs text-neutral-400">{fmtDue(n.created_at)}</p>
              </Card>
            )
            return n.link ? <Link key={n.id} href={n.link}>{body}</Link> : <div key={n.id}>{body}</div>
          })}
        </div>
      )}
    </>
  )
}
