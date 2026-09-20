import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import type { Channel } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { NewGroupForm } from './NewGroupForm'
import { Avatar } from '@/components/Avatar'
import { startDm } from './actions'

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

  // Direct messages: show the other person, newest conversations first.
  const dmChannels = all.filter((c) => c.kind === 'direct')
  const { data: dmMembers } = dmChannels.length
    ? await supabase.from('channel_members').select('channel_id, member_id').in('channel_id', dmChannels.map((c) => c.id))
    : { data: [] as { channel_id: string; member_id: string }[] }
  const partnerIds = [...new Set((dmMembers ?? []).map((r) => r.member_id).filter((x) => x !== me.id))]
  const { data: partners } = partnerIds.length
    ? await supabase.from('team_members').select('id, full_name, avatar_url').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string; avatar_url: string | null }[] }
  const partnerOf = (cid: string) => {
    const pid = (dmMembers ?? []).find((r) => r.channel_id === cid && r.member_id !== me.id)?.member_id
    return (partners ?? []).find((p) => p.id === pid)
  }

  return (
    <>
      <PageTitle sub="Fast team conversation. Use @Name, @Executive or @Department to get someone's attention.">Chat</PageTitle>

      <div className="mb-6">
        <SectionTitle>Direct messages</SectionTitle>
        <div className="space-y-2">
          {dmChannels.map((c) => {
            const p = partnerOf(c.id)
            const n = counts.get(c.id) ?? 0
            return (
              <Link key={c.id} href={`/chat/${c.id}`}>
                <Card className="flex items-center justify-between gap-3 transition hover:border-amber-400">
                  <span className="flex items-center gap-3">
                    <Avatar name={p?.full_name ?? '?'} url={p?.avatar_url} size={32} />
                    <span className={n ? 'font-semibold' : ''}>{p?.full_name ?? 'Colleague'}</span>
                  </span>
                  {n > 0 && <span className="rounded-full bg-amber-500 px-2 text-xs font-semibold text-[#0D1F35]">{n > 99 ? '99+' : n}</span>}
                </Card>
              </Link>
            )
          })}
          <form action={startDm} className="flex gap-2">
            <select name="member_id" required defaultValue="" aria-label="Start a private message"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
              <option value="" disabled>Message someone…</option>
              {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <button className="rounded-lg bg-amber-500 px-4 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">Open</button>
          </form>
        </div>
      </div>

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

      {(await can(me, 'create_group_chat')) && (
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
