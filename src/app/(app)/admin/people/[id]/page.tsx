import Link from 'next/link'
import { notFound } from 'next/navigation'
import { canDelegate } from '@/lib/grants'
import { getMatrix, requireScope } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { AccessGrantsPanel } from '@/components/admin/AccessGrants'
import { ADMIN_SCOPES, CAPABILITIES, type Capability, type Scope } from '@/lib/capabilities'
import { createClient } from '@/lib/supabase/server'
import type { TeamMember } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { AccessPanel } from './AccessPanel'
import { EditMemberForm } from './EditMemberForm'

export const dynamic = 'force-dynamic'

export default async function EditMember({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireScope('admin.people')
  const supabase = await createClient()

  const { data } = await supabase.from('team_members').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const member = data as TeamMember
  const { count: directors } = await supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('is_director', true).eq('active', true)
  const topRolesLocked = (directors ?? 0) > 0 && !me.is_director
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
          topRolesLocked={topRolesLocked}
        />
      </Card>

      {(await canDelegate(me)) && member.role !== 'super_admin' && (id !== me.id || me.role === 'super_admin' || me.is_director) && await (async () => {
        const { data: grantRows } = await createAdminClient().from('member_grants').select('capability, allowed, expires_at').eq('member_id', id)
        const live = (grantRows ?? []).filter((g) => !g.expires_at || new Date(g.expires_at).getTime() > Date.now())
        const matrix = await getMatrix()
        const level = member.role === 'executive' ? 'executive' : 'member'
        const levelDefaults = matrix[member.role === 'executive' ? 'executive' : 'member']
        const until = live.map((g) => g.expires_at).filter(Boolean).sort()[0]
        return (
          <Card className="mt-4">
            <SectionTitle>Access &amp; delegation</SectionTitle>
            <p className="mb-3 text-xs text-neutral-500">
              Level: {level === 'executive' ? 'Executive' : member.role === 'guest' ? 'Guest (no extra access applies)' : 'Team member'}.
              Choose what to add or take away on top of that, and any part of system administration to delegate.
            </p>
            <AccessGrantsPanel
              memberId={member.id}
              defaults={levelDefaults as Record<string, boolean>}
              canGrantPermissions={me.role === 'super_admin' || me.is_director}
              initial={{
                caps: Object.fromEntries(live.filter((g) => CAPABILITIES.some((c) => c.id === g.capability)).map((g) => [g.capability, g.allowed ? 'allow' : 'deny'])) as Partial<Record<Capability, 'allow' | 'deny'>>,
                scopes: live.filter((g) => g.allowed && ADMIN_SCOPES.some((s) => s.id === g.capability)).map((g) => g.capability as Scope),
                until: until ? String(until).slice(0, 10) : '',
              }}
            />
          </Card>
        )
      })()}

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
