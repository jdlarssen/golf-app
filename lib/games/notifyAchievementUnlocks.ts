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
import type { ScoringGender } from '@/lib/scoring/modes/types';

/**
 * Best-effort: fyrer ÉTT bundlet `achievement_unlocked`-varsel per spiller som
 * låste opp minst ett notabelt øyeblikk (hole-in-one/eagle/turkey/snowman) i et
 * nettopp avsluttet spill (#947). Birdie er aldri med (for vanlig) — det styres
 * av `selectNotableMoments`. Varselet går KUN til spilleren selv.
 *
 * Datagrunnlaget speiler `getMyStats` (profil-siden), men for alle spillere i
 * ÉTT spill: per-spiller `tee_gender` → kjønns-par per hull → rå slag →
 * `countRoundAchievements`. Trukne spillere (WD) hoppes over — runden deres er
 * ofte ufullstendig og de er ute av rankingen.
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
    const admin = getAdminClient();

    const [gameRes, playersRes, scoresRes] = await Promise.all([
      admin
        .from('games')
        .select('name, course_id')
        .eq('id', gameId)
        .single<{ name: string; course_id: string | null }>(),
      admin
        .from('game_players')
        .select('user_id, tee_gender, withdrawn_at')
        .eq('game_id', gameId)
        .returns<
          { user_id: string; tee_gender: ScoringGender | null; withdrawn_at: string | null }[]
        >(),
      admin
        .from('scores')
        .select('user_id, hole_number, strokes')
        .eq('game_id', gameId)
        .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>(),
    ]);

    if (gameRes.error) {
      console.error('[notifyAchievementUnlocks] game fetch failed', { gameId, error: gameRes.error });
      return 0;
    }
    const game = gameRes.data;
    if (!game.course_id) {
      console.error('[notifyAchievementUnlocks] missing course_id', { gameId });
      return 0;
    }
    if (playersRes.error) {
      console.error('[notifyAchievementUnlocks] players fetch failed', { gameId, error: playersRes.error });
      return 0;
    }
    if (scoresRes.error) {
      console.error('[notifyAchievementUnlocks] scores fetch failed', { gameId, error: scoresRes.error });
      return 0;
    }

    const holesRes = await admin
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', game.course_id)
      .returns<CourseHoleRow[]>();

    if (holesRes.error) {
      console.error('[notifyAchievementUnlocks] course_holes fetch failed', {
        gameId,
        courseId: game.course_id,
        error: holesRes.error,
      });
      return 0;
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

    // WD-spillere er ute av rankingen → ingen bragd-varsel.
    const players = (playersRes.data ?? []).filter((p) => !p.withdrawn_at);

    const sends = await Promise.allSettled(
      players.map(async (player): Promise<boolean> => {
        const gender = player.tee_gender ?? null;
        const holes: HoleScore[] = (scoresByUser.get(player.user_id) ?? []).map((s) => {
          const holeRow = holeByNumber.get(s.hole_number);
          return {
            holeNumber: s.hole_number,
            strokes: s.strokes,
            par: holeRow ? parForGender(holeRow, gender) : 0,
          };
        });

        const moments = selectNotableMoments(countRoundAchievements(holes));
        if (moments.length === 0) return false;

        await notify({
          userId: player.user_id,
          kind: 'achievement_unlocked',
          payload: { game_id: gameId, game_name: game.name, moments },
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
