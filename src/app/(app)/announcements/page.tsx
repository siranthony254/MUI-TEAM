import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime } from '@/lib/time'
import type { Announcement } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'
import { AnnouncementForm } from './AnnouncementForm'
import { deleteAnnouncement } from './actions'

export const dynamic = 'force-dynamic'

const PRIORITY = {
  normal: '',
  important: 'bg-amber-100 text-amber-900',
  urgent: 'bg-red-100 text-red-800',
} as const

export default async function Announcements() {
  const me = await requireMember()
  const supabase = await createClient()
  const [{ data }, { data: departments }, { data: members }] = await Promise.all([
    supabase.from('announcements').select('*').order('publish_at', { ascending: false }).limit(60),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name, title'),
  ])
  const list = (data ?? []) as Announcement[]
  const nameOf = (id: string | null) => (members ?? []).find((m) => m.id === id)
  const deptName = (id: string | null) => (departments ?? []).find((d) => d.id === id)?.name
  const now = Date.now()

  return (
    <>
      <PageTitle sub="Official communication from the Executive Director.">Announcements</PageTitle>

      {list.length === 0 ? <Card><p className="text-sm text-neutral-600">No announcements yet.</p></Card> : (
        <div className="space-y-3">
          {list.map((a) => {
            const scheduled = new Date(a.publish_at).getTime() > now
            const author = nameOf(a.created_by)
            return (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Official announcement{a.audience === 'executives' ? ' · Executives' : a.audience === 'department' ? ` · ${deptName(a.department_id) ?? 'Department'}` : ''}
                    </p>
                    <h2 className="mt-0.5 text-lg font-semibold text-[#0D1F35]">{a.title}</h2>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {a.priority !== 'normal' && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY[a.priority]}`}>{a.priority}</span>}
                    {scheduled && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">Scheduled</span>}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{a.body}</p>
                <p className="mt-3 text-xs text-neutral-500">
                  {author ? `${author.full_name}${author.title ? `, ${author.title}` : ''} · ` : ''}{fmtDateTime(a.publish_at)}
                </p>
                {me.is_director && (
                  <form action={deleteAnnouncement} className="mt-2">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="text-xs text-neutral-400 hover:text-red-600">Delete</button>
                  </form>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {me.is_director && (
        <Card className="mt-8">
          <h2 className="mb-3 font-semibold">New official announcement</h2>
          <AnnouncementForm departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))} />
        </Card>
      )}
    </>
  )
}
