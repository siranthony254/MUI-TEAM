import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import { requireMember, isExecOrAbove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDay } from '@/lib/time'
import { RESOURCE_CATEGORIES, type Resource } from '@/lib/types'
import { Card, PageTitle } from '@/components/ui'
import { AddLinkForm, UploadFileForm } from './UploadForms'
import { deleteResource } from './actions'

export const dynamic = 'force-dynamic'

const size = (b: number | null) =>
  b === null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

export default async function Resources({
  searchParams,
}: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const { category, q } = await searchParams
  const me = await requireMember()
  const supabase = await createClient()

  let query = supabase.from('resources').select('*').is('project_id', null).order('created_at', { ascending: false })
  if (category && (RESOURCE_CATEGORIES as readonly string[]).includes(category)) query = query.eq('category', category)
  if (q?.trim()) query = query.ilike('title', `%${q.trim().replace(/[%_]/g, '')}%`)
  const { data } = await query
  const items = (data ?? []) as Resource[]

  const uploaderIds = [...new Set(items.map((r) => r.uploaded_by).filter(Boolean))] as string[]
  const { data: uploaders } = uploaderIds.length
    ? await supabase.from('team_members').select('id, full_name').in('id', uploaderIds)
    : { data: [] as { id: string; full_name: string }[] }
  const nameOf = (id: string | null) => (uploaders ?? []).find((u) => u.id === id)?.full_name

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-sm ${active ? 'border-[#0D1F35] bg-[#0D1F35] text-white' : 'border-neutral-300 bg-white text-neutral-700'}`
  const href = (cat?: string) => `/resources?${new URLSearchParams({ ...(cat ? { category: cat } : {}), ...(q ? { q } : {}) })}`

  return (
    <>
      <PageTitle sub="MUI's shared knowledge: governance, policies, manuals, templates and more.">Resources</PageTitle>

      <form className="mb-3 flex gap-2">
        {category && <input type="hidden" name="category" value={category} />}
        <input name="q" defaultValue={q} placeholder="Search by title…" aria-label="Search resources"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        <button className="rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50">Search</button>
      </form>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href={href()} className={chip(!category)}>All</Link>
        {RESOURCE_CATEGORIES.map((c) => <Link key={c} href={href(c)} className={chip(category === c)}>{c}</Link>)}
      </div>

      {items.length === 0 ? (
        <Card><p className="text-sm text-neutral-600">{q || category ? 'Nothing matches.' : 'No resources yet.'}</p></Card>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Card key={r.id} className="flex items-start gap-3">
              {r.kind === 'link' ? <ExternalLink size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /> : <FileText size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />}
              <div className="min-w-0 flex-1">
                {/* Files go through /download so access is checked before a signed URL is issued. */}
                <a href={`/resources/${r.id}/download`} {...(r.kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="font-medium hover:underline">{r.title}</a>
                {r.description && <p className="text-sm text-neutral-600">{r.description}</p>}
                <p className="mt-1 text-xs text-neutral-500">
                  {r.category}
                  {r.kind === 'file' && r.size_bytes ? ` · ${size(r.size_bytes)}` : ''}
                  {nameOf(r.uploaded_by) ? ` · ${nameOf(r.uploaded_by)}` : ''} · {fmtDay(r.created_at)}
                  {r.visibility === 'executive' ? ' · Executives only' : ''}
                </p>
              </div>
              {(me.role === 'super_admin' || r.uploaded_by === me.id) && (
                <form action={deleteResource}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs text-neutral-400 hover:text-red-600">Delete</button>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}

      {isExecOrAbove(me) && (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card><h2 className="mb-3 font-semibold">Upload a file</h2><UploadFileForm /></Card>
          <Card><h2 className="mb-3 font-semibold">Or add a link</h2><AddLinkForm /></Card>
        </div>
      )}
    </>
  )
}
