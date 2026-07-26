import { NextResponse } from 'next/server';
import { listPublicCourseSlugs } from '@/lib/courses/publicCourses';

/**
 * Internt manifest-endepunkt (#1329, del 2 av #1286): alle offentlig
 * kvalifiserte bane-slugs, for `proxy.ts`s `/baner/<slug>`-404-guard
 * (`lib/courses/slugGuard.ts`). Ikke lenket noe sted i UI-et — proxyen er
 * eneste kaller — men dataene i seg selv er ikke sensitive: de samme slugene
 * er allerede offentlige via `/baner` og `sitemap.xml`, så ingen auth-sjekk
 * er lagt til. `no-store` hindrer ethvert CDN-lag i å cache dette — det ENE
 * som skal cache er guardens eget minne-manifest.
 */
export async function GET() {
  const slugs = await listPublicCourseSlugs();
  return NextResponse.json(
    { slugs },
    { headers: { 'cache-control': 'no-store' } },
  );
}
