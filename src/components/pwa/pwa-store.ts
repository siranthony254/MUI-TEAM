'use client'

/**
 * Browsers fire `beforeinstallprompt` once, early - possibly before any install button is on screen -
 * so it is captured here at app start and handed to whichever component asks for it later.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaState {
  ready: boolean          // client-side detection has run
  installed: boolean      // already running as an installed app
  canPrompt: boolean      // the browser offered a one-tap install
  ios: boolean            // iPhone/iPad: install is manual (Share -> Add to Home Screen)
}

let deferred: BeforeInstallPromptEvent | null = null
let state: PwaState = { ready: false, installed: false, canPrompt: false, ios: false }
const listeners = new Set<() => void>()
let started = false

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: minimal-ui)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function startPwa() {
  if (started || typeof window === 'undefined') return
  started = true

  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  set({ ready: true, installed: isStandalone(), ios })

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()            // keep the event so we can show our own button
    deferred = e as BeforeInstallPromptEvent
    set({ canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    set({ installed: true, canPrompt: false })
  })
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => set({ installed: isStandalone() }))
}

export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getSnapshot = () => state
export const getServerSnapshot = (): PwaState => ({ ready: false, installed: false, canPrompt: false, ios: false })

/** Show the browser's install dialog. Returns whether the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  set({ canPrompt: false })
  return outcome === 'accepted'
}
