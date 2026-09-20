import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: "MUI Team — Mic'd Up Initiative",
    short_name: 'MUI Team',
    description: 'Roles, responsibilities, tasks and deadlines for the MUI team.',
    lang: 'en',
    dir: 'ltr',
    // "?source=pwa" lets us tell installed launches apart; the proxy treats it like "/".
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#0D1F35',
    theme_color: '#0D1F35',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My Work', url: '/tasks', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Chat', url: '/chat', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Calendar', url: '/calendar', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  }
}
