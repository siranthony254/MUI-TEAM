import { Card, PageTitle } from '@/components/ui'

/** Shown instead of a generic server error when the server-side Supabase key is absent or rejected. */
export function ServiceKeyNotice({ detail }: { detail?: string }) {
  return (
    <>
      <PageTitle>System admin needs one more setting</PageTitle>
      <Card className="border-amber-300 bg-amber-50">
        <p className="text-sm text-amber-950">
          This area uses a server-side Supabase key that {detail ? 'was rejected' : 'isn’t set'} for this deployment.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-amber-950">
          <li>In Supabase: Project Settings → API → copy the <strong>service_role</strong> key (not the anon key).</li>
          <li>In Vercel: Project → Settings → Environment Variables → add <code>SUPABASE_SERVICE_ROLE_KEY</code> for Production.</li>
          <li>Redeploy (Deployments → ⋯ → Redeploy). Changes to variables only apply to new deployments.</li>
        </ol>
        {detail && <p className="mt-3 text-xs text-amber-800">Supabase said: {detail}</p>}
        <p className="mt-3 text-xs text-amber-800">
          Until this is set, adding people, resetting access, campaigns, file uploads and the reminder scheduler can&apos;t work.
        </p>
      </Card>
    </>
  )
}
