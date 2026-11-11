import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  countRoundAchievements,
  parForGender,
  selectNotableMoments,
  type HoleScore,
} from '@/lib/stats/achievements';
import { notify } from '@/lib/notifications/notify';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import type { GameMode, ScoringGender } from '@/lib/scoring/modes/types';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';

/**
 * Best-effort: fyrer ÉTT bundlet `achievement_unlocked`-varsel per spiller som
 * låste opp minst ett notabelt øyeblikk (hole-in-one/eagle/turkey/snowman) i et
 * nettopp avsluttet spill (#947). Birdie er aldri med (for vanlig) — det styres
 * av `selectNotableMoments`. Varselet går KUN til spilleren selv.
 *
 * Datagrunnlaget speiler «Mine tall»-aggregeringen (`computePlayerStats`,
 * nå i /profile/historikk), men for alle spillere i ÉTT spill: per-spiller `tee_gender` → kjønns-par per hull → rå slag →
 * `countRoundAchievements`. Lesingen bor i `readBragRound` (under), som
 * vennevarselet (#2800) deler. Trukne spillere (WD) hoppes over — runden deres
 * er ofte ufullstendig og de er ute av rankingen.
 *
 * **Service-role-bypass:** kjøres med admin-klienten, akkurat som `notify()` selv.
 *
 * **Best-effort:** all feil svelges og logges (`Promise.allSettled` + console.error),
 * som persistResultSummaries / persistScoreDifferentials / Resend-helperne — en
 * feil her skal ALDRI blokkere at spillet avsluttes. `notify()` er selv best-effort
 * (svelger insert-feil), så et enkelt mislykket varsel stanser ikke de andre.
 *
 * Returnerer antall spillere som faktisk fikk et varsel (for logging/testing).
 *
 * Brukes av begge ende-spill-actionene:
 *   - `endGame`                (`app/[locale]/admin/games/[id]/actions.ts`)
 *   - `endGameWithSideWinners` (`app/[locale]/admin/games/[id]/avslutt/actions.ts`)
 */
export async function notifyAchievementUnlocks(gameId: string): Promise<number> {
  try {
    const round = await readBragRound(gameId, 'notifyAchievementUnlocks');
    if (!round) return 0;

    const sends = await Promise.allSettled(
      round.players.map(async (player): Promise<boolean> => {
        const moments = selectNotableMoments(countRoundAchievements(player.holes));
        if (moments.length === 0) return false;

        await notify({
          userId: player.userId,
          kind: 'achievement_unlocked',
          payload: { game_id: gameId, game_name: round.game.name, moments },
        });
        return true;
      }),
    );

    let sent = 0;
    for (const r of sends) {
      if (r.status === 'fulfilled' && r.value === true) sent += 1;
      else if (r.status === 'rejected') {
        console.error('[notifyAchievementUnlocks] notify failed', { gameId, reason: r.reason });
      }
    }
    return sent;
  } catch (err) {
    console.error('[notifyAchievementUnlocks] failed', { gameId, err });
    return 0;
  }
}

/** A finished game as the two brag notices read it (#947, #2800). */
export type BragRound = {
  game: { name: string; course_id: string; game_mode: GameMode; league_round_id: string | null };
  /** Everyone on the roster, withdrawn players included. */
  rosterIds: string[];
  /** Per player still in the round: raw strokes against their tee's par, per hole. */
  players: Array<{ userId: string; holes: HoleScore[] }>;
};

/**
 * The one read behind both brag notices: `notifyAchievementUnlocks` (the
 * player's own) and `notifyFriendsOfAchievements` (#2800, friends or league).
 * Withdrawn players (WD) are left out of `players`: their round is often
 * incomplete and they are out of the ranking. A hole without a course row gets
 * par 0, which counts nothing.
 *
 * `null` when a read fails; the failure is logged under `logPrefix`, since
 * both callers are best-effort. Runs on the service role, like `notify()`.
 */
export async function readBragRound(gameId: string, logPrefix: string): Promise<BragRound | null> {
  const admin = getAdminClient();

  const [gameRes, playersRes, scoresRes] = await Promise.all([
    admin
      .from('games')
      .select('name, course_id, game_mode, league_round_id')
      .eq('id', gameId)
      .single<{
        name: string;
        course_id: string | null;
        game_mode: GameMode;
        league_round_id: string | null;
      }>(),
    admin
      .from('game_players')
      .select('user_id, tee_gender, withdrawn_at')
      .eq('game_id', gameId)
      .returns<
        { user_id: string; tee_gender: ScoringGender | null; withdrawn_at: string | null }[]
      >(),
    selectAllRowsResult(
      (from, to) =>
        admin
          .from('scores')
          .select('user_id, hole_number, strokes')
          .eq('game_id', gameId)
          .order('id')
          .range(from, to)
          .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>(),
      `${logPrefix} scores`,
    ),
  ]);

  if (gameRes.error) {
    console.error(`[${logPrefix}] game fetch failed`, { gameId, error: gameRes.error });
    return null;
  }
  const game = gameRes.data;
  if (!game.course_id) {
    console.error(`[${logPrefix}] missing course_id`, { gameId });
    return null;
  }
  if (playersRes.error) {
    console.error(`[${logPrefix}] players fetch failed`, { gameId, error: playersRes.error });
    return null;
  }
  if (scoresRes.error) {
    console.error(`[${logPrefix}] scores fetch failed`, { gameId, error: scoresRes.error });
    return null;
  }

  const holesRes = await admin
    .from('course_holes')
    .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
    .eq('course_id', game.course_id)
    .returns<CourseHoleRow[]>();

  if (holesRes.error) {
    console.error(`[${logPrefix}] course_holes fetch failed`, {
      gameId,
      courseId: game.course_id,
      error: holesRes.error,
    });
    return null;
  }

  const holeByNumber = new Map<number, CourseHoleRow>(
    (holesRes.data ?? []).map((h) => [h.hole_number, h]),
  );
  const scoresByUser = new Map<string, Array<{ hole_number: number; strokes: number | null }>>();
  for (const s of scoresRes.data ?? []) {
    const arr = scoresByUser.get(s.user_id) ?? [];
    arr.push(s);
    scoresByUser.set(s.user_id, arr);
  }

  const roster = playersRes.data ?? [];
  return {
    game: { ...game, course_id: game.course_id },
    rosterIds: roster.map((p) => p.user_id),
    players: roster
      .filter((p) => !p.withdrawn_at)
      .map((player) => ({
        userId: player.user_id,
        holes: (scoresByUser.get(player.user_id) ?? []).map((s) => {
          const holeRow = holeByNumber.get(s.hole_number);
          return {
            holeNumber: s.hole_number,
            strokes: s.strokes,
            par: holeRow ? parForGender(holeRow, player.tee_gender ?? null) : 0,
          };
        }),
      })),
  };
}
