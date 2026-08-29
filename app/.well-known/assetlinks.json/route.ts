import { NextResponse } from 'next/server';

// Android App Links / TWA digital asset links (#1277, part of #1276).
//
// Served as a Route Handler rather than a public/ static file so we control
// the Content-Type explicitly and so the placeholder → real-values swap is a
// pure code change. Next.js supports `.well-known` route handlers directly
// (see next docs: backend-for-frontend, "Serving static assets").
//
// Fingerprints for the TWA (#1279). The first entry is the upload key
// (~/.torny-native/android-upload.keystore, generated 2026-08-29) — it makes
// local/sideloaded builds verify. The Play-distributed app is re-signed by
// Google's app-signing key, whose SHA-256 only exists after the first AAB
// upload: fetch it from Play Console → Test and release → App integrity and
// append it here, or verification fails for store installs (URL bar shows).
const ASSETLINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'no.tornygolf.app',
      sha256_cert_fingerprints: [
        // Upload key
        'CC:57:CB:7B:C5:BC:2A:6F:9E:73:42:79:03:DA:A8:99:76:EF:C7:CA:F3:4B:2F:F3:2C:FA:BE:50:2C:7D:6C:0F',
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
