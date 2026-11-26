// Foursomes matchplay-scoring (issue #218, fase 3 av #47).
//
// 2v2 alternate shot: én ball per lag, partnerne alternerer slag. Lag-score
// per hull → sammenlikn side 1 vs side 2 som matchplay (3&2, 2up, AS).
// Storage følger Texas-mønsteret: lag-kapteinen (lex-min userId) eier
// scores-radene i DB; non-captain-partneren skriver til samme rad via
// UI-routing. Scoring-laget her leser bare kapteinens scores-rad per hull.
//
// Allowance-pipeline (skiller seg fra fourball som bruker per-spiller-allowance):
//   highSideExtraHCP = round(|side1Hcp − side2Hcp| × pct / 100)
//   Lavlaget får 0 strokes; høylaget får highSideExtraHCP strokes allokert
//   via SI (hardeste hull først). WHS-default pct = 50. 0 % = brutto-matchplay.
//
// Side-handicapet (`side1Hcp`/`side2Hcp`) regnes via en `SideRule` (`'sum'` eller
// `'sixtyForty'`, `sideHandicap` i `../teamHandicap.ts`) slik at Chapman (#290)
// kan gjenbruke hele kjernen med 60/40-formel i stedet for summen:
// `computeFoursomesCore(ctx, pct, 'sixtyForty')` returnerer fortsatt
// `kind: 'foursomes_matchplay'` → all leaderboard-/scorekort-/mail-visning deles
// (Ambrose-mønsteret, #284).
//
// #2997 (F16): sidens tall regnes av det urundede banehandicapet når starten
// frøs det, uten avrunding, og prosenten av differansen rundes én gang (NGF
// 6.2a, avklaring 6.2a/1, s. 55). En runde startet før kolonnen fantes, får
// dagens tall.
//
// Gjenbruker singles-helpers:
//   - `classifyMatchplayHole(side1Net, side2Net)` → per-hull-utfall
//   - `computeMatchResult(holesUp, holesPlayed, holesRemaining)` → format-streng

import { pickTeamCaptain } from '@/lib/games/teamCaptain';
import { roundHalfUp } from '../courseHandicap';
import { parDifferenceStrokes, usesParDifference, withParDifference } from '../parDifference';
import { strokesForHole } from '../strokeAllocation';
import { sideHandicap, type SideRule } from '../teamHandicap';
import { parFor } from './parResolver';
import {
  classifyMatchplayHole,
  computeMatchResult,
  detectMatEm,
} from './singlesMatchplay';
import type {
  ScoringContext,
  ScoringGender,
  ScoringPlayer,
  FoursomesMatchplayResult,
  FoursomesHoleRow,
  FoursomesSide,
  FoursomesSidePlayer,
  MatchplayMatchResult,
} from './types';

/**
 * Defensiv tom shell-tuple når vi ikke har 2+2-spillere. Validatoren i
 * `lib/games/gamePayload.ts` håndhever 2+2 ved publish, men draft-state
 * kan ha 0/1/3 — scoring-laget kaster ikke.
 */
function placeholderSides(): [FoursomesSide, FoursomesSide] {
  return [
    {
      sideNumber: 1,
      players: [
        { userId: '', courseHandicap: 0 },
        { userId: '', courseHandicap: 0 },
      ],
      captainUserId: '',
      combinedCourseHandicap: 0,
      effectiveExtraHandicap: 0,
    },
    {
      sideNumber: 2,
      players: [
        { userId: '', courseHandicap: 0 },
        { userId: '', courseHandicap: 0 },
      ],
      captainUserId: '',
      combinedCourseHandicap: 0,
      effectiveExtraHandicap: 0,
    },
  ];
}

/**
 * `totalHoles` (#1441) er antall hull i scope (`ctx.holes.length` — 18 for
 * `full`, 9 for `front9`/`back9`) slik at `holesRemaining` er riktig selv i
 * denne defensive stien. Default 18 for bakoverkompatibilitet.
 */
function emptyShell(totalHoles: number = 18): FoursomesMatchplayResult {
  return {
    kind: 'foursomes_matchplay',
    sides: placeholderSides(),
    holes: [],
    holesUp: 0,
    holesPlayed: 0,
    holesRemaining: totalHoles,
    result: null,
  };
}

/**
 * Trekker `allowance_pct` ut av mode_config. Defensivt fallback til 100 hvis
 * feltet mangler — draft-state kan ha en buggy config. Validatoren håndhever
 * range 0..100 ved publish.
 */
function readAllowancePct(ctx: ScoringContext): number {
  const config = ctx.game.mode_config;
  if (config.kind !== 'foursomes_matchplay') return 100;
  const raw = (config as { allowance_pct?: number }).allowance_pct;
  return typeof raw === 'number' ? raw : 100;
}

function buildSidePlayers(
  partners: ScoringPlayer[],
): [FoursomesSidePlayer, FoursomesSidePlayer] {
  const players: FoursomesSidePlayer[] = partners.map((p) => ({
    userId: p.userId,
    courseHandicap: p.courseHandicap,
    teeGender: p.teeGender,
  }));
  return [players[0], players[1]];
}

export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  return computeFoursomesCore(ctx, readAllowancePct(ctx), 'sum');
}

/**
 * The strokes in the alternate shot formats, one home for the core below and
 * the views (`alternateShotSideExtras`): the high side gets
 * `round(|side1 − side2| × pct / 100)`, the low side 0. Equal sides give both
 * 0. One rounding, 0.5 up, of the sides' handicaps as `sideHandicap` gives
 * them (unrounded when the start froze the raw numbers, #2997).
 */
export function alternateShotExtras(
  side1Handicap: number,
  side2Handicap: number,
  allowancePct: number,
): { side1Extra: number; side2Extra: number } {
  const highSideExtra = roundHalfUp(
    (Math.abs(side1Handicap - side2Handicap) * allowancePct) / 100,
  );
  // Når lag-HCP er like: highSide er irrelevant (begge får 0). Default 1.
  const highSide: 1 | 2 = side2Handicap > side1Handicap ? 2 : 1;
  return {
    side1Extra: highSide === 1 ? highSideExtra : 0,
    side2Extra: highSide === 2 ? highSideExtra : 0,
  };
}

/**
 * The side strokes once the par difference is in (#2941, F17): with
 * `par_strokes`, each side's captain tee (the par the hole rows show) gives
 * the side's difference in par over the holes in scope, added as whole strokes
 * to `extras`, and the lower side then plays off zero (`withParDifference`).
 * Without the key the strokes are returned unchanged. The views
 * (`alternateShotSideExtras`) call it too.
 */
export function alternateShotSideStrokes(
  ctx: Pick<ScoringContext, 'game' | 'holes'>,
  extras: { side1Extra: number; side2Extra: number },
  side1Tee: ScoringGender | undefined,
  side2Tee: ScoringGender | undefined,
): { side1Extra: number; side2Extra: number } {
  if (!usesParDifference(ctx.game.mode_config)) return extras;
  const tees = [side1Tee, side2Tee];
  const [side1Extra, side2Extra] = withParDifference(
    [extras.side1Extra, extras.side2Extra],
    tees.map((tee) => parDifferenceStrokes(ctx.holes, tee, tees)),
  );
  return { side1Extra, side2Extra };
}

/**
 * Manuell overstyring av en sides lag-CH (#1441, D10 — greensomes
 * `team_strokes_override`). Når satt, ERSTATTER `side1`/`side2` den
 * `sideHcp(...)`-beregnede kombinerte CH-en for hhv. side 1 og 2 — resten av
 * kjernen (diff × allowancePct/100 → high-side får differansen via SI) kjører
 * uendret på disse tallene. Kun greensome bruker feltet i dag; foursomes/
 * chapman/gruesome kaller `computeFoursomesCore` uten override (fjerde
 * argument utelatt = `undefined`), så deres oppførsel er upåvirket.
 */
export interface SideHandicapOverride {
  side1: number;
  side2: number;
}

/**
 * Delt matchplay-kjerne for alternate-shot-familien. `allowancePct` styrer hvor
 * mye av lag-HCP-differansen høylaget får; `rule` styrer hvordan en sides
 * lag-handicap regnes (sum for foursomes, 60/40 for Chapman, `sideHandicap`).
 * `override` (D10) bytter ut det beregnede tallet direkte når satt — se
 * `SideHandicapOverride`-doc-kommentaren. Returnerer alltid
 * `kind: 'foursomes_matchplay'` slik at alle view-/mail-konsumenter deles.
 */
export function computeFoursomesCore(
  ctx: ScoringContext,
  allowancePct: number,
  rule: SideRule,
  override?: SideHandicapOverride,
): FoursomesMatchplayResult {
  const side1Players = ctx.players
    .filter((p) => p.teamNumber === 1)
    .slice()
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const side2Players = ctx.players
    .filter((p) => p.teamNumber === 2)
    .slice()
    .sort((a, b) => a.userId.localeCompare(b.userId));

  // Krever EKSAKT 2 spillere per side. Avvik → defensiv empty shell.
  if (side1Players.length !== 2 || side2Players.length !== 2) {
    return emptyShell(ctx.holes.length);
  }

  const side1CaptainId = pickTeamCaptain(side1Players.map((p) => p.userId));
  const side2CaptainId = pickTeamCaptain(side2Players.map((p) => p.userId));

  // Lag-handicap per side via regelen (sum for foursomes, 60/40 for Chapman),
  // urundet når starten frøs de urundede tallene (#2997) — eller `override`
  // (D10) direkte når satt, se `SideHandicapOverride`.
  const side1Combined = override?.side1 ?? sideHandicap(rule, side1Players);
  const side2Combined = override?.side2 ?? sideHandicap(rule, side2Players);

  // Kaptein-spiller for par-display (parFor via teeGender), og sidens par
  // for tilleggsslagene (#2941).
  const side1CaptainPlayer = side1Players.find((p) => p.userId === side1CaptainId);
  const side2CaptainPlayer = side2Players.find((p) => p.userId === side2CaptainId);

  // WHS-diff-formel: høylaget får (diff × allowance_pct/100) strokes via SI.
  // Lavlaget får 0. Ved tie i lag-HCP får begge 0 — gross-only matchplay.
  // #2941 (F17): en ny match legger til forskjellen i par for siden, hele slag
  // etter andelen, også over greensomens overstyring.
  const { side1Extra, side2Extra } = alternateShotSideStrokes(
    ctx,
    alternateShotExtras(side1Combined, side2Combined, allowancePct),
    side1CaptainPlayer?.teeGender,
    side2CaptainPlayer?.teeGender,
  );

  const sides: [FoursomesSide, FoursomesSide] = [
    {
      sideNumber: 1,
      players: buildSidePlayers(side1Players),
      captainUserId: side1CaptainId,
      combinedCourseHandicap: side1Combined,
      effectiveExtraHandicap: side1Extra,
    },
    {
      sideNumber: 2,
      players: buildSidePlayers(side2Players),
      captainUserId: side2CaptainId,
      combinedCourseHandicap: side2Combined,
      effectiveExtraHandicap: side2Extra,
    },
  ];

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  // #1441: antall hull i scope. Caller segment-filtrerer ctx.holes (front9/
  // back9/full) via `holesForSegment` før kall.
  const totalHoles = holesSorted.length;
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  let side1Wins = 0;
  let side2Wins = 0;
  let holesPlayed = 0;
  // Snapshot av mat-em-tidspunktet (første hull der |holesUp| > holesRemaining).
  // Fanget hull-for-hull via delt `detectMatEm` slik at «X&Y» fryses også når
  // alle hull i scope tastes inn etter at matchen alt var avgjort (#1458/#1506,
  // samme regel som singles' #800).
  let matEmResult: MatchplayMatchResult | null = null;

  const holes: FoursomesHoleRow[] = holesSorted.map((hole) => {
    const side1Gross = grossByKey.get(`${side1CaptainId}#${hole.number}`) ?? null;
    const side2Gross = grossByKey.get(`${side2CaptainId}#${hole.number}`) ?? null;

    const side1HoleExtra = strokesForHole(side1Extra, hole.strokeIndex);
    const side2HoleExtra = strokesForHole(side2Extra, hole.strokeIndex);

    const side1Net = side1Gross === null ? null : side1Gross - side1HoleExtra;
    const side2Net = side2Gross === null ? null : side2Gross - side2HoleExtra;

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

    // Behold berre det første mat-em-treffet (#1458/#1506).
    if (matEmResult === null) {
      matEmResult = detectMatEm(side1Wins - side2Wins, holesPlayed, totalHoles);
    }

    const side1Par = parFor(hole, side1CaptainPlayer?.teeGender);
    const side2Par = parFor(hole, side2CaptainPlayer?.teeGender);

    return {
      holeNumber: hole.number,
      par: side1Par,
      side1Par,
      side2Par,
      strokeIndex: hole.strokeIndex,
      side1Gross,
      side2Gross,
      side1Extra: side1HoleExtra,
      side2Extra: side2HoleExtra,
      side1Net,
      side2Net,
      result,
    };
  });

  const holesUp = side1Wins - side2Wins;
  const holesRemaining = Math.max(0, totalHoles - holesPlayed);
  // Frosset mat-em-snapshot vinner når matchen vart avgjort undervegs (#1458/
  // #1506); elles standard computeMatchResult på slutt-aggregata (live / «Nup» /
  // AS). Aggregata (holesUp/holesPlayed/holesRemaining) beheld full-walk-verdiane.
  const matchResult =
    matEmResult ?? computeMatchResult(holesUp, holesPlayed, holesRemaining, totalHoles);

  return {
    kind: 'foursomes_matchplay',
    sides,
    holes,
    holesUp,
    holesPlayed,
    holesRemaining,
    result: matchResult,
  };
}
