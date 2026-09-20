'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { AccessGrantsFields } from '@/components/admin/AccessGrants'
import { addMember } from './actions'

interface Option { id: string; label: string }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-neutral-200 p-4">
      <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</legend>
      {hint && <p className="mb-3 text-sm text-neutral-600">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </fieldset>
  )
}

/**
 * One form to set a person up completely: who they are, where they sit, what they own,
 * and what they can do. Everything here is what they see when they first sign in.
 */
export function AddMemberForm({
  departments, people, topRolesLocked, canDelegate, canGrantPermissions,
}: {
  departments: Option[]
  people: Option[]
  topRolesLocked: boolean
  canDelegate: boolean
  canGrantPermissions: boolean
}) {
  const [state, action, pending] = useActionState(addMember, undefined)
  return (
    <form action={action} className="space-y-4">
      <Section title="Who they are">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Full name<input name="full_name" required className={inputClass} /></label>
          <label className="block text-sm font-medium">Email<input name="email" type="email" required className={inputClass} /></label>
          <label className="block text-sm font-medium">Phone (optional)<input name="phone" type="tel" placeholder="0712 345 678" className={inputClass} /></label>
          <label className="block text-sm font-medium">Start date (optional)<input name="start_date" type="date" className={inputClass} /></label>
        </div>
      </Section>

      <Section title="Where they sit">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Title<input name="title" placeholder="e.g. Insights Director" className={inputClass} /></label>
          <label className="block text-sm font-medium">Access level
            <select name="role" defaultValue="member" className={inputClass}>
              <option value="member">Team Member</option>
              <option value="guest">Guest / external collaborator</option>
              <option value="executive">Executive</option>
              <option value="super_admin" disabled={topRolesLocked}>System Admin{topRolesLocked ? ' (Director only)' : ''}</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Department
            <select name="department_id" defaultValue="" className={inputClass}>
              <option value="">None</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Reports to
            <select name="reports_to" defaultValue="" className={inputClass}>
              <option value="">No one</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <label className={`flex items-start gap-2 text-sm ${topRolesLocked ? 'text-neutral-400' : ''}`}>
          <input type="checkbox" name="is_director" disabled={topRolesLocked} className="mt-0.5" />
          <span>This person is the Executive Director (Executive access level). They see the whole organisation and alone publish official announcements.</span>
        </label>
      </Section>

      <Section title="What they own" hint="This is what they see on their role page and welcome screen, and what the team can see on their profile.">
        <label className="block text-sm font-medium">Mandate — why does this role exist?
          <textarea name="mandate" rows={2} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Authority — what can they decide without asking?
          <textarea name="authority" rows={2} className={inputClass} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Responsibilities (one per line)
            <textarea name="responsibilities" rows={5} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">Deliverables (one per line)
            <textarea name="deliverables" rows={5} className={inputClass} />
          </label>
        </div>
        <label className="block text-sm font-medium">How success is measured (one per line)
          <textarea name="success_measures" rows={3} placeholder={'e.g. Two episodes recorded per month\nResearch briefs submitted three days before recording'} className={inputClass} />
        </label>
      </Section>

      {canDelegate && (
        <Section title="Access & delegation" hint="What this person can do beyond their level, and any part of system administration you're delegating to them.">
          <AccessGrantsFields canGrantPermissions={canGrantPermissions} />
        </Section>
      )}

      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Adding…' : 'Add member'}</button>
    </form>
  )
}
