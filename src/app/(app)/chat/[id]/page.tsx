import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtChatTime } from '@/lib/time'
import { splitMentions } from '@/lib/mentions'
import { hrefOfRef, splitRefs, type RefItem } from '@/lib/refs'
import { Avatar } from '@/components/Avatar'
import { Paperclip } from 'lucide-react'
import type { Attachment, Channel, Message } from '@/lib/types'
import { deleteMessage } from '../actions'
import { deleteChannel, setChannelMuted } from '../../manage-actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import { MessageEdit } from '../../ManageForms'
import { BellOff, Bell } from 'lucide-react'
import { ChatLive } from './ChatLive'
import { Composer } from './Composer'

export const dynamic = 'force-dynamic'

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data: channel } = await supabase.from('channels').select('*').eq('id', id).maybeSingle()
  if (!channel) notFound()

  const [{ data: rows }, { data: members }, { data: departments }, { data: myRead }] = await Promise.all([
    supabase.from('messages').select('*').eq('channel_id', id).order('created_at', { ascending: false }).limit(150),
    supabase.from('team_members').select('id, full_name').eq('active', true),
    supabase.from('departments').select('name'),
    supabase.from('channel_reads').select('muted').eq('channel_id', id).eq('member_id', me.id).maybeSingle(),
  ])
  const muted = !!myRead?.muted
  const messages = ((rows ?? []) as (Message & { refs?: RefItem[] })[]).reverse()
  const messageIds = messages.map((m) => m.id)
  const { data: attRows } = messageIds.length
    ? await supabase.from('attachments').select('*').eq('entity_type', 'message').in('entity_id', messageIds)
    : { data: [] as Attachment[] }
  const attachmentsOf = (mid: string) => ((attRows ?? []) as Attachment[]).filter((a) => a.entity_id === mid)

  // A direct conversation is named after the person on the other side.
  let dmPartner: { id: string; full_name: string; avatar_url: string | null } | null = null
  if ((channel as Channel).kind === 'direct') {
    const { data: cm } = await supabase.from('channel_members').select('member_id').eq('channel_id', id)
    const otherId = (cm ?? []).map((r) => r.member_id).find((x) => x !== me.id)
    if (otherId) {
      const { data: p } = await supabase.from('team_members').select('id, full_name, avatar_url').eq('id', otherId).maybeSingle()
      dmPartner = p
    }
  }
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
          {dmPartner ? (
            <div className="flex items-center gap-2">
              <Avatar name={dmPartner.full_name} url={dmPartner.avatar_url} size={28} />
              <div>
                <h1 className="font-semibold text-[#0D1F35]">{dmPartner.full_name}</h1>
                <p className="text-xs text-neutral-500">Private conversation</p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-semibold text-[#0D1F35]">#{ch.name}</h1>
              <p className="text-xs capitalize text-neutral-500">{ch.kind === 'general' ? 'Everyone' : `${ch.kind} channel`}</p>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <form action={setChannelMuted}>
            <input type="hidden" name="channel_id" value={id} />
            <input type="hidden" name="muted" value={muted ? '0' : '1'} />
            <button className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-amber-700" title={muted ? 'Get push notifications for this chat again' : 'Stop push notifications from this chat'}>
              {muted ? <><BellOff size={14} aria-hidden /> Muted</> : <><Bell size={14} aria-hidden /> Mute</>}
            </button>
          </form>
          {ch.kind === 'group' && (ch.created_by === me.id || me.role === 'super_admin') && (
            <form action={deleteChannel}>
              <input type="hidden" name="id" value={id} />
              <ConfirmButton message={`Delete #${ch.name} and every message in it? This cannot be undone.`}>Delete group</ConfirmButton>
            </form>
          )}
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
                    {m.edited_at && !m.deleted_at && <span className="ml-1 text-neutral-400">(edited)</span>}
                  </p>
                  {m.deleted_at ? (
                    <p className="text-sm italic text-neutral-400">Message deleted</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {splitMentions(m.body, labels).flatMap((seg, i) =>
                        seg.mention
                          ? [<span key={`m${i}`} className="rounded bg-amber-100 px-1 font-medium text-amber-900">{seg.text}</span>]
                          : splitRefs(seg.text, m.refs ?? []).map((part, j) =>
                              part.ref
                                ? <Link key={`r${i}-${j}`} href={hrefOfRef(part.ref)} className="rounded bg-blue-50 px-1 font-medium text-blue-800 hover:underline">{part.text}</Link>
                                : <span key={`t${i}-${j}`}>{part.text}</span>))}
                    </p>
                  )}
                  {!m.deleted_at && attachmentsOf(m.id).length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {attachmentsOf(m.id).map((a) => (
                        <li key={a.id}>
                          <a href={`/attachments/${a.id}/download`} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs hover:border-amber-400">
                            <Paperclip size={12} aria-hidden /> {a.file_name ?? 'file'}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(mine || me.role === 'super_admin') && !m.deleted_at && (
                    <div className="mt-0.5 flex items-start gap-3">
                      {mine && <MessageEdit id={m.id} body={m.body} />}
                      <form action={deleteMessage}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="channel_id" value={id} />
                        <ConfirmButton message={mine ? 'Delete this message?' : `Delete ${nameOf(m.author_id)}'s message for everyone?`}>Delete</ConfirmButton>
                      </form>
                    </div>
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
