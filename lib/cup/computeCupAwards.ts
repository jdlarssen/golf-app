// Cupens to seremonikåringer på resultatsiden (#1508). Rene funksjoner over ÉN
// snapshot — zero IO, ingen datoer.
//
//   - MVP: flest innsamlede poeng. GJENBRUKER radene fra
//     computeCupPlayerPoints (#1497) og regner aldri poeng på nytt — Ryder
//     Cup-full-kreditt og vektede poeng er allerede bakt inn der.
//   - «Dro ned mest»: dårligst prestasjon mot EGET banehandicap, målt som netto
//     mot par summert over hullene spilleren har personlig ført score på.
//
// Begge deler kåringen ved likhet, og begge returnerer null når det ikke finnes
// noe å kåre (eierbeslutninger, kontrakt #1508).

import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { preferredName, type CupPlayerPointsResult } from './computeCupPlayerPoints';
import type { CupRoster } from './getCupSnapshot';

/**
 * Spillemodi der hver spiller fører sin EGEN ball, og prestasjon derfor kan
 * attribueres til et menneske. Foursomes-familien (foursomes/greensome/chapman/
 * gruesome) fører LAGball på kapteinens score-rad og kan aldri si noe om den
 * enkelte — den holdes utenfor kåringen.
 *
 * Ett hjem for regelen: getCupSnapshot filtrerer performance-inputen på dette
 * settet, aggregatoren under stoler på at filtreringen er gjort.
 */
export const PERSONALLY_SCORED_CUP_GAME_MODES = [
  'singles_matchplay',
  'fourball_matchplay',
  'best_ball',
] as const;

/**
 * Minste antall personlig førte hull for å kunne kåres til «dro ned mest»
 * (eierbeslutning #1508). Halvparten av en runde — nok til at kåringen treffer
 * en faktisk prestasjon og ikke et par uheldige hull.
 */
export const MIN_HOLES_FOR_UNDERPERFORMER = 9;

/**
 * Ett personlig ført spill, klart for prestasjonsmåling. Bygges i
 * getCupSnapshot: `holes` er allerede segment-filtrert (front9/back9/full), og
 * bare HOST-spill kommer med — en avledet match (#1441) leser host-ens scores
 * og ville ellers telt det samme scoresettet to ganger.
 */
export type CupPerformanceGame = {
  gameId: string;
  holes: Array<{ number: number; par: number; strokeIndex: number }>;
  /** Fullt banehandicap, IKKE allowance-justert — se `computeCupUnderperformer`. */
  players: Array<{ userId: string; courseHandicap: number }>;
  scores: Array<{ userId: string; holeNumber: number; strokes: number | null }>;
};

/** Delt kåring ved likhet: `names` har flere innslag når flere deler toppen. */
export type CupMvpAward = {
  names: string[];
  points: number;
};

export type CupUnderperformerAward = {
  names: string[];
  /** Netto slag over par, summert. Alltid > 0 — ellers er kåringen null. */
  overPar: number;
};

/** Navn asc med norsk collator — deterministisk rekkefølge i delte kåringer. */
function byName(a: string, b: string): number {
  return a.localeCompare(b, 'nb');
}

/**
 * Cupens MVP: spilleren(e) med flest innsamlede poeng på tvers av BEGGE lag.
 * `null` når toppsummen er 0 — en tvangsavsluttet cup uten ferdige kamper har
 * ingen MVP å kåre.
 */
export function computeCupMvp(playerPoints: CupPlayerPointsResult): CupMvpAward | null {
  const rows = [...playerPoints.team1, ...playerPoints.team2];
  if (rows.length === 0) return null;

  const top = Math.max(...rows.map((r) => r.points));
  if (top <= 0) return null;

  return {
    names: rows
      .filter((r) => r.points === top)
      .map((r) => r.displayName)
      .sort(byName),
    points: top,
  };
}

/**
 * «Dro ned mest»: spilleren(e) som presterte dårligst mot sitt EGET banehandicap.
 *
 * Per personlig ført hull: `netto − par`, der `netto = brutto −
 * strokesForHole(course_handicap, SI)`. Summen over alle slike hull i cupen er
 * spillerens diff; høyest diff vinner.
 *
 * Bevisst FULLT `course_handicap`, ikke det allowance-justerte: allowance er en
 * rettferdighetsmekanisme i matchplay, mens dette måler spilleren mot sitt eget
 * handicap.
 *
 * `null` når ingen har ført nok hull, eller når toppdiffen er ≤ 0 — spilte alle
 * til eller bedre enn handicapet sitt, har humor-kåringen ingen målskive og
 * skal ikke vises.
 */
export function computeCupUnderperformer(input: {
  games: CupPerformanceGame[];
  roster: CupRoster;
  /**
   * Visningsnavnet for en spiller uten navn OG uten kallenavn. Påkrevd av
   * samme grunn som i `computeCupPlayerPoints` — biblioteket kjenner ingen
   * locale, teksten kommer oversatt fra kallstedet (#1527).
   */
  unknownLabel: string;
}): CupUnderperformerAward | null {
  const { games, roster, unknownLabel } = input;

  // Kun roster-spillere kåres. Navneregelen er den samme som i
  // poengregnskapet (kallenavn foran navn) — ett hjem, importert.
  const nameByUser = new Map<string, string>();
  for (const p of [...roster.team1, ...roster.team2]) {
    if (!nameByUser.has(p.userId)) nameByUser.set(p.userId, preferredName(p, unknownLabel));
  }

  const diffByUser = new Map<string, number>();
  const holesByUser = new Map<string, number>();

  for (const game of games) {
    const holeByNumber = new Map(game.holes.map((h) => [h.number, h]));
    const handicapByUser = new Map(game.players.map((p) => [p.userId, p.courseHandicap]));

    for (const score of game.scores) {
      // Plukket ball / ikke spilt hull teller verken i diffen eller i
      // hulltellingen — et uspilt hull er ingen prestasjon.
      if (score.strokes == null) continue;
      if (!nameByUser.has(score.userId)) continue;

      // Hull utenfor spillets segment (back9-spill med gjenliggende
      // front9-rader) og scores uten spiller-rad hoppes over — begge er
      // defensive: da mangler henholdsvis par/SI og banehandicapet.
      const hole = holeByNumber.get(score.holeNumber);
      if (!hole) continue;
      const courseHandicap = handicapByUser.get(score.userId);
      if (courseHandicap == null) continue;

      const net = score.strokes - strokesForHole(courseHandicap, hole.strokeIndex);
      diffByUser.set(score.userId, (diffByUser.get(score.userId) ?? 0) + (net - hole.par));
      holesByUser.set(score.userId, (holesByUser.get(score.userId) ?? 0) + 1);
    }
  }

  const qualified = Array.from(diffByUser.entries()).filter(
    ([userId]) => (holesByUser.get(userId) ?? 0) >= MIN_HOLES_FOR_UNDERPERFORMER,
  );
  if (qualified.length === 0) return null;

  const top = Math.max(...qualified.map(([, diff]) => diff));
  if (top <= 0) return null;

  return {
    names: qualified
      .filter(([, diff]) => diff === top)
      .map(([userId]) => nameByUser.get(userId)!)
      .sort(byName),
    overPar: top,
  };
}
