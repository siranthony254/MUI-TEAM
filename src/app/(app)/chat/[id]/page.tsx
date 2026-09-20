import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtChatTime } from '@/lib/time'
import { splitMentions } from '@/lib/mentions'
import type { Channel, Message } from '@/lib/types'
import { deleteMessage } from '../actions'
import { ChatLive } from './ChatLive'
import { Composer } from './Composer'

export const dynamic = 'force-dynamic'

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data: channel } = await supabase.from('channels').select('*').eq('id', id).maybeSingle()
  if (!channel) notFound()

  const [{ data: rows }, { data: members }, { data: departments }] = await Promise.all([
    supabase.from('messages').select('*').eq('channel_id', id).order('created_at', { ascending: false }).limit(150),
    supabase.from('team_members').select('id, full_name').eq('active', true),
    supabase.from('departments').select('name'),
  ])
  const messages = ((rows ?? []) as Message[]).reverse()
  const nameOf = (mid: string) => (members ?? []).find((m) => m.id === mid)?.full_name ?? 'Former member'

  const labels = [
    ...(members ?? []).map((m) => m.full_name),
    'Executive',
    ...(departments ?? []).map((d) => d.name),
  ]
  const ch = channel as Channel

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-8.5rem)] flex-col md:-my-6 md:h-[calc(100dvh-4.5rem)]">
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <Link href="/chat" className="text-sm text-neutral-500 hover:underline">←</Link>
        <div>
          <h1 className="font-semibold text-[#0D1F35]">#{ch.name}</h1>
          <p className="text-xs capitalize text-neutral-500">{ch.kind === 'general' ? 'Everyone' : `${ch.kind} channel`}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ChatLive channelId={id} count={messages.length}>
          {messages.length === 0 && <p className="py-8 text-center text-sm text-neutral-500">No messages yet. Say hello.</p>}
          <ul className="space-y-3">
            {messages.map((m) => {
              const mine = m.author_id === me.id
              const mentioned = m.mentions.includes(me.id)
              return (
                <li key={m.id} className={`rounded-lg px-3 py-2 ${mentioned ? 'bg-amber-50' : ''}`}>
                  <p className="text-xs">
                    <span className="font-semibold text-neutral-800">{nameOf(m.author_id)}</span>
                    <span className="ml-2 text-neutral-400">{fmtChatTime(m.created_at)}</span>
                  </p>
                  {m.deleted_at ? (
                    <p className="text-sm italic text-neutral-400">Message deleted</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {splitMentions(m.body, labels).map((seg, i) =>
                        seg.mention
                          ? <span key={i} className="rounded bg-amber-100 px-1 font-medium text-amber-900">{seg.text}</span>
                          : <span key={i}>{seg.text}</span>)}
                    </p>
                  )}
                  {(mine || me.role === 'super_admin') && !m.deleted_at && (
                    <form action={deleteMessage} className="mt-0.5">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="channel_id" value={id} />
                      <button className="text-xs text-neutral-400 hover:text-red-600">Delete</button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        </ChatLive>
      </div>

      <Composer channelId={id} labels={labels} />
    </div>
  )
}
