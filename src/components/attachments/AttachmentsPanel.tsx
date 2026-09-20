import { ExternalLink, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmtDay } from '@/lib/time'
import type { Attachment } from '@/lib/types'
import { deleteAttachment } from '@/app/(app)/attachments/actions'
import { AttachmentUploader } from './AttachmentUploader'

const size = (b: number | null) =>
  b === null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/** Server component: lists attachments (RLS-filtered) and, when allowed, lets the viewer add or remove them. */
export async function AttachmentsPanel({
  type, entityId, canAdd, viewerId, isSuperAdmin,
}: {
  type: 'task' | 'report' | 'decision'
  entityId: string
  canAdd: boolean
  viewerId: string
  isSuperAdmin: boolean
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('attachments').select('*').eq('entity_type', type).eq('entity_id', entityId).order('created_at')
  const items = (data ?? []) as Attachment[]

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">No attachments.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              {a.kind === 'link'
                ? <ExternalLink size={16} className="shrink-0 text-amber-600" aria-hidden />
                : <Paperclip size={16} className="shrink-0 text-amber-600" aria-hidden />}
              <a href={`/attachments/${a.id}/download`} {...(a.kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                {a.file_name ?? a.url}
              </a>
              <span className="shrink-0 text-xs text-neutral-400">{a.kind === 'file' ? `${size(a.size_bytes)} · ` : ''}{fmtDay(a.created_at)}</span>
              {(isSuperAdmin || a.uploaded_by === viewerId) && (
                <form action={deleteAttachment}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && <AttachmentUploader type={type} entityId={entityId} />}
    </div>
  )
}
