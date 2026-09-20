import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, PageTitle } from '@/components/ui'
import { MeetingForm } from '../MeetingForm'

export const dynamic = 'force-dynamic'

export default async function NewMeeting() {
  const me = await requireRole('super_admin', 'executive')
  const supabase = await createClient()
  const [{ data: people }, { data: projects }] = await Promise.all([
    supabase.from('team_members').select('id, full_name').eq('active', true).neq('id', me.id).order('full_name'),
    supabase.from('projects').select('id, name').neq('status', 'done').order('name'),
  ])
  return (
    <>
      <PageTitle sub="Everyone you invite is notified.">Schedule a meeting</PageTitle>
      <Card>
        <MeetingForm
          people={(people ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
          projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
        />
      </Card>
    </>
  )
}
