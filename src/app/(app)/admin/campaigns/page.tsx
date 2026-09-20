import Link from 'next/link'
import { requireAdminOrDirector } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fmtDateTime } from '@/lib/time'
import type { Campaign } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { ServiceKeyNotice } from '@/components/ServiceKeyNotice'
import { CampaignForm } from './CampaignForm'

export const dynamic = 'force-dynamic'

export default async function Campaigns() {
  const me = await requireAdminOrDirector()
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return <ServiceKeyNotice />
  const admin = createAdminClient()
  const [{ data: departments }, { data: members }, { data: sent }] = await Promise.all([
    admin.from('departments').select('id, name').order('name'),
    admin.from('team_members').select('id, full_name, id').eq('active', true).order('full_name'),
    admin.from('campaigns').select('*').order('created_at', { ascending: false }).limit(20),
  ])
  const nameOf = (id: string | null) => (members ?? []).find((m) => m.id === id)?.full_name ?? '—'

  return (
    <>
      <Link href={me.role === 'super_admin' ? '/admin' : '/director'} className="text-sm text-neutral-500 hover:underline">← Back</Link>
      <div className="mt-2" />
      <PageTitle sub="A targeted message to part of the team. For official communication from the Executive Director, use Announcements.">Campaigns</PageTitle>

      <Card>
        <CampaignForm
          departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name }))}
          people={(members ?? []).filter((m) => m.id !== me.id).map((m) => ({ id: m.id, label: m.full_name }))}
        />
      </Card>

      <div className="mt-8" />
      <SectionTitle>Sent</SectionTitle>
      {(sent ?? []).length === 0 ? <Card><p className="text-sm text-neutral-600">Nothing sent yet.</p></Card> : (
        <div className="space-y-2">
          {((sent ?? []) as Campaign[]).map((c) => (
            <Card key={c.id}>
              <p className="font-medium">{c.title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600">{c.body}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {c.recipient_count} recipient{c.recipient_count === 1 ? '' : 's'} · {c.audience}
                {c.channels.length ? ` · + ${c.channels.join(', ')}` : ''} · {nameOf(c.sent_by)} · {fmtDateTime(c.created_at)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
