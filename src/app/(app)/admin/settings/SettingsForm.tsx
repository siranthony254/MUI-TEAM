'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import type { Group } from '@/lib/notify/groups'
import { isOn, type Settings } from '@/lib/org-settings'
import { saveSettings } from './actions'
import { useFormToast } from '@/components/Toaster'

function Check({ name, label, on, hint }: { name: string; label: string; on: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5" />
      <span>{label}{hint && <span className="block text-xs text-neutral-500">{hint}</span>}</span>
    </label>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-[#101C2C]">
      <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</legend>
      {hint && <p className="mb-3 text-sm text-neutral-600">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </fieldset>
  )
}

export function SettingsForm({ s, groups }: { s: Settings; groups: Group[] }) {
  const [state, action, pending] = useActionState(saveSettings, undefined)
  useFormToast(state)
  const mandatory = s.mandatory_groups.split(',')
  return (
    <form action={action} className="space-y-4">
      <Section title="Organisation">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Name shown in the app
            <input name="org_name" defaultValue={s.org_name} required className={inputClass} />
          </label>
          <label className="block text-sm font-medium">Default task deadline (days from today)
            <input name="default_task_days" type="number" min={0} max={90} defaultValue={s.default_task_days} className={inputClass} />
          </label>
        </div>
        <p className="text-xs text-neutral-500">All dates and times in the app are East Africa Time (Nairobi).</p>
      </Section>

      <Section title="Task reminders" hint="Each task waiting on its assignee gets the reminders you switch on, once each.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Check name="reminder_7d" label="7 days before" on={isOn(s.reminder_7d)} />
          <Check name="reminder_3d" label="3 days before" on={isOn(s.reminder_3d)} />
          <Check name="reminder_1d" label="1 day before" on={isOn(s.reminder_1d)} />
          <Check name="reminder_due_today" label="On the day (morning)" on={isOn(s.reminder_due_today)} />
          <Check name="reminder_1h" label="1 hour before" on={isOn(s.reminder_1h)} />
          <Check name="reminder_overdue" label="When it becomes overdue" on={isOn(s.reminder_overdue)} />
          <Check name="reminder_overdue_1d" label="A day after it became overdue" on={isOn(s.reminder_overdue_1d)} />
        </div>
        <label className="block text-sm font-medium">&ldquo;On the day&rdquo; reminder goes out at (hour, 0–23)
          <input name="due_today_hour" type="number" min={0} max={23} defaultValue={s.due_today_hour} className={`${inputClass} max-w-[120px]`} />
        </label>
      </Section>

      <Section title="Overdue escalation" hint="Tell the people responsible when a task stays overdue.">
        <label className="block text-sm font-medium">Escalate after (hours overdue)
          <input name="escalate_after_hours" type="number" min={0} max={336} defaultValue={s.escalate_after_hours} className={`${inputClass} max-w-[120px]`} />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check name="escalate_assigner" label="The person who assigned it" on={isOn(s.escalate_assigner)} />
          <Check name="escalate_manager" label="The assignee's supervisor" on={isOn(s.escalate_manager)} />
          <Check name="escalate_dept_director" label="The department director" on={isOn(s.escalate_dept_director)} />
          <Check name="escalate_director" label="The Executive Director" on={isOn(s.escalate_director)} />
        </div>
      </Section>

      <Section title="Meetings & automation">
        <label className="block text-sm font-medium">Remind attendees this many minutes before a meeting (0 = off)
          <input name="meeting_lead_minutes" type="number" min={0} max={240} defaultValue={s.meeting_lead_minutes} className={`${inputClass} max-w-[120px]`} />
        </label>
        <Check name="meeting_minutes_prompt" label="After a meeting ends, prompt the organiser to add minutes and action items" on={isOn(s.meeting_minutes_prompt)} />
        <Check name="recurring_enabled" label="Recurring tasks create their next occurrence automatically" on={isOn(s.recurring_enabled)} />
      </Section>

      <Section title="Required notifications" hint="People can't switch these off (in-app, email and push). SMS always stays their choice.">
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => <Check key={g.id} name={`mandatory.${g.id}`} label={g.label} hint={g.hint} on={mandatory.includes(g.id)} />)}
        </div>
      </Section>

      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save settings'}</button>
    </form>
  )
}
