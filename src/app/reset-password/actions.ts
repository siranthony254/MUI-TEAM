'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function setNewPassword(_prev: { error?: string } | undefined, fd: FormData) {
  const password = String(fd.get('password') ?? '')
  const confirm = String(fd.get('confirm') ?? '')
  if (password.length < 10) return { error: 'Use at least 10 characters.' }
  if (password !== confirm) return { error: "The two passwords don't match." }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/')
}
