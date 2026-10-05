// Statisk seed-data for prøvespill-demoen (#1042). Ren datamodul, ingen I/O,
// ingen React, ingen Supabase/Dexie — trygg å importere fra både klient-
// komponenten og unit-testen. Demoen kjører 100 % i nettleseren: motstanderne
// har ferdigfylte scorer, «Deg» starter tomt og fylles inn av besøkeren, og
// `computeLeaderboard` regner tavla live fra den sammensatte konteksten.

import {
  buildStablefordContext,
  type StablefordContextHoleRow,
  type StablefordContextPlayerRow,
  type StablefordContextScoreRow,
} from '@/lib/scoring/context/buildStablefordContext';
import type { GameModeConfig, ScoringContext, ScoringGender, ScoringHole } from '@/lib/scoring/modes/types';

/** Syntetisk spill-id — kolliderer aldri med en ekte UUID. */
export const DEMO_GAME_ID = 'demo';
/** Besøkerens egen spiller. */
export const DEMO_YOU_ID = 'you';

export interface DemoPlayer {
  userId: string;
  name: string;
  nickname: string | null;
  courseHandicap: number;
  teeGender: ScoringGender;
  /** True for besøkerens egen rad («Deg»). */
  isYou: boolean;
}

/**
 * 3-hulls demobane: par 4 / par 3 / par 5, representativ stroke-index-miks
 * (hardt / lett / hardest). Ingen `parByGender` — alle spillere bruker `par`.
 */
export const DEMO_HOLES: ScoringHole[] = [
  { number: 1, par: 4, strokeIndex: 5 },
  { number: 2, par: 3, strokeIndex: 13 },
  { number: 3, par: 5, strokeIndex: 1 },
];

/**
 * De tre deltakerne fra tegningen (#2281): «Deg» først (highlightet i tavla),
 * så to motspillere som har tastet før deg, så tavla har noe å vise.
 * Rekkefølgen her styrer ikke ranking — `computeLeaderboard` sorterer på
 * stableford-poeng.
 */
export const DEMO_PLAYERS: DemoPlayer[] = [
  { userId: DEMO_YOU_ID, name: 'Deg', nickname: null, courseHandicap: 16, teeGender: 'mens', isYou: true },
  { userId: 'marte', name: 'Marte', nickname: null, courseHandicap: 8, teeGender: 'mens', isYou: false },
  { userId: 'jonas', name: 'Jonas', nickname: null, courseHandicap: 10, teeGender: 'mens', isYou: false },
];

/**
 * Motspillernes faste gross per hull. Taster du 5 på hull 1, står du på 2.
 * plass, 1 poeng bak Marte; en netto eagle (2) på hull 2 tar deg opp til delt
 * ledelse — hele poenget med «se tavla flytte seg».
 */
const OPPONENT_GROSS: Record<string, Record<number, number>> = {
  marte: { 1: 4, 2: 2, 3: 6 },
  jonas: { 1: 6, 2: 3, 3: 7 },
};

/** Besøkerens innmatede gross per hull-nummer (uspilt = udefinert). */
export type DemoYouScores = Partial<Record<number, number>>;

export const DEMO_MODE_CONFIG: GameModeConfig = {
  kind: 'stableford',
  team_size: 1,
  points_table: 'standard',
};

/** Motspillerens faste slag på hullet, eller `null` (deg, eller ukjent hull). */
export function demoGrossFor(userId: string, holeNumber: number): number | null {
  return OPPONENT_GROSS[userId]?.[holeNumber] ?? null;
}

/**
 * Demoen som rå rader, i samme form som et ekte spill leser fra databasen, så
 * tavla (`buildDemoContext`) og stripa (`demoStanding`) leser de samme radene.
 * Motspillernes slag tas med bare for hull du har tastet (#2281): da har alle
 * spilt like mange hull, og «poeng bak» er sammenlignbart. Uspilte «Deg»-hull
 * utelates, så `holesPlayed` er antall tastede hull.
 */
export function demoRows(youScores: DemoYouScores): {
  players: StablefordContextPlayerRow[];
  holesRows: StablefordContextHoleRow[];
  scoresRows: StablefordContextScoreRow[];
} {
  const scoresRows: StablefordContextScoreRow[] = [];
  for (const hole of DEMO_HOLES) {
    const yours = youScores[hole.number];
    if (yours == null) continue;
    for (const player of DEMO_PLAYERS) {
      const strokes = player.isYou ? yours : demoGrossFor(player.userId, hole.number);
      scoresRows.push({ user_id: player.userId, hole_number: hole.number, strokes });
    }
  }

  return {
    players: DEMO_PLAYERS.map((p) => ({
      user_id: p.userId,
      team_number: 0,
      course_handicap: p.courseHandicap,
      tee_gender: p.teeGender,
      withdrawn_at: null,
      users: { name: p.name, nickname: p.nickname },
    })),
    holesRows: DEMO_HOLES.map((h) => ({
      hole_number: h.number,
      par_mens: h.par,
      par_ladies: h.par,
      par_juniors: h.par,
      stroke_index: h.strokeIndex,
    })),
    scoresRows,
  };
}

/** Solo stableford-konteksten tavla regnes fra, bygd over `demoRows`. */
export function buildDemoContext(youScores: DemoYouScores): ScoringContext {
  return buildStablefordContext({
    gameId: DEMO_GAME_ID,
    gameMode: 'stableford',
    modeConfig: DEMO_MODE_CONFIG,
    ...demoRows(youScores),
  });
}
