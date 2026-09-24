import Link from 'next/link'
import { FileText, Mic } from 'lucide-react'
import { requireMember } from '@/lib/auth'
import { Card, PageTitle } from '@/components/ui'
import { DOC_TEMPLATES } from '@/lib/documents/templates'

export const dynamic = 'force-dynamic'

export default async function DocumentsHub() {
  await requireMember()

  return (
    <>
      <PageTitle sub="Fillable, branded documents — fill them in here and download a finished PDF. Nothing is saved on the server.">
        Documents &amp; Templates
      </PageTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        {DOC_TEMPLATES.map((t) => (
          <Link key={t.slug} href={`/documents/${t.slug}`}>
            <Card className="flex h-full items-start gap-3 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                {t.brand === 'conversations' ? <Mic size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-[#0D1F35] dark:text-white">{t.name}</span>
                <span className="mt-0.5 block text-sm text-neutral-600 dark:text-neutral-400">{t.description}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
        A department can feature the ones relevant to it on its own page — see a department&apos;s
        &ldquo;Documents &amp; templates&rdquo; section, or ask its director to add one.
      </p>
    </>
  )
}
