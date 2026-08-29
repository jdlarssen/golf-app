import { NextResponse } from 'next/server';

// iOS Universal Links — Apple App Site Association (#1277, part of #1276).
//
// Served as a Route Handler (not a public/ static file): the file is
// extensionless AND must carry Content-Type: application/json, which static
// serving can't guarantee for an extensionless path. Apple does not follow
// redirects for this file, so it must answer 200 directly on the apex host
// (mail links build against apex via APP_BASE_URL in lib/mail/i18n.ts).
//
// Real appID as of #1283 (team 8C8WCW67J9, bundle no.tornygolf.app).
// `components` deliberately stays at catch-all `/*`: the deeplink vocabulary
// (lib/notifications/deeplink.ts) spans /games, /admin, /login, /signup, /cup
// and more — narrowing it buys nothing and adds a maintenance trap.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['8C8WCW67J9.no.tornygolf.app'],
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
