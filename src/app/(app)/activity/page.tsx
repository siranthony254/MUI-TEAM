import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime } from '@/lib/time'
import type { ActivityEntry } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

const TYPES = [
  ['', 'Everything'], ['task', 'Tasks'], ['project', 'Projects'], ['meeting', 'Meetings'],
  ['decision', 'Decisions'], ['report', 'Reports'], ['resource', 'Files'], ['member', 'People'],
] as const

const PAGE = 100

function hrefFor(a: ActivityEntry): string | null {
  if (!a.entity_id) return null
  switch (a.entity_type) {
    case 'task': return `/tasks/${a.entity_id}`
    case 'project': return `/projects/${a.entity_id}`
    case 'meeting': return `/meetings/${a.entity_id}`
    case 'report': return `/reports/${a.entity_id}`
    case 'decision': return '/decisions'
    case 'resource': return '/resources'
    case 'member': return `/people/${a.entity_id}`
    default: return null
  }
}

export default async function Activity({
  searchParams,
}: { searchParams: Promise<{ type?: string; person?: string; project?: string; page?: string }> }) {
  const sp = await searchParams
  const me = await requireMember()
  const supabase = await createClient()
  const page = Math.max(1, Number(sp.page) || 1)

  let query = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE)
  if (sp.type) query = query.eq('entity_type', sp.type)
  if (sp.person) query = query.eq('actor_id', sp.person)
  if (sp.project) query = query.eq('project_id', sp.project)

  const [{ data }, { data: members }, { data: projects }] = await Promise.all([
    query,
    supabase.from('team_members').select('id, full_name').order('full_name'),
    supabase.from('projects').select('id, name').order('name'),
  ])
  const rows = (data ?? []) as ActivityEntry[]
  const hasMore = rows.length > PAGE
  const shown = rows.slice(0, PAGE)
  const nameOf = (id: string | null) => (members ?? []).find((m) => m.id === id)?.full_name ?? 'System'

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { type: sp.type, person: sp.person, project: sp.project, ...over }
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v))
    return `/activity?${p}`
  }
  const sel = 'rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm'

  return (
    <>
      <PageTitle sub={me.role === 'super_admin' ? 'Everything that happens across MUI, as it happens.' : 'Activity on work you’re part of.'}>
        Activity
      </PageTitle>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <select name="type" defaultValue={sp.type ?? ''} className={sel} aria-label="Type">
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="person" defaultValue={sp.person ?? ''} className={sel} aria-label="Person">
          <option value="">Everyone</option>
          {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select name="project" defaultValue={sp.project ?? ''} className={sel} aria-label="Project">
          <option value="">All projects</option>
          {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50">Filter</button>
      </form>

      {shown.length === 0 ? <Card><p className="text-sm text-neutral-600">No activity matches.</p></Card> : (
        <Card className="p-0">
          <ul className="divide-y divide-neutral-100">
            {shown.map((a) => {
              const href = hrefFor(a)
              const body = (
                <div className="px-4 py-3">
                  <p className="text-sm">{a.summary}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {nameOf(a.actor_id)} · {fmtDateTime(a.created_at)}
                    {a.field && a.from_value !== null && a.to_value !== null && a.field !== 'due_at' && (
                      <> · {a.field}: {a.from_value.replace(/_/g, ' ')} → {a.to_value.replace(/_/g, ' ')}</>
                    )}
                  </p>
                </div>
              )
              return <li key={a.id}>{href ? <Link href={href} className="block hover:bg-neutral-50">{body}</Link> : body}</li>
            })}
          </ul>
        </Card>
      )}

      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="text-amber-700 hover:underline">← Newer</Link> : <span />}
        {hasMore && <Link href={qs({ page: String(page + 1) })} className="text-amber-700 hover:underline">Older →</Link>}
      </div>
    </>
  )
}
