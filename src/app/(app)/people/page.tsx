import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABEL, type TeamMember } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function People() {
  await requireMember()
  const supabase = await createClient()
  const [{ data }, { data: departments }] = await Promise.all([
    supabase.from('team_members').select('*').eq('active', true).order('full_name'),
    supabase.from('departments').select('id, name'),
  ])
  const members = (data ?? []) as TeamMember[]
  const deptName = (id: string | null) => (departments ?? []).find((d) => d.id === id)?.name

  return (
    <>
      <PageTitle sub="Who is who, and what each person owns.">People</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <Link key={m.id} href={`/people/${m.id}`}>
            <Card className="h-full transition hover:border-amber-400">
              <p className="font-semibold">{m.full_name}</p>
              <p className="text-sm text-neutral-600">{m.title ?? ROLE_LABEL[m.role]}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {[deptName(m.department_id), ROLE_LABEL[m.role]].filter(Boolean).join(' · ')}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
