import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { TablesUpdate } from '@/lib/database.types';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import { dueNotices, noticeRecipients, type LeagueRoundNoticeKind } from '@/lib/league/roundNotices';
import { notify } from './notify';

// The league round's two messages (#2638 Del 3): «Runde 3 i Vinterligaen er
// åpen» when the round opens, and the reminder 48 hours before it closes to
// whoever has not played it. The rules live in `lib/league/roundNotices.ts`;
// this file reads, claims and sends.
//
// Each message goes once per round. The claim is the same «win the row»
// update as `runStaleGameReminderForGame`: the stamp is set only where it is
// still null, and only the run that got the row back sends. Two runs at once
// therefore send nothing twice. A changed deadline clears the reminder's stamp
// in the database (0217), so an extended window gets a new reminder.
//
// In the app only: `notify` stores the varsel and pushes when the player is
// away. No mail (the contract).

type AdminClient = ReturnType<typeof getAdminClient>;

/** The round the sweep hands over, read by the route (with its league). */
export type LeagueRoundSweepRound = {
  id: string;
  league_id: string;
  label: string;
  opens_at: string;
  closes_at: string;
  opening_notice_sent_at: string | null;
  closing_reminder_sent_at: string | null;
  leagues: { name: string; is_simulator: boolean } | null;
  /** #2666: read for the opening message of a simulator league. */
  courses: { name: string | null } | null;
  tee_boxes: { name: string | null } | null;
};

const LOG_PREFIX = 'leagueRoundReminder';

const STAMP: Record<LeagueRoundNoticeKind, 'opening_notice_sent_at' | 'closing_reminder_sent_at'> = {
  league_round_open: 'opening_notice_sent_at',
  league_round_closing: 'closing_reminder_sent_at',
};

type FlightRow = { status: string; game_players: Array<{ user_id: string; withdrawn_at: string | null }> | null };

/**
 * The due messages for one round: read the league's players and the round's
 * flights, then per message claim the stamp and send to everyone who has not
 * played. The stamp is claimed also when nobody is left to tell, so the round
 * does not come back every hour.
 *
 * Throws on a failed read or claim, so the route can count it per round and
 * one round never costs the others their messages (same as the stale sweep).
 * The sends are best-effort: one failed `notify` is logged, the rest go.
 * `sent` counts the `notify` calls that did not throw.
 */
export async function runLeagueRoundNotices(
  admin: AdminClient,
  round: LeagueRoundSweepRound,
  now: number,
): Promise<{ sent: Record<LeagueRoundNoticeKind, number> }> {
  const sent: Record<LeagueRoundNoticeKind, number> = { league_round_open: 0, league_round_closing: 0 };
  const due = dueNotices(round, now);
  if (due.length === 0) return { sent };

  const [playersRes, flightsRes] = await Promise.all([
    admin
      .from('league_players')
      .select('user_id')
      .eq('league_id', round.league_id)
      .order('joined_at', { ascending: true })
      .returns<{ user_id: string }[]>(),
    admin
      .from('games')
      .select('status, game_players(user_id, withdrawn_at)')
      .eq('league_round_id', round.id)
      .returns<FlightRow[]>(),
  ]);
  if (playersRes.error) throw new Error(`${LOG_PREFIX} players: ${playersRes.error.message}`);
  if (flightsRes.error) throw new Error(`${LOG_PREFIX} flights: ${flightsRes.error.message}`);

  const recipients = noticeRecipients(
    (playersRes.data ?? []).map((p) => p.user_id),
    (flightsRes.data ?? []).map((f) => ({
      status: f.status,
      players: (f.game_players ?? []).map((gp) => ({ userId: gp.user_id, withdrawnAt: gp.withdrawn_at })),
    })),
  );
  const leagueName = round.leagues?.name;
  if (!leagueName) throw new Error(`${LOG_PREFIX} round ${round.id} came without its league`);
  const payload = {
    league_id: round.league_id,
    league_name: leagueName,
    round_id: round.id,
    round_label: round.label,
    closes_at: round.closes_at,
    // #2666: a simulator league's messages name the course and tee and link to
    // the start page; a regular league's payload is unchanged.
    ...(round.leagues?.is_simulator
      ? {
          is_simulator: true,
          ...(round.courses?.name ? { course_name: round.courses.name } : {}),
          ...(round.tee_boxes?.name ? { tee_name: round.tee_boxes.name } : {}),
        }
      : {}),
  };

  for (const kind of due) {
    const stamp = STAMP[kind];
    const at = new Date(now).toISOString();
    const patch: TablesUpdate<'league_rounds'> =
      kind === 'league_round_open' ? { opening_notice_sent_at: at } : { closing_reminder_sent_at: at };
    let claim = admin
      .from('league_rounds')
      .update(patch)
      .eq('id', round.id)
      .is(stamp, null);
    // The reminder names this deadline. Moved since the read (the stamp is
    // then cleared again), it is the next run's reminder to send.
    if (kind === 'league_round_closing') claim = claim.eq('closes_at', round.closes_at);
    try {
      expectAffected(await claim.select('id'), `${LOG_PREFIX} claim ${kind}`);
    } catch (err) {
      // Another run won the row, or the deadline moved: nothing to send.
      if (err instanceof NoRowsAffectedError) continue;
      throw err;
    }

    const results = await Promise.allSettled(
      recipients.map((userId) => notify({ userId, kind, payload })),
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[${LOG_PREFIX}] ${kind} to ${recipients[i]} failed`, { roundId: round.id, err: r.reason });
      } else {
        sent[kind] += 1;
      }
    });
  }
  return { sent };
}
