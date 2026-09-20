import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMember } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** RLS on `attachments` decides who may see the row; only then is a 60-second signed URL issued. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await getMember())) return NextResponse.redirect(new URL('/login', req.url))

  const supabase = await createClient()
  const { data: a } = await supabase
    .from('attachments').select('kind, url, storage_path, file_name').eq('id', id).maybeSingle()
  if (!a) return new NextResponse('Not found', { status: 404 })
  if (a.kind === 'link' && a.url) return NextResponse.redirect(a.url)

  const { data, error } = await createAdminClient()
    .storage.from('attachments')
    .createSignedUrl(a.storage_path!, 60, { download: a.file_name ?? true })
  if (error || !data) return new NextResponse('File unavailable', { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
