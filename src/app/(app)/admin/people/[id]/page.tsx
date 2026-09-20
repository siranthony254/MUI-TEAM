import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { TeamMember } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'
import { EditMemberForm } from './EditMemberForm'

export const dynamic = 'force-dynamic'

export default async function EditMember({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireRole('super_admin')
  const supabase = await createClient()

  const { data } = await supabase.from('team_members').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const [{ data: departments }, { data: others }] = await Promise.all([
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name').neq('id', id).eq('active', true).order('full_name'),
  ])

  return (
    <>
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">← Administration</Link>
      <div className="mt-2" />
      <PageTitle sub={(data as TeamMember).email}>{(data as TeamMember).full_name}</PageTitle>
      <Card>
        <EditMemberForm
          member={data as TeamMember}
          departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))}
          people={(others ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
        />
      </Card>
    </>
  )
}
