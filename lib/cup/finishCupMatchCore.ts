import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { endGameCore } from '@/lib/games/endGameCore';

export type FinishCupMatchError =
  | 'not_found'
  | 'not_active'
  | 'no_players'
  | 'not_all_submitted'
  | 'not_all_approved'
  | 'finish_failed';

/** `alreadyFinished`: a new try after a timeout, and nothing was written (#1954 D2). */
export type FinishCupMatchResult =
  | { ok: true; alreadyFinished: boolean; gameIds: string[] }
  | { ok: false; error: FinishCupMatchError };

/**
 * Finishes one match in a cup (#2752), through the real pipeline, as the web's cup
 * finish does for each match. A derived match is finished through its host, and
 * `finishDerivedGames` in the pipeline takes the rest of the bundle along.
 *
 * Per-game notifications stay off: the cup's finish is its only reveal signal
 * (#1501). `allowMissing` never relaxes peer approval (#360). The caller has run
 * the gate; this writes with the service role, since a club admin is not the
 * games' creator.
 */
export async function finishCupMatchCore(
  admin: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    gameId: string;
    actor: { id: string; name: string };
    allowMissing: boolean;
  },
): Promise<FinishCupMatchResult> {
  const { tournamentId, gameId, actor, allowMissing } = args;

  // `gameId` comes from the client: the match must belong to this cup.
  const { data: tapped, error: tappedError } = await admin
    .from('games')
    .select('id, tournament_id, source_game_id, status')
    .eq('id', gameId)
    .maybeSingle();
  if (tappedError) {
    console.error('[cup] finishCupMatch read failed', { gameId, tappedError });
    return { ok: false, error: 'finish_failed' };
  }
  if (!tapped || tapped.tournament_id !== tournamentId) return { ok: false, error: 'not_found' };

  let hostId = tapped.id;
  let status = tapped.status;
  if (tapped.source_game_id) {
    const { data: host, error: hostError } = await admin
      .from('games')
      .select('id, tournament_id, status')
      .eq('id', tapped.source_game_id)
      .maybeSingle();
    if (hostError) {
      console.error('[cup] finishCupMatch host read failed', { gameId, hostError });
      return { ok: false, error: 'finish_failed' };
    }
    if (!host || host.tournament_id !== tournamentId) return { ok: false, error: 'not_found' };
    hostId = host.id;
    status = host.status;
  }

  if (status === 'finished') return { ok: true, alreadyFinished: true, gameIds: [hostId] };
  if (status !== 'active') return { ok: false, error: 'not_active' };

  const result = await endGameCore(admin, hostId, actor, {
    allowMissing,
    suppressPerGameNotifications: true,
    logContext: 'finishCupMatch',
  });
  if (result.ok) return { ok: true, alreadyFinished: false, gameIds: [hostId] };

  switch (result.reason) {
    case 'not_active': {
      // Someone got there first, between the read and the flip: the match is finished.
      const { data: after } = await admin.from('games').select('status').eq('id', hostId).maybeSingle();
      if (after?.status === 'finished') return { ok: true, alreadyFinished: true, gameIds: [hostId] };
      return { ok: false, error: 'not_active' };
    }
    case 'no_players':
    case 'not_all_submitted':
    case 'not_all_approved':
      return { ok: false, error: result.reason };
    default:
      console.error('[cup] finishCupMatch failed', { hostId, reason: result.reason });
      return { ok: false, error: 'finish_failed' };
  }
}
