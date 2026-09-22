import Link from 'next/link'
import { Bell, CheckCircle2 } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime } from '@/lib/time'
import { CATEGORIES, groupOfKind, kindsOfCategory } from '@/lib/notify/groups'
import { myMutedKinds } from '@/lib/notify/muted'
import type { AppNotification } from '@/lib/types'
import { Card, PageTitle, EmptyState} from '@/components/ui'

export const dynamic = 'force-dynamic'

async function markAllRead() {
  'use server'
  const me = await requireMember()
  const supabase = await createClient()
  await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me.id).is('read_at', null)
  revalidatePath('/', 'layout')
}

async function markRead(fd: FormData) {
  'use server'
  const me = await requireMember()
  const supabase = await createClient()
  await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me.id).eq('id', String(fd.get('id') ?? ''))
  revalidatePath('/', 'layout')
}

export default async function Notifications({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  const muted = await myMutedKinds()
  let query = supabase.from('notifications').select('*').eq('recipient_id', me.id).order('created_at', { ascending: false }).limit(150)
  if (muted.length) query = query.not('kind', 'in', `(${muted.join(',')})`)
  const { data } = await query
  const all = (data ?? []) as AppNotification[]

  // Counts per category (unread) for the tab badges.
  const unreadIn = (cat: string) => {
    const kinds = kindsOfCategory(cat)
    return all.filter((n) => !n.read_at && kinds.includes(n.kind)).length
  }
  const active = CATEGORIES.some((c) => c.id === category) ? category! : ''
  const items = active ? all.filter((n) => kindsOfCategory(active).includes(n.kind)) : all
  const unread = all.filter((n) => !n.read_at).length

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-sm ${on ? 'border-[#0D1F35] bg-[#0D1F35] text-white' : 'border-neutral-300 bg-white text-neutral-700'}`

  return (
    <>
      <PageTitle sub="Tune what reaches you, and how, under Account → Notifications.">Notifications</PageTitle>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href="/notifications" className={chip(!active)}>All{unread > 0 ? ` (${unread})` : ''}</Link>
        {CATEGORIES.map((c) => (
          <Link key={c.id} href={`/notifications?category=${c.id}`} className={chip(active === c.id)}>
            {c.label}{unreadIn(c.id) > 0 ? ` (${unreadIn(c.id)})` : ''}
          </Link>
        ))}
      </div>

      {unread > 0 && (
        <form action={markAllRead} className="mb-4">
          <button className="text-sm font-medium text-amber-700 hover:underline">Mark all as read</button>
        </form>
      )}

      {items.length === 0 ? (
        <Card><EmptyState icon={active ? Bell : CheckCircle2} label={active ? 'Nothing in this category.' : 'You’re all caught up.'} /></Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const cat = CATEGORIES.find((c) => c.id === groupOfKind(n.kind).category)?.label
            const body = (
              <Card className={n.read_at ? '' : 'border-amber-300 bg-amber-50'}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{cat}</p>
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-sm text-neutral-600">{n.body}</p>}
                <p className="mt-1 text-xs text-neutral-400">{fmtDateTime(n.created_at)}</p>
              </Card>
            )
            return (
              <div key={n.id} className="relative">
                {n.link ? <Link href={n.link}>{body}</Link> : body}
                {!n.read_at && (
                  <form action={markRead} className="absolute right-3 top-3">
                    <input type="hidden" name="id" value={n.id} />
                    <button className="text-xs text-neutral-500 hover:underline">Mark read</button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
