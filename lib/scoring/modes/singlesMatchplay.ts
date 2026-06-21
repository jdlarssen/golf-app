// Singles matchplay-scoring (epic #45): 1v1 hull-for-hull W/L/T.
//
// Matchplay er fundamentalt ulikt poeng-baserte modi: ingen totaler, men
// hull-for-hull-sammenligning. Per hull regner vi netto per side
// (gross − extra strokes fra HCP-fordelingen). Laveste netto vinner hullet;
// lik netto = tied. Match-status = (antall hull side 1 vant) − (antall hull
// side 2 vant). Matchen er mat-em når |holesUp| > holesRemaining.
//
// Resultat-formater (golf-standard):
//   - 'AS'   — all square etter 18 hull (tied)
//   - 'Nup'  — N hull foran etter 18 hull spilt
//   - 'N&M'  — N hull foran med M hull igjen (mat-em før hull 18)

import { strokesForHole } from '../strokeAllocation';
import { parFor } from './parResolver';
import type {
  ScoringContext,
  SinglesMatchplayResult,
  MatchplayHoleRow,
  MatchplaySide,
  MatchplayMatchResult,
  MatchplayHoleResult,
} from './types';

/**
 * Empty-shell fallback for defensive returns når matchen mangler nøyaktig
 * to sider. Validatoren i `lib/games/gamePayload.ts` håndhever 2-sider-
 * regelen ved publish, men scoring-laget må fortsatt være trygt for
 * call-sites som leser draft-state eller halvferdige rader.
 */
function emptyShell(sides: [MatchplaySide, MatchplaySide]): SinglesMatchplayResult {
  return {
    kind: 'singles_matchplay',
    sides,
    holes: [],
    holesUp: 0,
    holesPlayed: 0,
    holesRemaining: 18,
    result: null,
  };
}

/**
 * Bygger en defensiv "tom" tuple når vi ikke har to gyldige sider å returnere.
 * Brukes kun i emptyShell-stien — kalles ikke når validatoren har gjort
 * jobben sin.
 */
function placeholderSides(): [MatchplaySide, MatchplaySide] {
  return [
    { sideNumber: 1, userId: '', courseHandicap: 0 },
    { sideNumber: 2, userId: '', courseHandicap: 0 },
  ];
}

/**
 * Avgjør match-resultatet basert på løpende status. Returnerer `null`
 * mens matchen er live (ikke 18 hull spilt og ikke mat-em).
 *
 * Regler (golf-standard):
 *  - Mat-em (decided before 18): `|holesUp| > holesRemaining` —
 *    matematisk umulig for tapende side å innhente.
 *    Format: `${marginUp}&${remainingAtDecision}` (f.eks. «3&2»).
 *  - Spilt ferdig 18 hull + holesUp != 0:
 *    Format: `${marginUp}up` (f.eks. «2up»).
 *  - Spilt ferdig 18 hull + holesUp === 0:
 *    Format: `'AS'` (all square).
 *  - Ellers (live midt i runden): `null`.
 *
 * OBS — lukk-ute etter alle 18 hull (#800): Denne funksjonen kan ikke
 * rekonstruere mat-em-punktet fra aggregerte verdier alene. `compute()` fangar
 * opp dette hull-for-hull og kaller `computeMatchResult` med verdiane frå da
 * matchen faktisk vart avgjort (ikkje frå dei endelege 18-hols-verdiane).
 * Kall med `holesPlayed < 18` er dermed primærbrukstilfellet for mat-em-banen;
 * holesPlayed=18-grenen returnerer alltid «Nup» eller «AS».
 */
export function computeMatchResult(
  holesUp: number,
  holesPlayed: number,
  holesRemaining: number,
): MatchplayMatchResult | null {
  const absUp = Math.abs(holesUp);

  // Mat-em: ledende side har flere hull foran enn det er igjen.
  // Kun relevant hvis matchen ikke allerede er ferdig spilt (holesPlayed < 18).
  if (holesPlayed < 18 && absUp > holesRemaining) {
    const winner: 'side1' | 'side2' = holesUp > 0 ? 'side1' : 'side2';
    return {
      winner,
      marginUp: absUp,
      decidedAtHole: holesPlayed,
      remainingAtDecision: holesRemaining,
      formatted: `${absUp}&${holesRemaining}`,
    };
  }

  // Ferdig spilt 18 hull.
  if (holesPlayed === 18) {
    if (holesUp === 0) {
      return {
        winner: 'tied',
        marginUp: 0,
        decidedAtHole: 18,
        remainingAtDecision: 0,
        formatted: 'AS',
      };
    }
    const winner: 'side1' | 'side2' = holesUp > 0 ? 'side1' : 'side2';
    return {
      winner,
      marginUp: absUp,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: `${absUp}up`,
    };
  }

  // Live: ikke avgjort ennå.
  return null;
}

/**
 * Per-hull-utfall i matchplay. Single source of truth for win/loss/tied-
 * klassifisering — brukt av både `compute()` (full leaderboard-pipeline)
 * og `computeMatchplayRunningStatus()` (scorekort-flate) slik at de to
 * ikke kan drifte fra hverandre når matchplay-reglene utvides
 * (concessions, four-ball, foursomes — issue #205).
 *
 *  - `'unplayed'` når én eller begge sider mangler netto
 *  - `'tied'` når begge har netto og er like
 *  - `'side1_wins'` / `'side2_wins'` for lavest netto
 */
export function classifyMatchplayHole(
  side1Net: number | null,
  side2Net: number | null,
): MatchplayHoleResult {
  if (side1Net === null || side2Net === null) return 'unplayed';
  if (side1Net < side2Net) return 'side1_wins';
  if (side2Net < side1Net) return 'side2_wins';
  return 'tied';
}

/**
 * Minimal input-shape for `computeMatchplayRunningStatus()`. Speiler kun de
 * feltene helperen trenger (number + strokeIndex). Konsumenter med rikere
 * hull-rader (course_holes) eller layout-input (LayoutBHoleInput med
 * snake_case) mapper ned ved kall.
 */
export interface MatchplayRunningHole {
  number: number;
  strokeIndex: number;
}

export interface MatchplayRunningSide {
  userId: string;
  courseHandicap: number;
}

/**
 * Løpende match-status: hull side1 har foran, hull spilt (= begge har gross),
 * og hull igjen (= 18 − holesPlayed). Identisk semantikk som tilsvarende
 * felter på `SinglesMatchplayResult`.
 */
export interface MatchplayRunningStatus {
  /** side1Wins − side2Wins. Positiv = side1 up, negativ = side2 up, 0 = AS. */
  holesUp: number;
  /** Antall hull der begge sider har gross (inklusiv tied). */
  holesPlayed: number;
  /** `max(0, 18 − holesPlayed)`. */
  holesRemaining: number;
}

/**
 * Beregner løpende matchplay-status uten å bygge full `ScoringContext` eller
 * `MatchplayHoleRow[]`. Tenkt for UI-flater som kun trenger «X up etter N
 * hull» (scorekort), ikke per-hull-detalj eller mat-em-formatering.
 *
 * Konsumenter:
 *  - `lib/games/scorecardLayout.ts:computeLayoutBTotals` (Layout B-footer)
 *  - `lib/scoring/modes/singlesMatchplay.ts:compute()` bruker IKKE denne
 *    direkte (den iterer for å bygge per-hull-rader) men deler
 *    `classifyMatchplayHole()` for å garantere samme regel-fortolkning.
 *
 * Format-strenger («1up», «AS», «3&2» i leaderboard vs «Du er X up etter N
 * hull» i scorekort) er konsumentens ansvar — denne helperen returnerer kun
 * numeriske totaler.
 */
export function computeMatchplayRunningStatus(
  holes: readonly MatchplayRunningHole[],
  side1: MatchplayRunningSide,
  side2: MatchplayRunningSide,
  scoresByUserHole: ReadonlyMap<string, number | null>,
): MatchplayRunningStatus {
  let side1Wins = 0;
  let side2Wins = 0;
  let holesPlayed = 0;

  for (const hole of holes) {
    const side1Gross = scoresByUserHole.get(`${side1.userId}#${hole.number}`) ?? null;
    const side2Gross = scoresByUserHole.get(`${side2.userId}#${hole.number}`) ?? null;
    const side1Net =
      side1Gross === null
        ? null
        : side1Gross - strokesForHole(side1.courseHandicap, hole.strokeIndex);
    const side2Net =
      side2Gross === null
        ? null
        : side2Gross - strokesForHole(side2.courseHandicap, hole.strokeIndex);

    const r = classifyMatchplayHole(side1Net, side2Net);
    if (r === 'side1_wins') {
      side1Wins += 1;
      holesPlayed += 1;
    } else if (r === 'side2_wins') {
      side2Wins += 1;
      holesPlayed += 1;
    } else if (r === 'tied') {
      holesPlayed += 1;
    }
  }

  return {
    holesUp: side1Wins - side2Wins,
    holesPlayed,
    holesRemaining: Math.max(0, 18 - holesPlayed),
  };
}

/**
 * Beregner singles matchplay-resultatet fra en ScoringContext.
 *
 * Forutsetninger:
 *  - Nøyaktig 2 spillere med `teamNumber === 1` og `teamNumber === 2`
 *    (én på hver side). Håndheves av validatoren i `lib/games/gamePayload.ts`.
 *  - Hvis disse forutsetningene brytes returnerer vi en defensiv tom shell
 *    (holesUp=0, holesPlayed=0, result=null) — scoring-laget skal ikke kaste
 *    selv om payload-validatoren har feilet eller draft-state leses tidlig.
 */
export function compute(ctx: ScoringContext): SinglesMatchplayResult {
  const side1Players = ctx.players.filter((p) => p.teamNumber === 1);
  const side2Players = ctx.players.filter((p) => p.teamNumber === 2);

  // Defensiv fallback: matchplay krever nøyaktig én spiller per side.
  if (side1Players.length !== 1 || side2Players.length !== 1) {
    return emptyShell(placeholderSides());
  }

  const side1Player = side1Players[0];
  const side2Player = side2Players[0];

  const sides: [MatchplaySide, MatchplaySide] = [
    {
      sideNumber: 1,
      userId: side1Player.userId,
      courseHandicap: side1Player.courseHandicap,
      teeGender: side1Player.teeGender,
    },
    {
      sideNumber: 2,
      userId: side2Player.userId,
      courseHandicap: side2Player.courseHandicap,
      teeGender: side2Player.teeGender,
    },
  ];

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  let side1Wins = 0;
  let side2Wins = 0;
  let holesPlayed = 0;
  // Snapshot av mat-em-tidspunktet (første hull der |holesUp| > holesRemaining).
  // Fanget hull-for-hull slik at vi kan vise golf-lovlig «X&Y» lukk-ute-form
  // også når alle 18 hull er tastet inn etter at matchen alt er avgjort (#800).
  let matEmResult: MatchplayMatchResult | null = null;

  const holes: MatchplayHoleRow[] = holesSorted.map((hole) => {
    const side1Gross = grossByKey.get(`${side1Player.userId}#${hole.number}`) ?? null;
    const side2Gross = grossByKey.get(`${side2Player.userId}#${hole.number}`) ?? null;

    const side1Extra = strokesForHole(side1Player.courseHandicap, hole.strokeIndex);
    const side2Extra = strokesForHole(side2Player.courseHandicap, hole.strokeIndex);

    const side1Net = side1Gross === null ? null : side1Gross - side1Extra;
    const side2Net = side2Gross === null ? null : side2Gross - side2Extra;

    // Matchplay krever begge sider for å avgjøre hullet. Hvis én side mangler
    // gross er hullet 'unplayed' og bidrar IKKE til match-status. Klassifiserer
    // via shared `classifyMatchplayHole` (issue #205) for å holde regel-
    // fortolkningen i synk med scorekort-flaten.
    const result = classifyMatchplayHole(side1Net, side2Net);
    if (result === 'side1_wins') {
      side1Wins += 1;
      holesPlayed += 1;
    } else if (result === 'side2_wins') {
      side2Wins += 1;
      holesPlayed += 1;
    } else if (result === 'tied') {
      holesPlayed += 1;
    }

    // Oppdager mat-em-punktet ved første hull der |holesUp| > holesRemaining
    // (#800). Lagrer berre det første treffet — seinare hull endrar ikkje
    // det golf-lovlege lukk-ute-tidspunktet.
    if (matEmResult === null) {
      const holesUpSoFar = side1Wins - side2Wins;
      const absUpSoFar = Math.abs(holesUpSoFar);
      const remainingSoFar = Math.max(0, 18 - holesPlayed);
      if (absUpSoFar > remainingSoFar) {
        const winner: 'side1' | 'side2' = holesUpSoFar > 0 ? 'side1' : 'side2';
        matEmResult = {
          winner,
          marginUp: absUpSoFar,
          decidedAtHole: holesPlayed,
          remainingAtDecision: remainingSoFar,
          formatted: `${absUpSoFar}&${remainingSoFar}`,
        };
      }
    }

    // Per-side par via parFor — fanger blandet-kjønn-match der side 1 og
    // side 2 spiller fra ulike tees med par_mens != par_ladies. `par` (felles)
    // settes lik side1Par for backward-compat. #240.
    const side1Par = parFor(hole, side1Player.teeGender);
    const side2Par = parFor(hole, side2Player.teeGender);

    return {
      holeNumber: hole.number,
      par: side1Par,
      side1Par,
      side2Par,
      strokeIndex: hole.strokeIndex,
      side1Gross,
      side2Gross,
      side1Net,
      side2Net,
      side1Extra,
      side2Extra,
      result,
    };
  });

  const holesUp = side1Wins - side2Wins;
  // holesRemaining = 18 − holesPlayed: hullene som faktisk kan bidra til
  // match-utfallet. Hull der bare én side har spilt teller IKKE som spilt
  // (matchplay krever begge), men de "blokkerer" heller ikke matematisk —
  // de telles fortsatt som remaining inntil begge har levert.
  const holesRemaining = Math.max(0, 18 - holesPlayed);
  // Bruker mat-em-snapshot hvis matchen vart avgjort undervegs — dette sikrar
  // golf-lovleg «X&Y»-form også når alle 18 hull er tastet inn i etterkant
  // (#800). Elles: standard computeMatchResult for live / 18-hols-«Nup» / AS.
  const result = matEmResult ?? computeMatchResult(holesUp, holesPlayed, holesRemaining);

  return {
    kind: 'singles_matchplay',
    sides,
    holes,
    holesUp,
    holesPlayed,
    holesRemaining,
    result,
  };
}
