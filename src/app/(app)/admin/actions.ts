'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TeamRole } from '@/lib/types'

export interface AdminState { error?: string; ok?: string }

const ROLES: TeamRole[] = ['super_admin', 'executive', 'member']

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean)

/**
 * Creates a login for a new team member with a one-time temporary password.
 * The admin shares it privately; the member changes it under Account.
 */
export async function addMember(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  await requireRole('super_admin')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const full_name = String(formData.get('full_name') ?? '').trim()
  const role = String(formData.get('role') ?? 'member') as TeamRole
  const title = String(formData.get('title') ?? '').trim() || null
  if (!email || !full_name) return { error: 'Name and email are required.' }
  if (!ROLES.includes(role)) return { error: 'Invalid role.' }

  const admin = createAdminClient()
  const tempPassword = randomBytes(9).toString('base64url')

  // The person may already have a website account (same Supabase project).
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true, user_metadata: { full_name },
  })
  let userId = created?.user?.id
  let password: string | null = tempPassword

  if (error) {
    if (!/already|registered|exists/i.test(error.message)) return { error: error.message }
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
    if (!existing) return { error: 'That email already has an account but could not be linked.' }
    userId = existing.id
    password = null // keep their existing password
  }

  const { error: insertError } = await admin.from('team_members').upsert({
    id: userId, full_name, email, role, title, active: true,
  })
  if (insertError) return { error: insertError.message }

  revalidatePath('/admin')
  revalidatePath('/people')
  return {
    ok: password
      ? `${full_name} added. Temporary password (shown once — share it privately): ${password}`
      : `${full_name} added. They already had an account, so their existing password still works.`,
  }
}

export async function updateMember(_prev: AdminState | undefined, formData: FormData): Promise<AdminState> {
  const me = await requireRole('super_admin')
  const id = String(formData.get('id') ?? '')
  const role = String(formData.get('role') ?? '') as TeamRole
  if (!ROLES.includes(role)) return { error: 'Invalid role.' }
  if (id === me.id && role !== 'super_admin') {
    return { error: 'You can\'t remove your own Super Admin role. Ask another Super Admin.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('team_members').update({
    full_name: String(formData.get('full_name') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim() || null,
    role,
    title: String(formData.get('title') ?? '').trim() || null,
    department_id: String(formData.get('department_id') ?? '') || null,
    reports_to: String(formData.get('reports_to') ?? '') || null,
    mandate: String(formData.get('mandate') ?? '').trim() || null,
    authority: String(formData.get('authority') ?? '').trim() || null,
    responsibilities: lines(formData.get('responsibilities')),
    deliverables: lines(formData.get('deliverables')),
    active: formData.get('active') === 'on',
  }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { ok: 'Saved.' }
}

export async function addDepartment(formData: FormData) {
  await requireRole('super_admin')
  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) return
  const admin = createAdminClient()
  await admin.from('departments').insert({ name })
  revalidatePath('/admin')
}
