import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { computeScoreDifferential } from '@/lib/scoring/scoreDifferential';
import { getRatingForGender } from '@/lib/games/teeRating';

/**
 * Beregner og lagrer WHS score-differensial for hvert kvalifisert spillerpar i
 * et (nettopp) avsluttet spill (#941).
 *
 * Differensialen fryses én gang ved avslutning og endres aldri retroaktivt —
 * selv om baneens slope/CR justeres i ettertid. Verdien leses fra `game_players`
 * av historikk-siden for å vise trending-grafen uten å gjenkjøre formelen.
 *
 * **Service-role-bypass:** kjøres med admin-klienten (ingen JWT-sub), som passerer
 * guard_game_players_score_differential-triggeren uten friksjon. Innloggede
 * spillere er blokkert av triggeren — de kan aldri PATCH-e kolonnen direkte.
 *
 * **Best-effort:** all feil svelges og logges (`Promise.allSettled` + console.error),
 * akkurat som persistResultSummaries og Resend-helperne — en feil her skal ALDRI
 * blokkere at spillet avsluttes. Returnerer antall spillerrader som faktisk fikk
 * en differensial skrevet.
 *
 * **Affected-rows-sjekk:** hvert UPDATE chains `.select('user_id')` og feiler
 * eksplisitt på 0 returnerte rader (0-rad-skriv = feil, ikke suksess, per AGENTS.md
 * trap #2). Feilmeldingen logges men kaster ikke ut av best-effort-løkken.
 *
 * Brukes av alle tre ende-spill-actionene:
 *   - `endGame`                (`app/[locale]/admin/games/[id]/actions.ts`)
 *   - `endGameWithSideWinners` (`app/[locale]/admin/games/[id]/avslutt/actions.ts`)
 *   - `endGameMarkingWithdrawals` delegerer til `endGame`, og dekkes dermed.
 */
export async function persistScoreDifferentials(gameId: string): Promise<number> {
  try {
    const admin = getAdminClient();

    // Fetch game metadata, players, and scores in parallel.
    const [gameRes, playersRes, scoresRes] = await Promise.all([
      admin
        .from('games')
        .select('course_id, tee_box_id')
        .eq('id', gameId)
        .single(),
      admin
        .from('game_players')
        .select('user_id, tee_gender, course_handicap')
        .eq('game_id', gameId),
      admin
        .from('scores')
        .select('user_id, hole_number, strokes')
        .eq('game_id', gameId),
    ]);

    if (gameRes.error) {
      console.error('[persistScoreDifferentials] game fetch failed', {
        gameId,
        error: gameRes.error,
      });
      return 0;
    }

    const game = gameRes.data;
    if (!game.course_id || !game.tee_box_id) {
      console.error('[persistScoreDifferentials] missing course_id or tee_box_id', {
        gameId,
      });
      return 0;
    }

    if (playersRes.error) {
      console.error('[persistScoreDifferentials] players fetch failed', {
        gameId,
        error: playersRes.error,
      });
      return 0;
    }

    if (scoresRes.error) {
      console.error('[persistScoreDifferentials] scores fetch failed', {
        gameId,
        error: scoresRes.error,
      });
      return 0;
    }

    // Fetch course holes and tee box in parallel now that we have the IDs.
    const [holesRes, teeRes] = await Promise.all([
      admin
        .from('course_holes')
        .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
        .eq('course_id', game.course_id),
      admin
        .from('tee_boxes')
        .select(
          'slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors',
        )
        .eq('id', game.tee_box_id)
        .single(),
    ]);

    if (holesRes.error) {
      console.error('[persistScoreDifferentials] course_holes fetch failed', {
        gameId,
        courseId: game.course_id,
        error: holesRes.error,
      });
      return 0;
    }

    if (teeRes.error) {
      console.error('[persistScoreDifferentials] tee_box fetch failed', {
        gameId,
        teeBoxId: game.tee_box_id,
        error: teeRes.error,
      });
      return 0;
    }

    const tee = teeRes.data;
    const holes = holesRes.data ?? [];
    const players = playersRes.data ?? [];
    const scores = scoresRes.data ?? [];

    // Build a per-user score lookup: user_id → hole_number → strokes.
    const scoresByUser = new Map<string, Map<number, number | null>>();
    for (const s of scores) {
      let byHole = scoresByUser.get(s.user_id);
      if (!byHole) {
        byHole = new Map();
        scoresByUser.set(s.user_id, byHole);
      }
      byHole.set(s.hole_number, s.strokes);
    }

    // Hole lookup: hole_number → row.
    const holeByNumber = new Map(holes.map((h) => [h.hole_number, h]));

    // Compute and write a differential per player. Best-effort via Promise.allSettled.
    // Each task resolves to true if a row was written, false if skipped (null differential
    // or missing data), and rejects on a DB error.
    const writes = await Promise.allSettled(
      players.map(async (player): Promise<boolean> => {
        const gender = player.tee_gender ?? 'mens';
        const rating = getRatingForGender(tee, gender);
        if (!rating) {
          // Tee box has no ratings for this gender — skip silently.
          return false;
        }

        // Assemble the 18-hole array expected by computeScoreDifferential.
        const playerScores = scoresByUser.get(player.user_id);
        const differentialHoles: Array<{
          strokes: number | null;
          par: number;
          strokeIndex: number;
        } | null> = Array.from({ length: 18 }, (_, i) => {
          const holeNumber = i + 1;
          const hole = holeByNumber.get(holeNumber);
          if (!hole) return null;

          const par =
            gender === 'ladies'
              ? hole.par_ladies
              : gender === 'juniors'
                ? hole.par_juniors
                : hole.par_mens;
          if (par === null || par === undefined) return null;

          return {
            strokes: playerScores?.get(holeNumber) ?? null,
            par,
            strokeIndex: hole.stroke_index,
          };
        });

        // If any hole has no metadata, the course setup is incomplete — skip.
        if (differentialHoles.some((h) => h === null)) {
          return false;
        }

        const differential = computeScoreDifferential({
          holes: differentialHoles as {
            strokes: number | null;
            par: number;
            strokeIndex: number;
          }[],
          courseHandicap: player.course_handicap,
          slope: rating.slope,
          courseRating: rating.courseRating,
        });

        if (differential === null) {
          // Round doesn't qualify (< 18 scored holes or missing metadata).
          return false;
        }

        // Write the frozen differential. Chain .select() to detect 0-row writes
        // (trap #2: PostgREST returns error==null even on 0-row updates).
        const result = await admin
          .from('game_players')
          .update({ score_differential: differential })
          .eq('game_id', gameId)
          .eq('user_id', player.user_id)
          .select('user_id');

        if (result.error) {
          throw result.error;
        }
        if (!result.data || result.data.length === 0) {
          throw new Error(
            `persistScoreDifferentials: 0-row write for user ${player.user_id} in game ${gameId}`,
          );
        }

        return true;
      }),
    );

    let written = 0;
    for (const w of writes) {
      if (w.status === 'fulfilled' && w.value === true) {
        written += 1;
      } else if (w.status === 'rejected') {
        console.error('[persistScoreDifferentials] row write failed', {
          gameId,
          reason: w.reason,
        });
      }
    }

    return written;
  } catch (err) {
    console.error('[persistScoreDifferentials] failed', { gameId, err });
    return 0;
  }
}
