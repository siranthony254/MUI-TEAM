/**
 * The project URL is just the origin (https://<ref>.supabase.co). The dashboard
 * also shows ".../rest/v1/", which is easy to paste by mistake and breaks auth,
 * so anything after the origin is dropped.
 */
export function supabaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '')
  try {
    return new URL(raw).origin
  } catch {
    return 'https://placeholder.supabase.co'
  }
}
