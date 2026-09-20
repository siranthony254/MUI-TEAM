'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signIn } from './actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined)
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium text-neutral-700">
        Email or phone number
        <input name="identifier" type="text" inputMode="email" autoComplete="username" required
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
      </label>
      <label className="block text-sm font-medium text-neutral-700">
        Password
        <input name="password" type="password" autoComplete="current-password" required
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
      </label>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button disabled={pending}
        className="w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-[#0D1F35] hover:bg-amber-400 disabled:opacity-60">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-neutral-500 hover:underline">Forgot password?</Link>
        <span className="text-neutral-400">You stay signed in until you sign out</span>
      </div>
    </form>
  )
}
