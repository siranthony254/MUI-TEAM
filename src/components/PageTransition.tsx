'use client'

import { usePathname } from 'next/navigation'

/**
 * A short fade-and-rise on every page change, so moving through the app feels like turning
 * pages rather than a hard cut. Keyed on the path so it replays on each navigation; respects
 * prefers-reduced-motion (handled globally in globals.css).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="animate-fade-up">
      {children}
    </div>
  )
}
