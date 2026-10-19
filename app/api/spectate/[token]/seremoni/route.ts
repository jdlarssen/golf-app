import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// The big screen's prize-giving step (#2298). The TV is anonymous, so it
// polls this every 2 s (`CeremonyPoller`) instead of listening on realtime.
//
// AUTH: the `spectate_token` in the path, the same authorisation as the TV
// page; the service role is only taken after the token's shape is checked,
// and the query matches the token itself. Outside the proxy (`api/` is not in
// its matcher), so no session is involved.
//
// WIRE:
//   GET 200 { step: number | null, finished: boolean }
//            step null = off, or the game is no longer finished; finished
//            false = reopened, so the TV leaves «Ferdig spilt»
//       404 { error: 'not_found' }    unknown token, live-follow turned off,
//                                      or a draft/scheduled game (as /spectate)
//       500 { error: 'read_failed' }   a DB error — never a 404, so a blink
//                                      is not read as a revoked link
// Always `cache-control: no-store`: a cached answer would freeze the TV.

const NO_STORE = { 'cache-control': 'no-store' };

type RouteContext = { params: Promise<{ token: string }> };

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });

export async function GET(_request: Request, ctx: RouteContext) {
  const { token } = await ctx.params;
  if (!isUuid(token)) return notFound();

  const { data, error } = await getAdminClient()
    .from('games')
    .select('status, ceremony_step')
    .eq('spectate_token', token)
    .maybeSingle<{ status: string; ceremony_step: number | null }>();
  if (error) {
    console.error('[api/spectate/seremoni] read failed', { error });
    return NextResponse.json({ error: 'read_failed' }, { status: 500, headers: NO_STORE });
  }
  if (!data || data.status === 'draft' || data.status === 'scheduled') return notFound();

  const finished = data.status === 'finished';
  return NextResponse.json({ step: finished ? data.ceremony_step : null, finished }, { headers: NO_STORE });
}
