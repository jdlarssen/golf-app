import { NextResponse } from 'next/server';
import { captureServerIdentity } from '@/lib/serverIdentity/capture';

/**
 * Dev/CI-only identity endpoint (#1299, level 2 of #1259). Playwright's
 * `reuseExistingServer` happily reuses ANY server listening on the port —
 * another branch's, another worktree's — and a stale server answers wrong on
 * routes that provably exist in the working tree, which reads as a real
 * regression. `e2e/global-setup.ts` probes this route and stops the run instead.
 *
 * Not authenticated, and it does not need to be: `api/` is outside the proxy
 * matcher entirely (see `proxy.ts` `config.matcher`), and the payload — cwd,
 * version, commit, boot time — is only ever served locally or on CI, because
 * the VERCEL gate below makes the route a 404 in production. Deliberately
 * gated on VERCEL and not NODE_ENV: CI runs a production build
 * (`next build && next start`, playwright.config.ts) and the route must live
 * there.
 *
 * No `export const dynamic = 'force-dynamic'` — it is incompatible with
 * `cacheComponents` (next.config.ts) and redundant, since route handlers are
 * dynamic by default under that flag (#538 removed 12 of them).
 */
export async function GET() {
  if (process.env.VERCEL) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(captureServerIdentity(), {
    headers: { 'cache-control': 'no-store' },
  });
}
