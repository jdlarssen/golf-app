import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { sendMissingScoreReminder } from '@/lib/notifications/missingScoreReminder';
import type { HoleSegment } from '@/lib/scoring';
import type { GameMode } from '@/lib/scoring/modes/types';
import { parseStartType } from './startType';
import { findScoreGaps, missingScoreTargets } from './organizerDesk';

// The organiser's «Påminn» on a skipped-hole row (#2268, the owner's choice B):
// «du mangler slag på hull H» to the player (or the teammates on one shared
// card) in that row.
//
// **Authz lives with the caller**, as in `remindUnsubmitted.ts`: this module
// reads and writes with the service-role client and never asks who is calling.
// Every caller must gate first (`requireAdmin` in the desk's server action).
//
// No idempotency guard, on purpose: the owner's choice #1891 lets the organiser
// remind again, and this reminder follows the same rule. It never touches
// `game_players.deliver_reminder_sent_at`, the delivery-reminder sweep's
// one-shot guard (#2200).

const LOG_PREFIX = 'remindMissingScore';

type GameRow = {
  id: string;
  name: string;
  status: string;
  game_mode: GameMode;
  hole_segment: HoleSegment;
  start_type: string;
};

type PlayerRow = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  submitted_at: string | null;
  withdrawn_at: string | null;
  users: {
    email: string | null;
    name: string | null;
    locale: string | null;
    is_guest: boolean;
  } | null;
};

export type MissingScoreReminderResult =
  | { ok: true; reminded: number }
  | { ok: false; reason: 'not_found' | 'not_active' | 'no_gap' };

/**
 * Send the reminder for the row holding `pressedUserIds`. The gaps are
 * recomputed from the scores now, so a row that went away since the page was
 * rendered (the hole got a score, the card was delivered) sends nothing and
 * returns `no_gap`.
 *
 * `reminded` is the number of targets the database holds a reminder row for
 * afterwards, counted back from `notifications` (a write that silently stored
 * nothing must not read as success); a shortfall is logged.
 */
export async function sendMissingScoreReminders(
  gameId: string,
  pressedUserIds: readonly string[],
): Promise<MissingScoreReminderResult> {
  const admin = getAdminClient();
  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, name, status, game_mode, hole_segment, start_type')
    .eq('id', gameId)
    .maybeSingle<GameRow>();
  if (gameError) throw gameError;
  if (!game) return { ok: false, reason: 'not_found' };
  if (game.status !== 'active') return { ok: false, reason: 'not_active' };

  const [playersRes, scoresRes] = await Promise.all([
    admin
      .from('game_players')
      .select(
        'user_id, team_number, flight_number, submitted_at, withdrawn_at, users!game_players_user_id_fkey(email, name, locale, is_guest)',
      )
      .eq('game_id', gameId)
      .returns<PlayerRow[]>(),
    selectAllRowsResult(
      (from, to) =>
        admin
          .from('scores')
          .select('user_id, hole_number')
          .eq('game_id', gameId)
          .not('strokes', 'is', null)
          .order('id')
          .range(from, to)
          .returns<{ user_id: string; hole_number: number }[]>(),
      'remindMissingScore scores',
    ),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (scoresRes.error) throw scoresRes.error;
  const players = playersRes.data ?? [];

  const gaps = findScoreGaps({
    players,
    scores: scoresRes.data ?? [],
    mode: game.game_mode,
    holeSegment: game.hole_segment,
    startType: parseStartType(game.start_type),
  });
  const target = missingScoreTargets(
    gaps,
    players.map((p) => ({ user_id: p.user_id, is_guest: p.users?.is_guest ?? false })),
    pressedUserIds,
  );
  if (!target) return { ok: false, reason: 'no_gap' };

  // A margin for clock skew between this server and the database; counting
  // distinct recipients keeps a press a moment earlier from counting twice.
  const since = new Date(Date.now() - 30_000).toISOString();
  const byId = new Map(players.map((p) => [p.user_id, p]));
  // Best-effort per player, as the delivery reminder: one dead address must
  // not stop the rest. `sendMissingScoreReminder` never throws.
  await Promise.allSettled(
    target.userIds.map((userId) => {
      const p = byId.get(userId);
      return sendMissingScoreReminder({
        player: {
          userId,
          email: p?.users?.email ?? null,
          name: p?.users?.name ?? null,
          locale: p?.users?.locale ?? null,
        },
        game: { id: game.id, name: game.name },
        holes: target.holes,
        logPrefix: LOG_PREFIX,
      });
    }),
  );

  // Count the rows back: `notify` only logs an insert that failed (the CHECK
  // refusing an unknown kind, say), so a 0 here is the failure made visible.
  const { data: stored, error: countError } = await admin
    .from('notifications')
    .select('user_id')
    .eq('kind', 'missing_score_reminder')
    .eq('payload->>game_id', game.id)
    .in('user_id', target.userIds)
    .gte('created_at', since);
  const reminded = countError ? 0 : new Set((stored ?? []).map((r) => r.user_id)).size;
  if (countError || reminded < target.userIds.length) {
    console.error(
      `[${LOG_PREFIX}] stored ${reminded}/${target.userIds.length} missing_score_reminder rows`,
      countError,
    );
  }
  return { ok: true, reminded };
}
