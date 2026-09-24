'use client'

import { useActionState } from 'react'
import { buttonClass } from '@/components/ui'
import { useFormToast } from '@/components/Toaster'
import { setDepartmentTemplates } from '../document-actions'
import { DOC_TEMPLATES } from '@/lib/documents/templates'

export function DepartmentTemplatesPicker({ departmentId, selected }: { departmentId: string; selected: string[] }) {
  const [state, action, pending] = useActionState(setDepartmentTemplates, undefined)
  useFormToast(state)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="department_id" value={departmentId} />
      <ul className="space-y-1.5">
        {DOC_TEMPLATES.map((t) => (
          <li key={t.slug}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="templates" value={t.slug} defaultChecked={selected.includes(t.slug)} className="mt-0.5" />
              <span>
                <span className="font-medium">{t.name}</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{t.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Save templates'}</button>
    </form>
  )
}
