'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/** A member ticking off one of their own onboarding steps. */
export async function markOnboardingDone(fd: FormData) {
  const me = await requireMember()
  const supabase = await createClient()
  await supabase
    .from('member_onboarding')
    .update({ done_at: new Date().toISOString() })
    .eq('member_id', me.id)
    .eq('item_id', String(fd.get('item_id') ?? ''))
  revalidatePath('/')
}
