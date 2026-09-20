import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { fmtDay } from '@/lib/time'
import type { Decision } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'
import { AttachmentsPanel } from '@/components/attachments/AttachmentsPanel'
import { NewDecisionForm } from './DecisionForm'
import { setDecisionStatus } from './actions'

export const dynamic = 'force-dynamic'

const FILTERS = [['active', 'Active'], ['all', 'All'], ['superseded', 'Superseded'], ['reversed', 'Reversed']] as const
const BADGE = {
  active: 'bg-green-100 text-green-800',
  superseded: 'bg-neutral-200 text-neutral-700',
  reversed: 'bg-red-100 text-red-800',
}
const num = (n: number) => `#${String(n).padStart(3, '0')}`

export default async function Decisions({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = 'active', q } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  const [{ data }, { data: members }, { data: projects }] = await Promise.all([
    supabase.from('decisions').select('*').order('number', { ascending: false }),
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name'),
    supabase.from('projects').select('id, name').order('name'),
  ])
  const all = (data ?? []) as Decision[]
  const needle = q?.trim().toLowerCase()
  const shown = all
    .filter((d) => status === 'all' || d.status === status)
    .filter((d) => !needle || [d.title, d.decision, d.rationale, num(d.number)].some((v) => v?.toLowerCase().includes(needle)))
  const canEdit = await can(me, 'record_decision')
  const nameOf = (id: string | null) => (members ?? []).find((m) => m.id === id)?.full_name
  const projectOf = (id: string | null) => (projects ?? []).find((p) => p.id === id)

  return (
    <>
      <PageTitle sub="What we decided and why, so anyone can answer “why did we do that?” later.">Decisions</PageTitle>

      <form className="mb-3 flex gap-2">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q} placeholder="Search decisions…" aria-label="Search decisions"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        <button className="rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50">Search</button>
      </form>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`/decisions?status=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${
              status === key ? 'border-[#0D1F35] bg-[#0D1F35] text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>
            {label}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? <Card><p className="text-sm text-neutral-600">Nothing here yet.</p></Card> : (
        <div className="space-y-3">
          {shown.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold"><span className="text-neutral-400">Decision {num(d.number)}</span> · {d.title}</p>
                  <p className="text-xs text-neutral-500">
                    {fmtDay(d.decided_on)}{d.decided_by ? ` · ${d.decided_by}` : ''}
                    {d.meeting_id && <> · <Link href={`/meetings/${d.meeting_id}`} className="text-amber-700 hover:underline">from a meeting</Link></>}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[d.status]}`}>{d.status}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{d.decision}</p>
              {d.rationale && <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600"><strong>Background:</strong> {d.rationale}</p>}
              {(d.implementation_owner_id || d.project_id) && (
                <p className="mt-2 text-sm text-neutral-600">
                  {d.implementation_owner_id && <>Implementation: <strong>{nameOf(d.implementation_owner_id)}</strong></>}
                  {d.implementation_owner_id && d.project_id && ' · '}
                  {d.project_id && projectOf(d.project_id) && <>Project: <Link href={`/projects/${d.project_id}`} className="font-medium text-amber-700 hover:underline">{projectOf(d.project_id)!.name}</Link></>}
                </p>
              )}
              {d.superseded_by && (
                <p className="mt-2 text-sm text-neutral-600">Replaced by: {(() => { const r = all.find((x) => x.id === d.superseded_by); return r ? `${num(r.number)} ${r.title}` : 'a later decision' })()}</p>
              )}
              <details className="mt-3 border-t border-neutral-100 pt-3">
                <summary className="cursor-pointer text-sm font-medium text-neutral-700">Supporting documents</summary>
                <div className="mt-2">
                  <AttachmentsPanel type="decision" entityId={d.id} canAdd={canEdit} viewerId={me.id} isSuperAdmin={me.role === 'super_admin'} />
                </div>
              </details>
              {canEdit && (
                <form action={setDecisionStatus} className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  <input type="hidden" name="id" value={d.id} />
                  {d.status === 'active' ? (
                    <>
                      <select name="superseded_by" defaultValue="" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
                        <option value="">Replaced by…</option>
                        {all.filter((x) => x.id !== d.id && x.status === 'active').map((x) => <option key={x.id} value={x.id}>{num(x.number)} {x.title}</option>)}
                      </select>
                      <button name="status" value="superseded" className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">Mark superseded</button>
                      <button name="status" value="reversed" className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">Mark reversed</button>
                    </>
                  ) : (
                    <button name="status" value="active" className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">Reinstate</button>
                  )}
                </form>
              )}
            </Card>
          ))}
        </div>
      )}

      {canEdit && (
        <Card id="new" className="mt-8">
          <h2 className="mb-3 font-semibold">Record a decision</h2>
          <NewDecisionForm
            people={(members ?? []).map((m) => ({ id: m.id, label: m.full_name }))}
            projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
          />
        </Card>
      )}
    </>
  )
}
