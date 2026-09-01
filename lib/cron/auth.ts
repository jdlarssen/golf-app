import { NextResponse } from 'next/server';

/**
 * The one home for the cron routes' authorization rule (#1856, N6c).
 *
 * WHY IT WAS EXTRACTED. The Bearer check was inlined in
 * `app/api/cron/start-scheduled-games/route.ts` and
 * `app/api/cron/product-update-digest/route.ts` — the #502 review defended that
 * duplicate as "a line-for-line copy of the existing, tested route", which held
 * at two copies. The finish-pipeline sweep made it three, and AGENTS.md trap #4
 * ("a rule has one home") applies from the third copy on: this is the rule that
 * decides whether an unauthenticated caller can trigger a service-role sweep, so
 * a future hardening (say, a constant-time compare) must not have to be found in
 * three places to be complete.
 *
 * The two responses are deliberately different and both are load-bearing:
 *  - **500 + `CRON_SECRET not configured`** means the DEPLOYMENT is broken. It is
 *    logged, so the failure surfaces in the Vercel log trail rather than looking
 *    like an ordinary rejected caller.
 *  - **401 + `Unauthorized`** means the CALLER is wrong. Not logged: an exposed
 *    endpoint gets scanned, and logging every probe would bury the 500 above.
 *
 * Callers: pg_net sends the header from Postgres' Vault (`Authorization: Bearer
 * <cron_secret>`, migrations 0094/0146/0170) and Vercel Cron sends the same
 * header built from the project's `CRON_SECRET` env var. Same secret, two
 * transports, one comparison.
 *
 * @param request the incoming request — only its `authorization` header is read.
 * @param logPrefix the caller's own log prefix, WITHOUT brackets (e.g.
 *   `'cron/start-scheduled-games'`), so a misconfiguration names the route it
 *   broke.
 * @returns the response to return immediately, or `null` when the caller is
 *   authorized. Call sites read `const denied = requireCronAuth(...); if (denied)
 *   return denied;` — a forgotten `if` is a type error, not an open door.
 */
export function requireCronAuth(
  request: Request,
  logPrefix: string,
): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`[${logPrefix}] CRON_SECRET not set`);
    return new NextResponse('CRON_SECRET not configured', { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return null;
}
