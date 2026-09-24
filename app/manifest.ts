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
        // public/icons/icon-192.png via a rewrite in next.config.ts (#1985);
        // the URL predates the static file and installed PWAs keep it.
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // public/icons/icon-512.png, same rewrite
        src: '/icon0',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // public/icons/apple-icon-180.png, same rewrite
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        // Static maskable icons for Android's adaptive-icon masking
        // (circle/squircle/rounded-square). Every icon here comes from one
        // run of native/assets/generate-icons.mjs (#1278, #1985).
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
