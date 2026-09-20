import Link from 'next/link'
import { ForgotForm } from './ForgotForm'

export const metadata = { title: 'Reset your password' }

export default function ForgotPassword() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1F35] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Mic&apos;d Up Initiative</p>
        <h1 className="mt-1 mb-2 text-2xl font-bold text-[#0D1F35]">Forgot your password?</h1>
        <p className="mb-6 text-sm text-neutral-600">Enter your email and we&apos;ll send you a link to set a new one.</p>
        <ForgotForm />
        <Link href="/login" className="mt-5 block text-center text-sm text-neutral-500 hover:underline">← Back to sign in</Link>
      </div>
    </main>
  )
}
