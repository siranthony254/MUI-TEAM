import Link from 'next/link'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime, fmtDay } from '@/lib/time'
import type { Episode, EpisodeTemplateItem, Task } from '@/lib/types'
import { EPISODE_STAGE_LABEL, EPISODE_STAGES } from '@/lib/types'
import { Card, PageTitle, SectionTitle, buttonClass, inputClass } from '@/components/ui'
import { NewEpisodeForm } from './EpisodeForms'
import { addTemplateItem, removeTemplateItem } from './actions'

export const dynamic = 'force-dynamic'

const STATUS: Record<Episode['status'], { label: string; cls: string }> = {
  planning: { label: 'Planning', cls: 'bg-neutral-200 text-neutral-700' },
  recording: { label: 'Recording', cls: 'bg-red-100 text-red-800' },
  post_production: { label: 'Post-production', cls: 'bg-purple-100 text-purple-800' },
  published: { label: 'Published', cls: 'bg-green-100 text-green-800' },
  archived: { label: 'Archived', cls: 'bg-blue-100 text-blue-800' },
}
const FILTERS = [['active', 'In progress'], ['published', 'Published'], ['archived', 'Archive'], ['all', 'All']] as const

export default async function Conversations({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = 'active' } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()
  const exec = isExecOrAbove(me)

  const [{ data: eps }, { data: tasks }, { data: projects }, { data: people }, { data: template }] = await Promise.all([
    supabase.from('episodes').select('*').order('number', { ascending: false }),
    supabase.from('tasks').select('episode_id, status').not('episode_id', 'is', null),
    supabase.from('projects').select('id, name').neq('status', 'done').order('name'),
    supabase.from('team_members').select('id, full_name').eq('active', true).neq('role', 'guest').neq('id', me.id).order('full_name'),
    supabase.from('episode_template_items').select('*').order('position'),
  ])
  const episodes = ((eps ?? []) as Episode[]).filter((e) =>
    view === 'all' ? true : view === 'active' ? !['published', 'archived'].includes(e.status) : e.status === view)
  const progress = (id: string) => {
    const t = ((tasks ?? []) as Pick<Task, 'status'>[] & { episode_id: string }[]).filter((x) => (x as unknown as { episode_id: string }).episode_id === id)
    if (t.length === 0) return null
    return Math.round((t.filter((x) => ['completed', 'closed'].includes(x.status)).length / t.length) * 100)
  }
  const items = (template ?? []) as EpisodeTemplateItem[]

  return (
    <>
      <PageTitle sub="Every episode is a small project: a question, a guest, a recording date, and a checklist that runs itself.">Conversations</PageTitle>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/conversations?view=${k}`}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${view === k ? 'border-[#0D1F35] bg-[#0D1F35] text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>{l}</Link>
        ))}
      </div>

      {episodes.length === 0 ? <Card><p className="text-sm text-neutral-600">No episodes here yet.</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {episodes.map((e) => {
            const pct = progress(e.id)
            return (
              <Link key={e.id} href={`/conversations/${e.id}`}>
                <Card className="h-full transition hover:border-amber-400">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Episode {String(e.number).padStart(3, '0')}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[e.status].cls}`}>{STATUS[e.status].label}</span>
                  </div>
                  <p className="mt-1 font-semibold">{e.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {e.guest_name ? `Guest: ${e.guest_name}` : 'Guest not confirmed'}
                    {e.recording_at ? ` · records ${fmtDateTime(e.recording_at)}` : ''}
                    {e.publish_on ? ` · publishes ${fmtDay(e.publish_on)}` : ''}
                  </p>
                  {pct !== null && (
                    <>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden><div className="h-full bg-amber-500" style={{ width: `${pct}%` }} /></div>
                      <p className="mt-1 text-xs text-neutral-500">{pct}% of tasks done</p>
                    </>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {exec && (
        <>
          <Card id="new" className="mt-8">
            <h2 className="mb-3 font-semibold">New episode</h2>
            <NewEpisodeForm
              projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
              people={(people ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
              template={items.filter((i) => i.active)}
            />
          </Card>

          <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">Edit the standard checklist ({items.length} steps)</summary>
            <ul className="mt-3 divide-y divide-neutral-100 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{i.title} <span className="text-xs text-neutral-400">· {EPISODE_STAGE_LABEL[i.stage]} · {i.offset_days === 0 ? 'recording day' : i.offset_days < 0 ? `${-i.offset_days}d before` : `${i.offset_days}d after`}</span></span>
                  <form action={removeTemplateItem}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-neutral-400 hover:text-red-600">Remove</button></form>
                </li>
              ))}
            </ul>
            <SectionTitle>Add a step</SectionTitle>
            <form action={addTemplateItem} className="grid gap-2 sm:grid-cols-4">
              <input name="title" required placeholder="Step" className={`${inputClass} sm:col-span-2`} />
              <select name="stage" defaultValue="research" className={inputClass} aria-label="Stage">
                {EPISODE_STAGES.map((s) => <option key={s} value={s}>{EPISODE_STAGE_LABEL[s]}</option>)}
              </select>
              <input name="offset_days" type="number" defaultValue={0} className={inputClass} aria-label="Days from recording (negative = before)" />
              <div className="sm:col-span-4"><button className={buttonClass}>Add step</button></div>
            </form>
            <p className="mt-2 text-xs text-neutral-500">Days are relative to the recording date: −7 is a week before, 3 is three days after. Changes apply to future episodes only.</p>
          </details>
        </>
      )}
    </>
  )
}
