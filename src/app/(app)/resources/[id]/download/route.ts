import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMember } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Access check first (the resources table's RLS decides what this member may
 * see), then a 60-second signed URL. The storage bucket itself is private.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await getMember())) return NextResponse.redirect(new URL('/login', _req.url))

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('resources')
    .select('kind, url, storage_path, file_name')
    .eq('id', id)
    .maybeSingle()
  if (!current) return new NextResponse('Not found', { status: 404 })

  // ?v=<version id> opens an earlier version (visible only if the resource itself is).
  const versionId = _req.nextUrl.searchParams.get('v')
  let resource = current
  if (versionId) {
    const { data: old } = await supabase
      .from('resource_versions').select('kind, url, storage_path, file_name').eq('id', versionId).eq('resource_id', id).maybeSingle()
    if (!old) return new NextResponse('Not found', { status: 404 })
    resource = { ...old, file_name: old.file_name ?? current.file_name }
  }

  if (resource.kind === 'link' && resource.url) return NextResponse.redirect(resource.url)

  const { data, error } = await createAdminClient()
    .storage.from('resources')
    .createSignedUrl(resource.storage_path!, 60, { download: resource.file_name ?? true })
  if (error || !data) return new NextResponse('File unavailable', { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
