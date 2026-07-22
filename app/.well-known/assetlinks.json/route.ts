import { NextResponse } from 'next/server';

// Android App Links / TWA digital asset links (#1277, part of #1276).
//
// Served as a Route Handler rather than a public/ static file so we control
// the Content-Type explicitly and so the placeholder → real-values swap is a
// pure code change. Next.js supports `.well-known` route handlers directly
// (see next docs: backend-for-frontend, "Serving static assets").
//
// PLACEHOLDER content — #1279 fills the real package name and the SHA-256
// fingerprints from BOTH the upload key AND Google's app-signing key
// (Play Console → App integrity). The form is valid so Google's verifier
// parses it without error even while the fingerprint is a dummy.
const ASSETLINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'no.tornygolf.app',
      sha256_cert_fingerprints: [
        '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00',
      ],
    },
  },
];

// Apple's CDN and Google's verifier re-fetch on their own cadence, so a short
// cache is plenty. Next auto-handles HEAD for a GET route handler.
export function GET() {
  return NextResponse.json(ASSETLINKS, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
