import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'
import { ROLE_LABEL } from '@/lib/types'
import { Nav } from '@/components/Nav'
import { PwaRegister } from '@/components/PwaRegister'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember()
  const supabase = await createClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me.id)
    .is('read_at', null)

  const { data: chatCounts } = await supabase.rpc('chat_unread_counts')
  const chatUnread = (chatCounts ?? []).reduce((n: number, c: { unread: number }) => n + Number(c.unread), 0)

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <Nav role={me.role} isDirector={me.is_director} unread={count ?? 0} chatUnread={chatUnread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.full_name}</p>
            <p className="truncate text-xs text-neutral-500">{me.title ?? ROLE_LABEL[me.role]}{me.is_director ? ' · Executive Director' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/tasks/new"
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">
              <Plus size={16} aria-hidden /> New task
            </Link>
            <Link href="/account" className="hidden rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 sm:block">Account</Link>
            <form action={signOut}>
              <button className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Sign out</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:pb-8">{children}</main>
      </div>
      <PwaRegister />
    </div>
  )
}
