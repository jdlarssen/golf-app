import { NextResponse } from 'next/server';

// iOS Universal Links — Apple App Site Association (#1277, part of #1276).
//
// Served as a Route Handler (not a public/ static file): the file is
// extensionless AND must carry Content-Type: application/json, which static
// serving can't guarantee for an extensionless path. Apple does not follow
// redirects for this file, so it must answer 200 directly on the apex host
// (mail links build against apex via APP_BASE_URL in lib/mail/i18n.ts).
//
// PLACEHOLDER content — #1283 fills the real appID (TEAMID.no.tornygolf.app)
// and tightens `components` from the catch-all `/*` to the deeplink
// vocabulary (lib/notifications/deeplink.ts). The form is valid so Apple's
// parser reads it without error even while the appID is a dummy.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['TEAMID.no.tornygolf.app'],
        components: [{ '/': '/*' }],
      },
    ],
  },
};

// Next auto-handles HEAD for a GET route handler.
export function GET() {
  return NextResponse.json(AASA, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
