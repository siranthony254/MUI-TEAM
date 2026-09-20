'use server'

import { revalidatePath } from 'next/cache'
import { requireScope } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { GROUPS } from '@/lib/notify/groups'

export interface SettingsState { error?: string; ok?: string }

const BOOLS = [
  'reminder_7d', 'reminder_3d', 'reminder_1d', 'reminder_due_today', 'reminder_1h', 'reminder_overdue', 'reminder_overdue_1d',
  'escalate_assigner', 'escalate_manager', 'escalate_dept_director', 'escalate_director',
  'meeting_minutes_prompt', 'recurring_enabled',
]

const int = (fd: FormData, k: string, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(fd.get(k)))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export async function saveSettings(_prev: SettingsState | undefined, fd: FormData): Promise<SettingsState> {
  await requireScope('admin.settings')
  const orgName = String(fd.get('org_name') ?? '').trim()
  if (orgName.length < 2 || orgName.length > 60) return { error: 'The organisation name should be 2–60 characters.' }

  const values: Record<string, string> = {
    org_name: orgName,
    default_task_days: String(int(fd, 'default_task_days', 0, 90, 7)),
    due_today_hour: String(int(fd, 'due_today_hour', 0, 23, 7)),
    escalate_after_hours: String(int(fd, 'escalate_after_hours', 0, 336, 24)),
    meeting_lead_minutes: String(int(fd, 'meeting_lead_minutes', 0, 240, 30)),
    mandatory_groups: GROUPS.filter((g) => fd.get(`mandatory.${g.id}`) === 'on').map((g) => g.id).join(','),
  }
  for (const k of BOOLS) values[k] = fd.get(k) === 'on' ? 'true' : 'false'

  const { error } = await createAdminClient()
    .from('org_settings').upsert(Object.entries(values).map(([key, value]) => ({ key, value })), { onConflict: 'key' })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { ok: 'Saved. Reminders and rules use the new settings from the next scheduler run.' }
}
