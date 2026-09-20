import Link from 'next/link'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Channel } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { NewGroupForm } from './NewGroupForm'

export const dynamic = 'force-dynamic'

const SECTIONS: [Channel['kind'][], string][] = [
  [['general', 'executive'], 'Everyone & leadership'],
  [['department'], 'Departments'],
  [['project'], 'Projects'],
  [['group'], 'Groups'],
]

export default async function Chat() {
  const me = await requireMember()
  const supabase = await createClient()

  const [{ data: channels }, { data: unread }, { data: people }] = await Promise.all([
    supabase.from('channels').select('*').order('name'),
    supabase.rpc('chat_unread_counts'),
    supabase.from('team_members').select('id, full_name').eq('active', true).neq('id', me.id).order('full_name'),
  ])
  const counts = new Map<string, number>(
    ((unread ?? []) as { channel_id: string; unread: number }[]).map((u) => [u.channel_id, Number(u.unread)]),
  )
  const all = (channels ?? []) as Channel[]

  return (
    <>
      <PageTitle sub="Fast team conversation. Use @Name, @Executive or @Department to get someone's attention.">Chat</PageTitle>

      {SECTIONS.map(([kinds, label]) => {
        const list = all.filter((c) => kinds.includes(c.kind))
        if (list.length === 0) return null
        return (
          <div key={label} className="mb-6">
            <SectionTitle>{label}</SectionTitle>
            <div className="space-y-2">
              {list.map((c) => {
                const n = counts.get(c.id) ?? 0
                return (
                  <Link key={c.id} href={`/chat/${c.id}`}>
                    <Card className="flex items-center justify-between transition hover:border-amber-400">
                      <span className={n ? 'font-semibold' : ''}>#{c.name}</span>
                      {n > 0 && (
                        <span className="rounded-full bg-amber-500 px-2 text-xs font-semibold text-[#0D1F35]">{n > 99 ? '99+' : n}</span>
                      )}
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}

      {isExecOrAbove(me) && (
        <details className="rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Start a group chat</summary>
          <div className="mt-4">
            <NewGroupForm people={(people ?? []).map((p) => ({ id: p.id, label: p.full_name }))} />
          </div>
        </details>
      )}
    </>
  )
}
