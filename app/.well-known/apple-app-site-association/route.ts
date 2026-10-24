import { NextResponse } from 'next/server';
import { FRIEND_LINK_PATH_PREFIXES } from '@/lib/friends/friendLinkPath';

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
// #2627: ONLY the friend link opens the app. The app cannot carry a web
// session from a link, so every other link (login, invitations, sign-up,
// spectate) must keep opening Safari, where the session lives. The store
// variant claims `applinks:tornygolf.no` (native/app/app.config.ts); this
// file is what limits that claim to `/venner/legg-til/*`, in every locale
// prefix the site serves (FRIEND_LINK_PATH_PREFIXES, checked against the
// locale routing in lib/friends/friendLinkPath.test.ts). The old Capacitor shell claimed the domain with
// `/*`; a shell still installed now opens only the friend link.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['8C8WCW67J9.no.tornygolf.app'],
        components: FRIEND_LINK_PATH_PREFIXES.map((prefix) => ({ '/': `${prefix}*` })),
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
