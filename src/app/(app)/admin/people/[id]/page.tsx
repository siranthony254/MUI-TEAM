import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { TeamMember } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { AccessPanel } from './AccessPanel'
import { EditMemberForm } from './EditMemberForm'

export const dynamic = 'force-dynamic'

export default async function EditMember({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireRole('super_admin')
  const supabase = await createClient()

  const { data } = await supabase.from('team_members').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const member = data as TeamMember
  const [{ data: departments }, { data: others }] = await Promise.all([
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name').neq('id', id).eq('active', true).order('full_name'),
  ])

  return (
    <>
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">← Administration</Link>
      <div className="mt-2" />
      <PageTitle sub={`${member.email}${member.active ? '' : ' · deactivated'}`}>{member.full_name}</PageTitle>
      <div className="mb-4 flex gap-4 text-sm">
        <Link href={`/people/${member.id}`} className="font-medium text-amber-700 hover:underline">View profile</Link>
        <Link href={`/activity?person=${member.id}`} className="font-medium text-amber-700 hover:underline">View activity</Link>
      </div>

      <Card>
        <EditMemberForm
          member={member}
          departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))}
          people={(others ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
        />
      </Card>

      {id !== me.id && (
        <Card className="mt-4">
          <SectionTitle>Access</SectionTitle>
          <AccessPanel
            memberId={member.id}
            active={member.active}
            defaultHeir={member.reports_to ?? me.id}
            heirs={(others ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
          />
        </Card>
      )}
    </>
  )
}
