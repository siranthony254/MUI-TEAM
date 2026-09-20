'use client'

import { useState, useSyncExternalStore } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import { getServerSnapshot, getSnapshot, promptInstall, subscribe } from './pwa-store'

function usePwa() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function IosSteps() {
  return (
    <ol className="mt-2 space-y-1.5 text-sm">
      <li className="flex items-center gap-2"><span className="font-semibold">1.</span> Open this page in <strong>Safari</strong></li>
      <li className="flex items-center gap-2"><span className="font-semibold">2.</span> Tap <Share size={16} aria-label="Share" className="inline" /> Share</li>
      <li className="flex items-center gap-2"><span className="font-semibold">3.</span> Choose <SquarePlus size={16} aria-hidden className="inline" /> <strong>Add to Home Screen</strong></li>
    </ol>
  )
}

/** Full card (Account page and More): always explains how to install, whatever the device. */
export function InstallCard() {
  const pwa = usePwa()
  const [busy, setBusy] = useState(false)
  if (!pwa.ready) return null

  if (pwa.installed) {
    return <p className="text-sm text-green-700">MUI Team is installed on this device.</p>
  }
  return (
    <div>
      <p className="text-sm text-neutral-600">Install MUI Team for one-tap access, a full-screen app, and push notifications on your phone.</p>
      {pwa.canPrompt ? (
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); await promptInstall(); setBusy(false) }}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0D1F35] hover:bg-amber-400 disabled:opacity-60">
          <Download size={16} aria-hidden /> Install app
        </button>
      ) : pwa.ios ? (
        <IosSteps />
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          Use your browser&apos;s menu: <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </p>
      )}
    </div>
  )
}

/**
 * Slim banner (sign-in screen, dashboard). Appears only when an install is actually possible,
 * can be dismissed, and stays dismissed.
 */
export function InstallBanner({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const pwa = usePwa()
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('mui-install-dismissed') === '1' } catch { return false }
  })
  const [open, setOpen] = useState(false)

  if (!pwa.ready || pwa.installed || dismissed || (!pwa.canPrompt && !pwa.ios)) return null

  const dark = tone === 'dark'
  return (
    <div className={`rounded-xl p-3 text-sm ${dark ? 'bg-white/10 text-white' : 'border border-amber-300 bg-amber-50 text-amber-950'}`}>
      <div className="flex items-center gap-3">
        <Download size={18} aria-hidden className="shrink-0" />
        <p className="flex-1">Install MUI Team on this device.</p>
        {pwa.canPrompt ? (
          <button onClick={() => promptInstall()} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-[#0D1F35] hover:bg-amber-400">Install</button>
        ) : (
          <button onClick={() => setOpen((o) => !o)} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-[#0D1F35] hover:bg-amber-400">How</button>
        )}
        <button
          aria-label="Dismiss"
          onClick={() => { setDismissed(true); try { localStorage.setItem('mui-install-dismissed', '1') } catch {} }}
          className="px-1 text-lg leading-none opacity-60 hover:opacity-100">×</button>
      </div>
      {open && pwa.ios && <IosSteps />}
    </div>
  )
}
