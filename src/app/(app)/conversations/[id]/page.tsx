import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime, fmtDay } from '@/lib/time'
import { fmtDue, isOverdue } from '@/lib/tasks'
import { EPISODE_STAGES, EPISODE_STAGE_LABEL, type Episode, type Task } from '@/lib/types'
import { Card, PageTitle, SectionTitle, StatusBadge } from '@/components/ui'
import { EditEpisodeForm } from '../EpisodeForms'
import { deleteEpisode } from '../../manage-actions'
import { ConfirmButton } from '@/components/ConfirmButton'

export const dynamic = 'force-dynamic'

type EpisodeTask = Task & { episode_stage: string | null }

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('episodes').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const ep = data as Episode

  const [{ data: taskRows }, { data: people }, { data: project }] = await Promise.all([
    supabase.from('tasks').select('*').eq('episode_id', id).order('due_at', { ascending: true, nullsFirst: false }),
    supabase.from('team_members').select('id, full_name'),
    ep.project_id ? supabase.from('projects').select('id, name').eq('id', ep.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const tasks = (taskRows ?? []) as EpisodeTask[]
  const nameOf = (mid: string | null) => (people ?? []).find((p) => p.id === mid)?.full_name ?? '—'
  const done = tasks.filter((t) => ['completed', 'closed'].includes(t.status)).length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : null

  const stageState = (stage: string) => {
    const t = tasks.filter((x) => x.episode_stage === stage)
    if (t.length === 0) return { label: '—', cls: 'bg-neutral-100 text-neutral-400' }
    const d = t.filter((x) => ['completed', 'closed'].includes(x.status)).length
    if (d === t.length) return { label: 'Done', cls: 'bg-green-100 text-green-800' }
    if (t.some((x) => x.status !== 'not_started')) return { label: 'In progress', cls: 'bg-blue-100 text-blue-800' }
    return { label: 'Pending', cls: 'bg-neutral-200 text-neutral-700' }
  }

  return (
    <>
      <Link href="/conversations" className="text-sm text-neutral-500 hover:underline">← Conversations</Link>
      <div className="mt-2" />
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Episode {String(ep.number).padStart(3, '0')}</p>
      <PageTitle sub={ep.question ?? undefined}>{ep.title}</PageTitle>

      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-neutral-500">Status</dt><dd className="font-medium capitalize">{ep.status.replace('_', '-')}</dd></div>
          <div><dt className="text-neutral-500">Guest</dt><dd className="font-medium">{ep.guest_name ?? 'Not confirmed'}</dd></div>
          <div><dt className="text-neutral-500">Recording</dt><dd className="font-medium">{ep.recording_at ? fmtDateTime(ep.recording_at) : '—'}</dd></div>
          <div><dt className="text-neutral-500">Publishes</dt><dd className="font-medium">{ep.publish_on ? fmtDay(ep.publish_on) : '—'}</dd></div>
        </dl>
        {project && <p className="mt-3 text-sm text-neutral-600">Project: <Link href={`/projects/${project.id}`} className="font-medium text-amber-700 hover:underline">{project.name}</Link></p>}
        {ep.guest_notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-800 dark:bg-white/5 dark:text-neutral-200"><strong>Guest notes:</strong> {ep.guest_notes}</p>}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {EPISODE_STAGES.map((s) => {
          const st = stageState(s)
          return (
            <div key={s} className={`rounded-lg px-3 py-2 text-center ${st.cls}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide">{EPISODE_STAGE_LABEL[s]}</p>
              <p className="text-xs">{st.label}</p>
            </div>
          )
        })}
      </div>

      {pct !== null && (
        <div className="mt-3">
          <div className="h-3 overflow-hidden rounded-full bg-neutral-100" aria-hidden><div className="h-full bg-amber-500" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-neutral-500">{done} of {tasks.length} tasks done ({pct}%)</p>
        </div>
      )}

      <div className="mt-6" />
      <SectionTitle>Tasks ({tasks.length})</SectionTitle>
      {tasks.length === 0 ? <Card><p className="text-sm text-neutral-600">No tasks you can see for this episode.</p></Card> : (
        <div className="space-y-4">
          {EPISODE_STAGES.map((stage) => {
            const list = tasks.filter((t) => t.episode_stage === stage)
            if (list.length === 0) return null
            return (
              <div key={stage}>
                <p className="mb-1 text-sm font-medium text-neutral-700">{EPISODE_STAGE_LABEL[stage]}</p>
                <div className="space-y-1">
                  {list.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`}>
                      <Card className="flex items-center justify-between gap-3 py-3 transition hover:border-amber-400">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{t.title.replace(/^Ep \d+: /, '')}</span>
                          <span className={`block text-xs ${isOverdue(t) ? 'text-red-600' : 'text-neutral-500'}`}>{nameOf(t.assignee_id)} · {fmtDue(t.due_at)}</span>
                        </span>
                        <StatusBadge status={t.status} />
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isExecOrAbove(me) && (
        <details className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-[#101C2C]">
          <summary className="cursor-pointer text-sm font-semibold">Edit episode details</summary>
          <div className="mt-4"><EditEpisodeForm episode={ep} /></div>
          {(ep.created_by === me.id || me.role === 'super_admin' || me.is_director) && (
            <form action={deleteEpisode} className="mt-4 border-t border-neutral-200 pt-3">
              <input type="hidden" name="id" value={ep.id} />
              <ConfirmButton message="Delete this episode? Its tasks stay, but lose the episode link." className="text-sm font-medium text-red-600 hover:underline">Delete episode</ConfirmButton>
            </form>
          )}
        </details>
      )}
    </>
  )
}
