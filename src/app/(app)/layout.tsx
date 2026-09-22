import Link from 'next/link'
import { Search } from 'lucide-react'
import { QuickAdd, type QuickItem } from '@/components/QuickAdd'
import { getCaps, getScopes } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { Avatar } from '@/components/Avatar'
import { getShell } from '@/lib/shell'
import { computeMutedKinds } from '@/lib/notify/muted'
import { LiveSync } from '@/components/LiveSync'
import { signOut } from '@/app/login/actions'
import { ROLE_LABEL } from '@/lib/types'
import { Nav } from '@/components/Nav'
import { GuestGate } from '@/components/GuestGate'
import { PageTransition } from '@/components/PageTransition'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember()
  // New members finish their profile first.
  // (Only an explicit null means "not set up": before migration 9 the column doesn't exist and everyone is treated as done.)
  if (me.profile_completed_at === null) redirect('/welcome')
  // One shared fetch for the whole request (the member, access, settings and badge counts).
  const shell = (await getShell())!
  const muted = new Set(computeMutedKinds(shell.prefs, shell.settings.mandatory_groups))
  const unreadCount = Object.entries(shell.unread).reduce((n, [kind, c]) => (muted.has(kind) ? n : n + Number(c)), 0)
  const chatUnread = shell.chatUnread

  const caps = await getCaps(me)
  const scopes = await getScopes(me)
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
    <div className="flex min-h-screen bg-[#F8F6F2] text-neutral-900 dark:bg-[#0B1420] dark:text-neutral-100">
      <Nav role={me.role} isDirector={me.is_director} showAnalytics={caps.view_analytics} showAdmin={scopes.size > 0} unread={unreadCount} chatUnread={chatUnread} orgName={shell.settings.org_name || 'MUI Team'} />
      <LiveSync memberId={me.id} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200/70 bg-white/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:sticky supports-[backdrop-filter]:top-0 supports-[backdrop-filter]:z-10 dark:border-white/10 dark:bg-[#0B1420]/85">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={me.full_name} url={me.avatar_url} size={36} />
            <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.full_name}</p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{me.title ?? ROLE_LABEL[me.role]}{me.is_director ? ' · Executive Director' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {me.role !== 'guest' && <Link href="/search" aria-label="Search" className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"><Search size={18} aria-hidden /></Link>}
            {quickItems.length > 0 && <QuickAdd items={quickItems} />}
            <Link href="/account" className="hidden rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10 sm:block">Account</Link>
            <form action={signOut}>
              <button className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:pb-8">
          <PageTransition>{me.role === 'guest' ? <GuestGate>{children}</GuestGate> : children}</PageTransition>
        </main>
      </div>
    </div>
  )
}
