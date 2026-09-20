import Link from 'next/link'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDay } from '@/lib/time'
import type { Decision } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'
import { NewDecisionForm } from './DecisionForm'
import { setDecisionStatus } from './actions'

export const dynamic = 'force-dynamic'

const FILTERS = [['active', 'Active'], ['all', 'All'], ['superseded', 'Superseded'], ['reversed', 'Reversed']] as const
const BADGE = {
  active: 'bg-green-100 text-green-800',
  superseded: 'bg-neutral-200 text-neutral-700',
  reversed: 'bg-red-100 text-red-800',
}

export default async function Decisions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'active' } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('decisions').select('*').order('decided_on', { ascending: false }).order('created_at', { ascending: false })
  const all = (data ?? []) as Decision[]
  const shown = status === 'all' ? all : all.filter((d) => d.status === status)
  const canEdit = isExecOrAbove(me)

  return (
    <>
      <PageTitle sub="What we decided and why, so anyone can answer “why did we do that?” later.">Decisions</PageTitle>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`/decisions?status=${key}`}
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
                  <p className="font-semibold">{d.title}</p>
                  <p className="text-xs text-neutral-500">
                    {fmtDay(d.decided_on)}{d.decided_by ? ` · ${d.decided_by}` : ''}
                    {d.meeting_id && <> · <Link href={`/meetings/${d.meeting_id}`} className="text-amber-700 hover:underline">from a meeting</Link></>}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[d.status]}`}>{d.status}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{d.decision}</p>
              {d.rationale && <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600"><strong>Why:</strong> {d.rationale}</p>}
              {d.superseded_by && (
                <p className="mt-2 text-sm text-neutral-600">Replaced by: {all.find((x) => x.id === d.superseded_by)?.title ?? 'a later decision'}</p>
              )}
              {canEdit && (
                <form action={setDecisionStatus} className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  <input type="hidden" name="id" value={d.id} />
                  {d.status === 'active' ? (
                    <>
                      <select name="superseded_by" defaultValue="" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
                        <option value="">Replaced by…</option>
                        {all.filter((x) => x.id !== d.id && x.status === 'active').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
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
        <Card className="mt-8">
          <h2 className="mb-3 font-semibold">Record a decision</h2>
          <NewDecisionForm />
        </Card>
      )}
    </>
  )
}
