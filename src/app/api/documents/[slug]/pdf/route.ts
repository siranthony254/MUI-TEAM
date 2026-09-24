import { NextResponse, type NextRequest } from 'next/server'
import { getMember } from '@/lib/auth'
import { templateBySlug } from '@/lib/documents/templates'
import { renderTemplatePdf } from '@/lib/documents/pdf'

export const dynamic = 'force-dynamic'

/** Renders a filled template into a PDF and streams it back for download. Nothing is stored. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const me = await getMember()
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const { slug } = await params
  const template = templateBySlug(slug)
  if (!template) return NextResponse.json({ error: 'Unknown template.' }, { status: 404 })

  let values: Record<string, unknown>
  try {
    values = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  const clean: Record<string, string> = {}
  for (const f of template.fields) {
    const v = values[f.key]
    if (typeof v === 'string') clean[f.key] = v.slice(0, 4000)
  }
  if (template.fields.some((f) => f.required) && template.fields.filter((f) => f.required).every((f) => !clean[f.key]?.trim())) {
    return NextResponse.json({ error: 'Fill in the required fields first.' }, { status: 400 })
  }

  try {
    const bytes = await renderTemplatePdf(template, clean)
    const fileName = `${template.slug}-${(clean.title || clean.guest_name || 'draft').replace(/[^\w.-]+/g, '_').slice(0, 60)}.pdf`
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[documents] render failed:', err)
    return NextResponse.json({ error: 'Could not generate the PDF.' }, { status: 500 })
  }
}
