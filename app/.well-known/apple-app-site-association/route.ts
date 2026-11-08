import { NextResponse } from 'next/server';
import { APP_LINK_PATH_PREFIXES } from '@/lib/appLinks/appLinkPaths';

// iOS Universal Links — Apple App Site Association (#1277, part of #1276).
//
// Served as a Route Handler (not a public/ static file): the file is
// extensionless AND must carry Content-Type: application/json, which static
// serving can't guarantee for an extensionless path. Apple does not follow
// redirects for this file, so it must answer 200 directly on the apex host
// (mail links build against apex via APP_BASE_URL in lib/mail/i18n.ts).
//
// Real appID as of #1283 (team 8C8WCW67J9, bundle no.tornygolf.app).
//
// #2627, #2748: ONLY the links the app has a screen for open it. The app cannot
// carry a web session from a link, so every other link (login, sign-up pages,
// spectate, the pages the app's own buttons open) must keep opening Safari,
// where the session lives. The store variant claims `applinks:tornygolf.no` and
// `applinks:www.tornygolf.no` (native/app/app.config.ts); this file is what
// limits those claims to APP_LINK_PATH_PREFIXES, in every locale prefix the site
// serves, on both hosts. AASA applies to every installed build: a build older
// than 1.2.0 (12) reads only the friend link and opens on Home for the others.
// The old Capacitor shell claimed the domain with `/*`; a shell still installed
// now opens only these links.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['8C8WCW67J9.no.tornygolf.app'],
        components: APP_LINK_PATH_PREFIXES.map((prefix) => ({ '/': `${prefix}*` })),
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
