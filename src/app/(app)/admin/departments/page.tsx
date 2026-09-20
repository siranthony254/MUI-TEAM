import Link from 'next/link'
import { requireScope } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, PageTitle, SectionTitle, buttonClass, inputClass } from '@/components/ui'
import { ServiceKeyNotice } from '@/components/ServiceKeyNotice'
import { saveDepartment } from './actions'

export const dynamic = 'force-dynamic'

export default async function DepartmentsAdmin() {
  await requireScope('admin.departments')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return <ServiceKeyNotice />
  const admin = createAdminClient()
  const [depts, people] = await Promise.all([
    admin.from('departments').select('id, name, description, director_id').order('name'),
    admin.from('team_members').select('id, full_name, department_id, role').eq('active', true).neq('role', 'guest').order('full_name'),
  ])
  if (depts.error) return <ServiceKeyNotice detail={depts.error.message} />

  return (
    <>
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">← System admin</Link>
      <div className="mt-2" />
      <PageTitle sub="Create departments and choose who directs each. A director sees their department's work and assigns within it.">Departments</PageTitle>

      <div className="space-y-3">
        {(depts.data ?? []).map((d) => {
          const members = (people.data ?? []).filter((p) => p.department_id === d.id)
          return (
            <Card key={d.id}>
              <form action={saveDepartment} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={d.id} />
                <label className="block text-sm font-medium">Name<input name="name" required defaultValue={d.name} className={inputClass} /></label>
                <label className="block text-sm font-medium">Director
                  <select name="director_id" defaultValue={d.director_id ?? ''} className={inputClass}>
                    <option value="">No director yet</option>
                    {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.department_id === d.id ? '' : ' (other department)'}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium sm:col-span-2">Description
                  <textarea name="description" rows={2} defaultValue={d.description ?? ''} className={inputClass} />
                </label>
                <div className="flex items-center justify-between sm:col-span-2">
                  <span className="text-xs text-neutral-500">{members.length} member{members.length === 1 ? '' : 's'}</span>
                  <button className={buttonClass}>Save</button>
                </div>
              </form>
            </Card>
          )
        })}
      </div>

      <div className="mt-8" />
      <SectionTitle>Add a department</SectionTitle>
      <Card>
        <form action={saveDepartment} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Name<input name="name" required placeholder="e.g. Research & Insights" className={inputClass} /></label>
          <label className="block text-sm font-medium">Director (optional)
            <select name="director_id" defaultValue="" className={inputClass}>
              <option value="">No director yet</option>
              {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium sm:col-span-2">Description<textarea name="description" rows={2} className={inputClass} /></label>
          <div className="sm:col-span-2"><button className={buttonClass}>Create department</button></div>
        </form>
        <p className="mt-3 text-xs text-neutral-500">Assign people to a department from their profile (System admin → the person).</p>
      </Card>
    </>
  )
}
