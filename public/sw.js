// MUI Team service worker.
// Private, signed-in pages are never cached. Only the static shell assets are,
// so the app installs and opens fast; an offline page covers lost connectivity.
const CACHE = 'mui-team-static-v3'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  // Page navigations: network only, offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  // Immutable build assets: cache-first.
  const url = new URL(req.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      })),
    )
  }
})

// Web push. Pushes about the same thing (one chat, one task) replace each other rather than stacking up,
// and nothing is shown when the person is already looking at that very page.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: event.data && event.data.text() } }
  const url = data.url || '/notifications'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const watching = windows.some((w) => w.visibilityState === 'visible' && w.focused && new URL(w.url).pathname === url.split('?')[0])
    if (watching) return
    await self.registration.showNotification(data.title || 'MUI Team', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.kind === 'chat' || data.kind === 'dm' || data.kind === 'mention' ? `chat:${url}` : `${data.kind || 'n'}:${url}`,
      renotify: true,
      data: { url },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
    if (open) {
      await open.focus()
      if ('navigate' in open) await open.navigate(target).catch(() => {})
      return
    }
    await self.clients.openWindow(target)
  })())
})
