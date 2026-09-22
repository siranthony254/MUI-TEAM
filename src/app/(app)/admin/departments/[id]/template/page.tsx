import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, PageTitle } from '@/components/ui'
import { TemplateEditor } from '@/components/admin/TemplateEditor'

export const dynamic = 'force-dynamic'

export default async function DepartmentTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data: dept } = await supabase.from('departments').select('id, name, director_id').eq('id', id).maybeSingle()
  if (!dept) notFound()

  const allowed = me.role === 'super_admin' || me.is_director || dept.director_id === me.id
  if (!allowed) {
    return <Card><p className="text-sm text-neutral-600">Only that department&apos;s director, the Executive Director, or a system admin can edit its report template.</p></Card>
  }

  const [{ data: own }, { data: fallback }] = await Promise.all([
    supabase.from('report_templates').select('sections').eq('department_id', id).maybeSingle(),
    supabase.from('report_templates').select('sections').is('department_id', null).maybeSingle(),
  ])
  const sections = ((own?.sections ?? fallback?.sections ?? []) as { label: string; hint?: string | null }[])
  const inherited = !own

  return (
    <>
      <Link href="/admin/departments" className="text-sm text-neutral-500 hover:underline">← Departments</Link>
      <div className="mt-2" />
      <PageTitle sub={inherited
        ? "Currently using the organisation-wide default. Saving here gives this department its own."
        : 'This department has its own report template.'}>
        {dept.name} report template
      </PageTitle>
      <Card>
        <TemplateEditor departmentId={id} name={`${dept.name} report`} initial={sections} />
      </Card>
    </>
  )
}
