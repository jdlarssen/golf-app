import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Tørny',
    short_name: 'Tørny',
    description: 'Tørny — turneringsapp for golf',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f6f0',
    theme_color: '#1b4332',
    orientation: 'portrait',
    lang: 'nb-NO',
    categories: ['sports', 'lifestyle'],
    icons: [
      {
        // app/icon.tsx — 192x192 main icon
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // app/icon0.tsx — 512x512 high-res icon
        src: '/icon0',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // app/apple-icon.tsx — 180x180 iOS icon
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
