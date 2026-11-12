import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { isUuid } from '@/lib/url/isUuid';

/**
 * The shared body of `POST /api/liga/[id]/meld-pa` and `/meld-av` (#2839): a
 * club member signs up for, or leaves, a club league from the app. The write is
 * `join_club_league` / `leave_club_league` (0086, SECURITY DEFINER), the same
 * functions the web's server actions call, so the rules have one home: the SQL.
 *
 * AUTH: `authenticatedUserId` proves the token, and the RPC runs on the
 * caller-scoped client so `auth.uid()` inside the function is the caller. Never
 * the service role (it would make `auth.uid()` null), and the user id is never
 * read from the body or the path.
 *
 * `ok` codes are the ones that leave the caller in the wanted state; `refused`
 * codes are the function's other answers and come back as 409.
 */
export async function runLeagueSelfService(
  request: NextRequest,
  leagueId: string,
  rpc: 'join_club_league' | 'leave_club_league',
  codes: { ok: readonly string[]; refused: readonly string[] },
): Promise<NextResponse> {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(leagueId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');
    const { data, error } = await caller.rpc(rpc, { p_league_id: leagueId });
    if (error) {
      // The functions raise `league_not_found` for an id that is no league.
      if (error.message.includes('league_not_found')) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      throw error;
    }
    if (typeof data === 'string' && codes.ok.includes(data)) {
      // The standings table is built from league_players (as the web actions do).
      revalidatePath(`/liga/${leagueId}`);
      return NextResponse.json({ leagueId });
    }
    if (typeof data === 'string' && codes.refused.includes(data)) {
      return NextResponse.json({ error: data }, { status: 409 });
    }
    throw new Error(`${rpc} answered ${String(data)}`);
  } catch (err) {
    console.error(`[api/liga/[id]] ${rpc} failed`, err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
