import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, FileText } from 'lucide-react'
import { requireMember } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime } from '@/lib/time'
import type { Resource } from '@/lib/types'
import { Card, PageTitle, SectionTitle } from '@/components/ui'
import { CopyLink, ReplaceFileForm, ReplaceLinkForm, ShareForm } from './ViewerPanels'
import { deleteResource } from '../actions'
import { ResourceEditForm } from '../../ManageForms'
import { ConfirmButton, ManagePanel } from '@/components/ConfirmButton'

export const dynamic = 'force-dynamic'

interface Version { id: string; version: number; kind: 'file' | 'link'; url: string | null; file_name: string | null; size_bytes: number | null; uploaded_by: string | null; created_at: string }

const size = (b: number | null) =>
  b === null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireMember()
  const supabase = await createClient()

  const { data } = await supabase.from('resources').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const r = data as Resource & { version: number }

  const [{ data: versionRows }, { data: people }, { data: project }] = await Promise.all([
    supabase.from('resource_versions').select('*').eq('resource_id', id).order('version', { ascending: false }),
    supabase.from('team_members').select('id, full_name, role').eq('active', true).neq('id', me.id).neq('role', 'guest').order('full_name'),
    r.project_id ? supabase.from('projects').select('id, name').eq('id', r.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const versions = (versionRows ?? []) as Version[]
  const nameOf = (mid: string | null) => (people ?? []).find((p) => p.id === mid)?.full_name ?? (mid === me.id ? 'you' : '—')

  const canReplace = (await can(me, 'add_resource')) && (r.uploaded_by === me.id || me.role === 'super_admin')
  const isLink = r.kind === 'link'

  return (
    <>
      <Link href={project ? `/projects/${project.id}?tab=files` : '/resources'} className="text-sm text-neutral-500 hover:underline">← {project ? project.name : 'Resources'}</Link>
      <div className="mt-2" />
      <PageTitle sub={`${r.category}${r.visibility === 'executive' ? ' · Executives only' : ''}`}>{r.title}</PageTitle>

      <Card>
        <div className="flex items-start gap-3">
          {isLink ? <ExternalLink size={22} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /> : <FileText size={22} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />}
          <div className="min-w-0 flex-1">
            {r.description && <p className="text-sm">{r.description}</p>}
            <p className="mt-1 text-xs text-neutral-500">
              {isLink ? r.url : `${r.file_name ?? 'file'}${r.size_bytes ? ` · ${size(r.size_bytes)}` : ''}`}
              {' · '}version {r.version} · added {fmtDateTime(r.created_at)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/resources/${r.id}/download`} {...(isLink ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400">
            {isLink ? 'Open link' : 'Download'}
          </a>
          <CopyLink />
        </div>
      </Card>

      {canReplace && (
        <div className="mt-4">
          <ManagePanel label="Edit details">
            <ResourceEditForm resource={r} />
            <form action={deleteResource} className="mt-4 border-t border-neutral-200 pt-3">
              <input type="hidden" name="id" value={r.id} />
              <ConfirmButton message="Delete this file and all of its earlier versions?" className="text-sm font-medium text-red-600 hover:underline">Delete this resource</ConfirmButton>
            </form>
          </ManagePanel>
        </div>
      )}

      <Card className="mt-4">
        <SectionTitle>Share with colleagues</SectionTitle>
        <ShareForm resourceId={r.id} people={(people ?? []).map((p) => ({ id: p.id, label: p.full_name }))} />
      </Card>

      {canReplace && (
        <Card className="mt-4">
          <SectionTitle>{isLink ? 'Change the link' : 'Replace with a new version'}</SectionTitle>
          {isLink ? <ReplaceLinkForm resourceId={r.id} current={r.url ?? ''} /> : <ReplaceFileForm resourceId={r.id} />}
        </Card>
      )}

      <Card className="mt-4">
        <SectionTitle>Version history</SectionTitle>
        <ul className="divide-y divide-neutral-100 text-sm">
          <li className="flex items-center justify-between gap-3 py-2">
            <span><strong>Version {r.version}</strong> <span className="text-xs text-neutral-500">current · {nameOf(r.uploaded_by)}</span></span>
            <a href={`/resources/${r.id}/download`} className="text-amber-700 hover:underline">{isLink ? 'Open' : 'Download'}</a>
          </li>
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2">
              <span>Version {v.version} <span className="text-xs text-neutral-500">{v.kind === 'file' ? `${v.file_name ?? ''} ${size(v.size_bytes)}` : v.url} · {fmtDateTime(v.created_at)}</span></span>
              <a href={`/resources/${r.id}/download?v=${v.id}`} className="shrink-0 text-amber-700 hover:underline">{v.kind === 'link' ? 'Open' : 'Download'}</a>
            </li>
          ))}
        </ul>
        {versions.length === 0 && <p className="mt-2 text-xs text-neutral-500">No earlier versions.</p>}
      </Card>
    </>
  )
}
