/* eslint-disable @next/next/no-img-element */
/** Profile photo, or the person's initials when they haven't added one. */
export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  return url ? (
    <img src={url} alt="" width={size} height={size} style={{ width: size, height: size }}
      className="shrink-0 rounded-full bg-neutral-200 object-cover" />
  ) : (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#0D1F35] font-semibold text-amber-300">
      {initials || '?'}
    </span>
  )
}
