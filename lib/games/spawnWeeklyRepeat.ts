import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { findGuestIds } from '@/lib/games/createGuestPlayer';
import { notifyRosterInvites } from '@/lib/games/notifyRosterInvites';
import { expireGameCache } from '@/lib/games/expireGameCache';
import {
  buildWeeklyRepeatInsert,
  canRepeatWeekly,
  nextWeeklyTeeOff,
  type WeeklyRepeatPlayer,
  type WeeklyRepeatSource,
} from '@/lib/games/weeklyRepeat';

/**
 * #2460 «Gjenta hver uke»: create the next round when a round with the switch
 * on is finished. Called from the finish tail (`runFinishPipeline`), inside
 * its claim, so it runs for a web finish and for the sweep after an app finish
 * alike.
 *
 * Everything goes through the service role: the sweep has no user client, and
 * `repeated_from_game_id` is server-owned (`guard_games_repeated_from_game_id`,
 * 0240).
 *
 * ONCE PER ROUND. The claim makes the tail run once per finish, but
 * `reopenGame` clears it, so a round that is reopened and finished again runs
 * this a second time. The unique `repeated_from_game_id` is what holds: the
 * second insert gets 23505, which is «the next round is already there», not an
 * error.
 *
 * Never throws for a DB answer: every refusal and failure comes back as
 * `{ spawned: false, reason }` and is logged, so the caller's own try/catch
 * only has to cover the truly unexpected.
 */

export type SpawnWeeklyRepeatResult =
  | { spawned: true; gameId: string }
  | {
      spawned: false;
      reason:
        | 'read_failed'
        | 'not_found'
        | 'off'
        | 'not_finished'
        | 'not_standalone'
        | 'no_organiser'
        | 'no_scores'
        | 'no_tee_off'
        | 'exists'
        | 'insert_failed';
    };

type SourceRow = Omit<WeeklyRepeatSource, 'created_by'> & {
  created_by: string | null;
  status: string;
  repeat_weekly: boolean;
  league_round_id: string | null;
  source_game_id: string | null;
  courses: { name: string | null } | null;
};

const SOURCE_COLUMNS =
  'id, name, status, repeat_weekly, created_by, course_id, tee_box_id, hcp_allowance_pct, require_peer_approval, score_visibility, game_mode, mode_config, registration_mode, registration_type, let_friends_skip_gate, entry_fee_kr, payment_link, prizes, side_tournament_enabled, side_ld_count, side_ctp_count, side_ld_holes, side_ctp_holes, side_disabled_categories, start_type, group_id, tournament_id, tournament_match_label, league_round_id, source_game_id, hole_segment, scheduled_tee_off_at, registration_cap, signup_deadline, waitlist_enabled, courses(name)';

export async function spawnWeeklyRepeat(
  gameId: string,
  nowIso: string = new Date().toISOString(),
): Promise<SpawnWeeklyRepeatResult> {
  const admin = getAdminClient();

  const { data: source, error: sourceError } = await admin
    .from('games')
    .select(SOURCE_COLUMNS)
    .eq('id', gameId)
    .maybeSingle<SourceRow>();
  if (sourceError) {
    console.error('[spawnWeeklyRepeat] source read failed', { gameId, error: sourceError });
    return { spawned: false, reason: 'read_failed' };
  }
  if (!source) return { spawned: false, reason: 'not_found' };
  if (!source.repeat_weekly) return { spawned: false, reason: 'off' };
  if (source.status !== 'finished') return { spawned: false, reason: 'not_finished' };
  if (
    !canRepeatWeekly({
      tournamentId: source.tournament_id,
      leagueRoundId: source.league_round_id,
      sourceGameId: source.source_game_id,
      groupId: source.group_id,
      teeOffNow: false,
    })
  ) {
    return { spawned: false, reason: 'not_standalone' };
  }
  const organiserId = source.created_by;
  if (!organiserId) return { spawned: false, reason: 'no_organiser' };

  // Owner's rule (16.11): a round nobody played stops the series. One entered
  // stroke from anyone is enough to carry on.
  const { count, error: scoresError } = await admin
    .from('scores')
    .select('game_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .not('strokes', 'is', null);
  if (scoresError) {
    console.error('[spawnWeeklyRepeat] score count failed', { gameId, error: scoresError });
    return { spawned: false, reason: 'read_failed' };
  }
  if (!count) return { spawned: false, reason: 'no_scores' };

  const nextTeeOff = nextWeeklyTeeOff(source.scheduled_tee_off_at, nowIso);
  if (!nextTeeOff) return { spawned: false, reason: 'no_tee_off' };

  const { data: players, error: playersError } = await admin
    .from('game_players')
    .select('user_id, team_number, flight_number, tee_gender, withdrawn_at')
    .eq('game_id', gameId)
    .returns<WeeklyRepeatPlayer[]>();
  if (playersError) {
    console.error('[spawnWeeklyRepeat] roster read failed', { gameId, error: playersError });
    return { spawned: false, reason: 'read_failed' };
  }

  const roster = players ?? [];
  const guestIds = await findGuestIds(
    roster.filter((p) => p.withdrawn_at === null).map((p) => p.user_id),
  );
  const rows = buildWeeklyRepeatInsert(
    { ...source, created_by: organiserId },
    roster,
    nextTeeOff,
    source.courses?.name ?? null,
    { newGameId: crypto.randomUUID(), guestIds, nowIso },
  );

  const { error: gameError } = await admin.from('games').insert(rows.game).select('id').single();
  if (gameError) {
    if ((gameError as { code?: string }).code === '23505') {
      return { spawned: false, reason: 'exists' };
    }
    console.error('[spawnWeeklyRepeat] game insert failed', { gameId, error: gameError });
    return { spawned: false, reason: 'insert_failed' };
  }
  const newGameId = rows.game.id;

  if (rows.players.length > 0) {
    const { error: rosterError } = await admin.from('game_players').insert(rows.players);
    if (rosterError) {
      // AGENTS.md trap #5: no next round without its players. The service
      // role can always delete; 0 rows back means the orphan stayed.
      console.error('[spawnWeeklyRepeat] roster insert failed', {
        gameId,
        newGameId,
        error: rosterError,
      });
      const { data: rolledBack, error: rollbackError } = await admin
        .from('games')
        .delete()
        .eq('id', newGameId)
        .select('id');
      if (rollbackError || (rolledBack ?? []).length === 0) {
        console.error('[spawnWeeklyRepeat] rollback failed', {
          newGameId,
          error: rollbackError,
        });
      }
      return { spawned: false, reason: 'insert_failed' };
    }
  }

  // The invitation goes out as at publish (#2445): everyone on the roster but
  // the organiser and guests. Best-effort, as in createGameInternal.
  try {
    const notified = await notifyRosterInvites({ gameId: newGameId, inviterUserId: organiserId });
    if (!notified.ok) {
      console.error('[spawnWeeklyRepeat] roster invites failed', {
        newGameId,
        reason: notified.reason,
      });
    }
  } catch (error) {
    console.error('[spawnWeeklyRepeat] roster invites failed', { newGameId, error });
  }

  expireGameCache(newGameId);
  return { spawned: true, gameId: newGameId };
}
