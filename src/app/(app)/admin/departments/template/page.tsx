import Link from 'next/link'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, PageTitle } from '@/components/ui'
import { TemplateEditor } from '@/components/admin/TemplateEditor'

export const dynamic = 'force-dynamic'

export default async function DefaultTemplatePage() {
  const me = await requireMember()
  if (!(me.role === 'super_admin' || me.is_director)) {
    return <Card><p className="text-sm text-neutral-600">Only a system admin or the Executive Director can edit the default report template.</p></Card>
  }
  const supabase = await createClient()
  const { data } = await supabase.from('report_templates').select('sections').is('department_id', null).maybeSingle()
  const sections = (data?.sections ?? []) as { label: string; hint?: string | null }[]

  return (
    <>
      <Link href="/admin/departments" className="text-sm text-neutral-500 hover:underline">← Departments</Link>
      <div className="mt-2" />
      <PageTitle sub="What every report covers unless a department has set up its own.">
        Organisation-wide report template
      </PageTitle>
      <Card>
        <TemplateEditor departmentId={null} name="Standard report" initial={sections} />
      </Card>
    </>
  )
}
