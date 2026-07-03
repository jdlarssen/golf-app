// Statisk seed-data for prøvespill-demoen (#1042). Ren datamodul, ingen I/O,
// ingen React, ingen Supabase/Dexie — trygg å importere fra både klient-
// komponenten og unit-testen. Demoen kjører 100 % i nettleseren: motstanderne
// har ferdigfylte scorer, «Deg» starter tomt og fylles inn av besøkeren, og
// `computeLeaderboard` regner tavla live fra den sammensatte konteksten.

import type {
  ScoringContext,
  ScoringGender,
  ScoringHole,
  ScoringHoleScore,
  ScoringPlayer,
} from '@/lib/scoring/modes/types';

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
  { number: 2, par: 3, strokeIndex: 15 },
  { number: 3, par: 5, strokeIndex: 1 },
];

/**
 * De fire deltakerne. «Deg» først (highlightet i tavla), så tre motstandere
 * med realistiske banehandicap. Rekkefølgen her styrer ikke ranking —
 * `computeLeaderboard` sorterer på stableford-poeng.
 */
export const DEMO_PLAYERS: DemoPlayer[] = [
  { userId: DEMO_YOU_ID, name: 'Deg', nickname: null, courseHandicap: 16, teeGender: 'mens', isYou: true },
  { userId: 'ida', name: 'Ida', nickname: null, courseHandicap: 10, teeGender: 'mens', isYou: false },
  { userId: 'ola', name: 'Ola', nickname: null, courseHandicap: 22, teeGender: 'mens', isYou: false },
  { userId: 'kari', name: 'Kari', nickname: null, courseHandicap: 8, teeGender: 'mens', isYou: false },
];

/**
 * Motstandernes ferdigfylte gross per hull. Gir en tett, troverdig tavle
 * (Kari leder, Ida i midten, Ola bak) som «Deg» kan klatre forbi ved godt
 * spill — hele poenget med «se tavla flytte seg».
 */
const OPPONENT_GROSS: Record<string, Record<number, number>> = {
  ida: { 1: 5, 2: 4, 3: 6 },
  ola: { 1: 6, 2: 5, 3: 8 },
  kari: { 1: 4, 2: 4, 3: 6 },
};

/** Besøkerens innmatede gross per hull-nummer (uspilt = udefinert). */
export type DemoYouScores = Partial<Record<number, number>>;

/**
 * Bygger en `ScoringContext` fra motstandernes faste scorer + besøkerens
 * innmatede scorer. Uspilte «Deg»-hull utelates (ikke `gross: null`) slik at
 * `holesPlayed` reflekterer faktisk antall tastede hull. Solo stableford,
 * standard poengtabell.
 */
export function buildDemoContext(youScores: DemoYouScores): ScoringContext {
  const scores: ScoringHoleScore[] = [];

  for (const player of DEMO_PLAYERS) {
    if (player.isYou) continue;
    const byHole = OPPONENT_GROSS[player.userId];
    for (const hole of DEMO_HOLES) {
      scores.push({ userId: player.userId, holeNumber: hole.number, gross: byHole[hole.number] });
    }
  }

  for (const hole of DEMO_HOLES) {
    const gross = youScores[hole.number];
    if (gross != null) {
      scores.push({ userId: DEMO_YOU_ID, holeNumber: hole.number, gross });
    }
  }

  return {
    game: {
      id: DEMO_GAME_ID,
      game_mode: 'stableford',
      mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    },
    players: DEMO_PLAYERS.map(
      (p): ScoringPlayer => ({
        userId: p.userId,
        teamNumber: null,
        flightNumber: null,
        courseHandicap: p.courseHandicap,
        teeGender: p.teeGender,
      }),
    ),
    holes: DEMO_HOLES,
    scores,
  };
}
