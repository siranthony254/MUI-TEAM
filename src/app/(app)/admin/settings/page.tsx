import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { GROUPS } from '@/lib/notify/groups'
import { mergeSettings } from '@/lib/org-settings'
import { PageTitle } from '@/components/ui'
import { ServiceKeyNotice } from '@/components/ServiceKeyNotice'
import { SettingsForm } from './SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireRole('super_admin')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return <ServiceKeyNotice />
  const { data, error } = await createAdminClient().from('org_settings').select('key, value')
  if (error) return <ServiceKeyNotice detail={error.message} />

  return (
    <>
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">← System admin</Link>
      <div className="mt-2" />
      <PageTitle sub="How the organisation runs: reminders, escalation, meeting prompts and required notifications.">Organisation settings</PageTitle>
      <SettingsForm s={mergeSettings(data)} groups={GROUPS} />
    </>
  )
}
