/** Organisation settings stored in `org_settings` (key/value). Defaults apply until an admin changes them. */
export const SETTING_DEFAULTS = {
  org_name: 'MUI Team',
  default_task_days: '7',
  reminder_7d: 'false',
  reminder_3d: 'true',
  reminder_1d: 'true',
  reminder_due_today: 'true',
  reminder_1h: 'false',
  reminder_overdue: 'true',
  reminder_overdue_1d: 'true',
  due_today_hour: '7',
  escalate_after_hours: '24',
  escalate_assigner: 'true',
  escalate_manager: 'false',
  escalate_dept_director: 'false',
  escalate_director: 'false',
  meeting_lead_minutes: '30',
  meeting_minutes_prompt: 'true',
  recurring_enabled: 'true',
  mandatory_groups: 'new_task,task_overdue',
} as const

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type Settings = Record<SettingKey, string>

export function mergeSettings(rows: { key: string; value: string }[] | null): Settings {
  const out: Record<string, string> = { ...SETTING_DEFAULTS }
  for (const r of rows ?? []) if (r.key in SETTING_DEFAULTS) out[r.key] = r.value
  return out as Settings
}

export const isOn = (v: string) => v === 'true'
