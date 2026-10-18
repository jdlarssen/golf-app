import { NextResponse } from 'next/server';
import { getGameBySpectateToken } from '@/lib/games/spectate';
import { getAdminClient } from '@/lib/supabase/admin';

// The big screen's prize-giving step (#2298). The TV is anonymous, so it
// polls this every 2 s (`CeremonyPoller`) instead of listening on realtime.
//
// AUTH: the `spectate_token` in the path, the same authorisation as the TV
// page; the service role is only taken after it. Outside the proxy (`api/`
// is not in its matcher), so no session is involved.
//
// WIRE:
//   GET 200 { step: number | null }   null = off, or the game is not finished
//       404 { error: 'not_found' }    unknown token, or live-follow turned off
//       500 { error: 'read_failed' }
// Always `cache-control: no-store`: a cached answer would freeze the TV.

const NO_STORE = { 'cache-control': 'no-store' };

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: RouteContext) {
  const { token } = await ctx.params;

  const found = await getGameBySpectateToken(token);
  if (!found) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }

  const { data, error } = await getAdminClient()
    .from('games')
    .select('status, ceremony_step')
    .eq('id', found.id)
    .maybeSingle<{ status: string; ceremony_step: number | null }>();
  if (error) {
    console.error('[api/spectate/seremoni] read failed', { gameId: found.id, error });
    return NextResponse.json({ error: 'read_failed' }, { status: 500, headers: NO_STORE });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(
    { step: data.status === 'finished' ? data.ceremony_step : null },
    { headers: NO_STORE },
  );
}
