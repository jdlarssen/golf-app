import { NextResponse } from 'next/server';

// Android App Links / TWA digital asset links (#1277, part of #1276).
//
// Served as a Route Handler rather than a public/ static file so we control
// the Content-Type explicitly and so the placeholder → real-values swap is a
// pure code change. Next.js supports `.well-known` route handlers directly
// (see next docs: backend-for-frontend, "Serving static assets").
//
// Fingerprints for the TWA (#1279) and the app's friend links (#2627). The
// first entry is the upload key (~/.torny-native/android-upload.keystore,
// generated 2026-08-29) — it makes local/sideloaded builds verify. The
// Play-distributed app is re-signed by Google's app-signing key (Play
// Console → Test and release → App integrity), the second entry, read from
// Play Console 2026-10-30; without it verification fails for store installs
// (URL bar shows). store-build-proof-android.sh reads the line after the
// upload-key comment below and expects exactly one fingerprint there, so keep
// each key under its own comment.
const ASSETLINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'no.tornygolf.app',
      sha256_cert_fingerprints: [
        // Upload key
        'CC:57:CB:7B:C5:BC:2A:6F:9E:73:42:79:03:DA:A8:99:76:EF:C7:CA:F3:4B:2F:F3:2C:FA:BE:50:2C:7D:6C:0F',
        // Play app signing key
        '18:9D:DB:09:F2:47:89:67:D6:D5:69:F8:73:06:CB:17:32:D9:95:44:06:F3:D2:24:60:22:4B:DD:13:59:AE:68',
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
