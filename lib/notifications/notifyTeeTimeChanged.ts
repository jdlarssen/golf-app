import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { findGuestIds } from '@/lib/games/createGuestPlayer';
import { expectedTeamSize } from '@/lib/games/teamScope';
import { teeTimeChanges, type TeeTimeRound } from '@/lib/games/flightTeeTimes';
import type { GameMode } from '@/lib/scoring/modes/types';
import { notify } from './notify';

// «Starttiden din er endret» (#2451): a player in a scheduled round whose own
// start time moved because the organiser changed the flights, the teams or the
// minutes between the flights. The pattern is `game_moved` (#2480): `notify`
// stores the varsel and pushes when the player is away, and an older unread
// one for the same game is marked read first. Never a mail.
//
// Each organiser path reads the round once before its write
// (`readTeeTimeSnapshot`) and hands that reading to `notifyTeeTimeChanged`
// after the write, which reads it again and lets `teeTimeChanges` (the pure
// rule) say whose time changed. An unchanged time never sends anything.
//
// **Authz lies with the caller**, as in `notifyGameMoved`: the module reads
// and sends with the admin client. `actorUserId` must be the real caller: the
// one who made the change is never told.

/** The round as the rule reads it, plus the name for the varsel. Scheduled only. */
export type TeeTimeSnapshot = TeeTimeRound & { name: string };

type GameRow = {
  name: string;
  status: string;
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
  scheduled_tee_off_at: string | null;
  tee_interval_minutes: number | null;
};

type RosterRow = {
  user_id: string;
  flight_number: number | null;
  team_number: number | null;
  withdrawn_at: string | null;
};

/**
 * The round and its roster as they stand, or `null` when the round is not
 * scheduled (a round in progress has nobody left to tee off) or a read failed.
 * Best-effort: logs and returns `null` instead of throwing, so the action that
 * asks always goes on.
 */
export async function readTeeTimeSnapshot(gameId: string): Promise<TeeTimeSnapshot | null> {
  try {
    const admin = getAdminClient();
    const [gameRes, rosterRes] = await Promise.all([
      admin
        .from('games')
        .select('name, status, game_mode, mode_config, scheduled_tee_off_at, tee_interval_minutes')
        .eq('id', gameId)
        .maybeSingle<GameRow>(),
      admin
        .from('game_players')
        .select('user_id, flight_number, team_number, withdrawn_at')
        .eq('game_id', gameId)
        .returns<RosterRow[]>(),
    ]);
    if (gameRes.error) throw gameRes.error;
    if (rosterRes.error) throw rosterRes.error;
    const game = gameRes.data;
    if (!game || game.status !== 'scheduled') return null;
    return {
      name: game.name,
      game_mode: game.game_mode,
      team_size: expectedTeamSize(game.mode_config),
      scheduled_tee_off_at: game.scheduled_tee_off_at,
      tee_interval_minutes: game.tee_interval_minutes,
      players: rosterRes.data ?? [],
    };
  } catch (err) {
    console.error('[notifyTeeTimeChanged] reading the round failed', { gameId, err });
    return null;
  }
}

/**
 * One `tee_time_changed` to each player whose own start time is different now
 * than in `before`: not the one who made the change, not guests, not withdrawn
 * players (`teeTimeChanges` leaves those out). Returns the players whose
 * `notify` call did not throw. `before` `null` (the round was not scheduled,
 * or its reading failed) sends nothing.
 *
 * Best-effort: logs every failure with `[notifyTeeTimeChanged]` and never
 * throws, so the change that called it always stands.
 */
export async function notifyTeeTimeChanged(params: {
  gameId: string;
  actorUserId: string;
  before: TeeTimeSnapshot | null;
}): Promise<{ notified: string[] }> {
  const { gameId, actorUserId, before } = params;
  if (!before) return { notified: [] };
  try {
    const after = await readTeeTimeSnapshot(gameId);
    if (!after) return { notified: [] };
    const changes = teeTimeChanges(before, after).filter((c) => c.userId !== actorUserId);
    if (changes.length === 0) return { notified: [] };
    const guestIds = await findGuestIds(changes.map((c) => c.userId));
    const told = changes.filter((c) => !guestIds.has(c.userId));
    if (told.length === 0) return { notified: [] };

    const admin = getAdminClient();
    const { error: readError } = await admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('kind', 'tee_time_changed')
      .eq('payload->>game_id', gameId)
      .in(
        'user_id',
        told.map((c) => c.userId),
      )
      .is('read_at', null);
    if (readError) {
      console.error('[notifyTeeTimeChanged] marking older changes read failed', {
        gameId,
        error: readError,
      });
    }

    const results = await Promise.allSettled(
      told.map((c) =>
        notify({
          userId: c.userId,
          kind: 'tee_time_changed',
          payload: { game_id: gameId, game_name: after.name, tee_off_at: c.teeOffAt },
        }),
      ),
    );
    const notified: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error('[notifyTeeTimeChanged] notify failed', {
          gameId,
          userId: told[i].userId,
          error: r.reason,
        });
        return;
      }
      notified.push(told[i].userId);
    });
    return { notified };
  } catch (err) {
    console.error('[notifyTeeTimeChanged] failed', { gameId, err });
    return { notified: [] };
  }
}
