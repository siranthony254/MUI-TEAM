import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingItem } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { AddStepForm, WelcomeForm } from './OnboardingForms'
import { removeOnboardingItem } from './actions'

export const dynamic = 'force-dynamic'

export default async function OnboardingAdmin() {
  await requireRole('super_admin')
  const admin = createAdminClient()
  const [{ data: items }, { data: welcome }, { data: progress }] = await Promise.all([
    admin.from('onboarding_items').select('*').order('position'),
    admin.from('org_settings').select('value').eq('key', 'welcome_message').maybeSingle(),
    admin.from('member_onboarding').select('item_id, done_at'),
  ])
  const stat = (id: string) => {
    const rows = (progress ?? []).filter((p) => p.item_id === id)
    return `${rows.filter((r) => r.done_at).length}/${rows.length} done`
  }

  return (
    <>
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">← System admin</Link>
      <div className="mt-2" />
      <PageTitle sub="What every new member finds on their dashboard when they first sign in.">Onboarding</PageTitle>

      <Card>
        <SectionTitle>Welcome message</SectionTitle>
        <WelcomeForm value={welcome?.value ?? ''} />
      </Card>

      <Card className="mt-4">
        <SectionTitle>Checklist ({(items ?? []).length} steps)</SectionTitle>
        {(items ?? []).length === 0 ? <p className="text-sm text-neutral-500">No steps yet.</p> : (
          <ul className="divide-y divide-neutral-100">
            {((items ?? []) as OnboardingItem[]).map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{i.title}</span>
                  {i.description && <span className="block text-xs text-neutral-500">{i.description}</span>}
                  <span className="block text-xs text-neutral-400">{i.link ? `Links to ${i.link} · ` : ''}{stat(i.id)}</span>
                </span>
                <form action={removeOnboardingItem}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <SectionTitle>Add a step</SectionTitle>
        <AddStepForm />
      </Card>

      <p className="mt-4 text-xs text-neutral-500">
        Each new member also gets their role, title, department, mandate and responsibilities from the person who adds them
        (System admin → their profile), so they see exactly what is expected of them at first login.
      </p>
    </>
  )
}
