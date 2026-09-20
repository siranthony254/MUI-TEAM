import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABEL, type TeamMember } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function People({
  searchParams,
}: { searchParams: Promise<{ q?: string; department?: string; role?: string; status?: string; group?: string }> }) {
  const sp = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  const [{ data }, { data: departments }] = await Promise.all([
    supabase.from('team_members').select('*').order('full_name'),
    supabase.from('departments').select('id, name').order('name'),
  ])
  const deptName = (id: string | null) => (departments ?? []).find((d) => d.id === id)?.name

  // Inactive people are only listed when asked for, and only super admins are told they exist.
  const status = sp.status === 'inactive' && me.role === 'super_admin' ? 'inactive' : sp.status === 'all' && me.role === 'super_admin' ? 'all' : 'active'
  const q = sp.q?.trim().toLowerCase()

  const members = ((data ?? []) as TeamMember[]).filter((m) =>
    (status === 'all' || (status === 'active') === m.active) &&
    (!sp.department || m.department_id === sp.department) &&
    (!sp.role || m.role === sp.role) &&
    (sp.group !== 'executive' || m.role !== 'member') &&
    (sp.group !== 'team' || m.role === 'member') &&
    (!q || [m.full_name, m.title, m.email, deptName(m.department_id)].some((v) => v?.toLowerCase().includes(q))),
  )

  const sel = 'rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm'

  return (
    <>
      <PageTitle sub="Who is who, and what each person owns.">People</PageTitle>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search name, title, department…" aria-label="Search people"
          className="min-w-[200px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        <select name="department" defaultValue={sp.department ?? ''} className={sel} aria-label="Department">
          <option value="">All departments</option>
          {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="role" defaultValue={sp.role ?? ''} className={sel} aria-label="Access level">
          <option value="">All levels</option>
          <option value="super_admin">Super Admin</option>
          <option value="executive">Executive</option>
          <option value="member">Team Member</option>
        </select>
        <select name="group" defaultValue={sp.group ?? ''} className={sel} aria-label="Group">
          <option value="">Executive + team</option>
          <option value="executive">Executives only</option>
          <option value="team">Team members only</option>
        </select>
        {me.role === 'super_admin' && (
          <select name="status" defaultValue={status} className={sel} aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        )}
        <button className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50">Filter</button>
      </form>

      <p className="mb-3 text-xs text-neutral-500">{members.length} {members.length === 1 ? 'person' : 'people'}</p>

      {members.length === 0 ? <Card><p className="text-sm text-neutral-600">No one matches.</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <Link key={m.id} href={`/people/${m.id}`}>
              <Card className={`h-full transition hover:border-amber-400 ${m.active ? '' : 'opacity-60'}`}>
                <p className="font-semibold">{m.full_name}{!m.active && ' (inactive)'}</p>
                <p className="text-sm text-neutral-600">{m.title ?? ROLE_LABEL[m.role]}</p>
                <p className="mt-1 text-xs text-neutral-500">{[deptName(m.department_id), ROLE_LABEL[m.role]].filter(Boolean).join(' · ')}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
