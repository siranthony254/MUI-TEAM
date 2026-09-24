import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'
import { Card, PageTitle } from '@/components/ui'
import { templateBySlug } from '@/lib/documents/templates'
import { TemplateFillForm } from './TemplateFillForm'

export const dynamic = 'force-dynamic'

export default async function FillTemplate({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireMember()
  const template = templateBySlug(slug)
  if (!template) notFound()

  return (
    <>
      <Link href="/documents" className="text-sm text-neutral-500 hover:underline">← Documents &amp; Templates</Link>
      <div className="mt-2" />
      <PageTitle sub={template.description}>{template.name}</PageTitle>
      <Card>
        <TemplateFillForm template={template} />
      </Card>
    </>
  )
}
