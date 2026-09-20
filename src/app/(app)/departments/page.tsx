import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, PageTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface Stat { department_id: string; member_count: number; open_count: number; overdue_count: number; done_30d: number }

export default async function Departments() {
  await requireMember()
  const supabase = await createClient()
  const [{ data: departments }, { data: stats }, { data: people }] = await Promise.all([
    supabase.from('departments').select('id, name, description, director_id').order('name'),
    supabase.rpc('department_stats_all'),
    supabase.from('team_members').select('id, full_name'),
  ])
  const statOf = (id: string) => ((stats ?? []) as Stat[]).find((s) => s.department_id === id)
  const nameOf = (id: string | null) => (people ?? []).find((p) => p.id === id)?.full_name

  return (
    <>
      <PageTitle sub="How MUI is organised, and how each department is doing.">Departments</PageTitle>
      {(departments ?? []).length === 0 ? (
        <Card><p className="text-sm text-neutral-600">No departments yet. A system admin can create them under System admin → Departments.</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(departments ?? []).map((d) => {
            const s = statOf(d.id)
            return (
              <Link key={d.id} href={`/departments/${d.id}`}>
                <Card className="h-full transition hover:border-amber-400">
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-xs text-neutral-500">{nameOf(d.director_id) ? `Director: ${nameOf(d.director_id)}` : 'No director assigned'}</p>
                  {d.description && <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{d.description}</p>}
                  <p className="mt-3 text-xs text-neutral-500">
                    {s?.member_count ?? 0} member{(s?.member_count ?? 0) === 1 ? '' : 's'} · {s?.open_count ?? 0} open
                    {(s?.overdue_count ?? 0) > 0 && <span className="text-red-600"> · {s!.overdue_count} overdue</span>}
                  </p>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
