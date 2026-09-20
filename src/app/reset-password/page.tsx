import { ResetForm } from './ResetForm'

export const metadata = { title: 'Choose a new password' }

export default function ResetPassword() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1F35] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Mic&apos;d Up Initiative</p>
        <h1 className="mt-1 mb-6 text-2xl font-bold text-[#0D1F35]">Choose a new password</h1>
        <ResetForm />
      </div>
    </main>
  )
}
