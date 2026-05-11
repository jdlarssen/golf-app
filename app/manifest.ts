import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Golf-app',
    short_name: 'Golf-app',
    description: 'Best ball netto-app for kompiser',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#16a34a',
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
