import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MUI Team — Mic'd Up Initiative",
    short_name: 'MUI Team',
    description: 'Roles, responsibilities, tasks and deadlines for the MUI team.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0D1F35',
    theme_color: '#0D1F35',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
