import { LoginForm } from './LoginForm'
import { InstallBanner } from '@/components/pwa/InstallApp'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1F35] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Mic&apos;d Up Initiative</p>
        <h1 className="mt-1 mb-6 text-2xl font-bold text-[#0D1F35]">Team sign in</h1>
        {error === 'not-invited' && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            This account hasn&apos;t been added to the MUI team yet. Ask an administrator to invite you.
          </p>
        )}
        {error === 'reset-link' && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            That reset link has expired or was already used. Request a new one below.
          </p>
        )}
        <LoginForm />
      </div>
      <div className="fixed inset-x-4 bottom-4 mx-auto max-w-sm"><InstallBanner tone="dark" /></div>
    </main>
  )
}
