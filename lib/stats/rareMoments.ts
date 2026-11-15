/**
 * «Sjeldne slag» på Topplista (#2259, PR 4): hver hole-in-one, albatross og eagle i
 * sesongen. Ren, så telleregelen testes uten database; `getSeasonStrokes.ts` leser
 * radene.
 *
 * Regelen er én: hvert hull vurderes brutto mot spillerens kjønns-par med
 * `underParMoment` (hole-in-one går foran albatross og eagle). Spillene som teller er
 * de samme som for birdie-tellingen (`countsForBirdies`): scramble, foursomes og
 * avledede spill er ute, og det samme er gjester og spillere som har trukket seg.
 */
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import { osloParts } from '@/lib/format/teeOff';
import { underParMoment, toHoleScores } from '@/lib/stats/achievements';
import { effectiveDate, type DatedRound } from '@/lib/stats/effectiveDate';
import {
  countsForBirdies,
  type BirdieGame,
  type BirdiePlayer,
  type BirdieScore,
} from '@/lib/stats/seasonBirdies';
import type { RareMomentKind } from '@/lib/stats/achievementMarks';

export type MomentGame = BirdieGame & {
  courseName: string | null;
  /** Dagen runden ble spilt, `YYYY-MM-DD` på Oslo-kalender. `null` = udaterbar. */
  playedOn: string | null;
};

/** Ett sjeldent slag. `userId` blir aldri sendt ut av ruta. */
export type RareMoment = {
  kind: RareMomentKind;
  userId: string;
  hole: number;
  courseName: string | null;
  playedOn: string;
};

/** Dagen runden hører til, `YYYY-MM-DD` på Oslo-kalender, eller `null` når den er udaterbar. */
export function playedOnKey(round: DatedRound): string | null {
  const date = effectiveDate(round);
  if (!date) return null;
  const { year, month, day } = osloParts(date);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const RARE: ReadonlySet<string> = new Set<RareMomentKind>(['hole_in_one', 'albatross', 'eagle']);

export function tallyRareMoments(input: {
  games: readonly MomentGame[];
  players: readonly BirdiePlayer[];
  scores: readonly BirdieScore[];
  courseHolesByCourse: ReadonlyMap<string, ReadonlyMap<number, CourseHoleRow>>;
}): RareMoment[] {
  const counted = new Map(input.games.filter(countsForBirdies).map((game) => [game.id, game]));

  const scoresByPlayer = new Map<string, BirdieScore[]>();
  for (const score of input.scores) {
    const key = `${score.game_id}:${score.user_id}`;
    const list = scoresByPlayer.get(key);
    if (list) list.push(score);
    else scoresByPlayer.set(key, [score]);
  }

  const moments: RareMoment[] = [];
  for (const player of input.players) {
    const game = counted.get(player.gameId);
    if (!game || game.playedOn === null || player.withdrawn || player.isGuest) continue;
    const scores = scoresByPlayer.get(`${player.gameId}:${player.userId}`);
    if (!scores) continue;
    const courseHoles = game.courseId ? input.courseHolesByCourse.get(game.courseId) : undefined;
    for (const hole of toHoleScores(scores, courseHoles, player.teeGender)) {
      if (hole.strokes === null) continue;
      const kind = underParMoment(hole.strokes, hole.par);
      if (kind !== null && RARE.has(kind)) {
        moments.push({
          kind: kind as RareMomentKind,
          userId: player.userId,
          hole: hole.holeNumber,
          courseName: game.courseName,
          playedOn: game.playedOn,
        });
      }
    }
  }
  return moments;
}
