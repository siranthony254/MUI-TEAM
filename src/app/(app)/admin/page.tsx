import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABEL, type TeamMember } from '@/lib/types'
import { Card, PageTitle, buttonClass, inputClass } from '@/components/ui'
import { AddMemberForm } from './AddMemberForm'
import { addDepartment } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminHome() {
  await requireRole('super_admin')
  const supabase = await createClient()
  const [{ data: members }, { data: departments }] = await Promise.all([
    supabase.from('team_members').select('*').order('full_name'),
    supabase.from('departments').select('id, name').order('name'),
  ])

  return (
    <>
      <PageTitle sub="Only Super Admins can see this area.">Administration</PageTitle>

      <Card>
        <h2 className="mb-3 font-semibold">Team ({(members ?? []).length})</h2>
        <ul className="divide-y divide-neutral-100">
          {((members ?? []) as TeamMember[]).map((m) => (
            <li key={m.id}>
              <Link href={`/admin/people/${m.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-neutral-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.full_name}{!m.active && ' (inactive)'}</span>
                  <span className="block truncate text-xs text-neutral-500">{m.title ?? '—'} · {m.email}</span>
                </span>
                <span className="text-xs font-medium text-neutral-600">{ROLE_LABEL[m.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">Add a team member</h2>
        <AddMemberForm />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">Departments</h2>
        <p className="mb-3 text-sm text-neutral-600">{(departments ?? []).map((d) => d.name).join(' · ') || 'None yet.'}</p>
        <form action={addDepartment} className="flex gap-2">
          <input name="name" placeholder="e.g. Conversations" required className={inputClass} />
          <button className={`${buttonClass} mt-1`}>Add</button>
        </form>
      </Card>
    </>
  )
}
