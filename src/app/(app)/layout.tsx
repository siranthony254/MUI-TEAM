import Link from 'next/link'
import { Search } from 'lucide-react'
import { QuickAdd, type QuickItem } from '@/components/QuickAdd'
import { getCaps } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { Avatar } from '@/components/Avatar'
import { createClient } from '@/lib/supabase/server'
import { mutedKinds } from '@/lib/notify/muted'
import { signOut } from '@/app/login/actions'
import { ROLE_LABEL } from '@/lib/types'
import { Nav } from '@/components/Nav'
import { GuestGate } from '@/components/GuestGate'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember()
  // New members finish their profile first.
  // (Only an explicit null means "not set up": before migration 9 the column doesn't exist and everyone is treated as done.)
  if (me.profile_completed_at === null) redirect('/welcome')
  const supabase = await createClient()
  const { data: orgRow } = await supabase.from('org_settings').select('value').eq('key', 'org_name').maybeSingle()
  const muted = await mutedKinds(supabase, me.id)
  let unreadQuery = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me.id)
    .is('read_at', null)
  if (muted.length) unreadQuery = unreadQuery.not('kind', 'in', `(${muted.join(',')})`)
  const { count } = await unreadQuery

  const { data: chatCounts } = await supabase.rpc('chat_unread_counts')
  const chatUnread = (chatCounts ?? []).reduce((n: number, c: { unread: number }) => n + Number(c.unread), 0)

  const caps = await getCaps(me)
  const quickItems: QuickItem[] = me.role === 'guest' ? [] : [
    { href: '/tasks/new', label: 'Task', hint: caps.assign_tasks ? 'Assign work to someone' : 'Add a task for yourself' },
    { href: '/chat', label: 'Message', hint: 'Chat with the team' },
    { href: '/reports', label: 'Report', hint: 'Write or submit a report' },
    ...(caps.create_project ? [{ href: '/projects#new', label: 'Project', hint: 'Start a new project' }] : []),
    ...(caps.schedule_meeting ? [{ href: '/meetings/new', label: 'Meeting', hint: 'Schedule and invite' }] : []),
    ...(caps.add_event ? [{ href: '/calendar#new', label: 'Event', hint: 'Recording, publication, deadline' }] : []),
    ...(caps.record_decision ? [{ href: '/decisions#new', label: 'Decision', hint: 'Record a decision' }] : []),
    ...(caps.add_resource ? [{ href: '/resources#upload', label: 'Upload', hint: 'Add a file or link' }] : []),
    ...(me.is_director ? [{ href: '/announcements#new', label: 'Announcement', hint: 'Official, from the Executive Director' }] : []),
    ...(caps.send_campaign ? [{ href: '/admin/campaigns', label: 'Campaign', hint: 'Message part of the team' }] : []),
  ]

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <Nav role={me.role} isDirector={me.is_director} showAnalytics={caps.view_analytics} unread={count ?? 0} chatUnread={chatUnread} orgName={orgRow?.value || 'MUI Team'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={me.full_name} url={me.avatar_url} size={36} />
            <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.full_name}</p>
            <p className="truncate text-xs text-neutral-500">{me.title ?? ROLE_LABEL[me.role]}{me.is_director ? ' · Executive Director' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {me.role !== 'guest' && <Link href="/search" aria-label="Search" className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"><Search size={18} aria-hidden /></Link>}
            {quickItems.length > 0 && <QuickAdd items={quickItems} />}
            <Link href="/account" className="hidden rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 sm:block">Account</Link>
            <form action={signOut}>
              <button className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Sign out</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:pb-8">
          {me.role === 'guest' ? <GuestGate>{children}</GuestGate> : children}
        </main>
      </div>
    </div>
  )
}
