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
// Side-handicapet (`side1Hcp`/`side2Hcp`) regnes via en `SideHandicapFn`-strategi
// slik at Chapman (#290) kan gjenbruke hele kjernen med 60/40-formel i stedet for
// summen: `computeFoursomesCore(ctx, pct, chapmanSideHandicap)` returnerer fortsatt
// `kind: 'foursomes_matchplay'` → all leaderboard-/scorekort-/mail-visning deles
// (Ambrose-mønsteret, #284).
//
// Gjenbruker singles-helpers:
//   - `classifyMatchplayHole(side1Net, side2Net)` → per-hull-utfall
//   - `computeMatchResult(holesUp, holesPlayed, holesRemaining)` → format-streng

import { pickTeamCaptain } from '@/lib/games/teamCaptain';
import { strokesForHole } from '../strokeAllocation';
import { parFor } from './parResolver';
import {
  classifyMatchplayHole,
  computeMatchResult,
} from './singlesMatchplay';
import type {
  ScoringContext,
  ScoringPlayer,
  FoursomesMatchplayResult,
  FoursomesHoleRow,
  FoursomesSide,
  FoursomesSidePlayer,
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

function emptyShell(): FoursomesMatchplayResult {
  return {
    kind: 'foursomes_matchplay',
    sides: placeholderSides(),
    holes: [],
    holesUp: 0,
    holesPlayed: 0,
    holesRemaining: 18,
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

/**
 * Strategi for å regne en sides lag-handicap fra de to partnernes Course
 * Handicap. Order-independent. Foursomes bruker summen; Chapman (#290) bruker
 * WHS 60/40 (60 % av laveste + 40 % av høyeste).
 */
export type SideHandicapFn = (ch1: number, ch2: number) => number;

/** Foursomes: sum av begge partneres CH (uendret oppførsel). */
export const combinedSideHandicap: SideHandicapFn = (a, b) => a + b;

/**
 * Chapman/Pinehurst (#290): WHS-allowance = 60 % av laveste + 40 % av høyeste,
 * rundet til heltall FØR diff (per WHS: rund hver sides playing handicap, så ta
 * differansen). Eks: 10 + 20 → round(0.6×10 + 0.4×20) = round(14) = 14.
 */
export const chapmanSideHandicap: SideHandicapFn = (a, b) =>
  Math.round(0.6 * Math.min(a, b) + 0.4 * Math.max(a, b));

export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  return computeFoursomesCore(ctx, readAllowancePct(ctx), combinedSideHandicap);
}

/**
 * Delt matchplay-kjerne for alternate-shot-familien. `allowancePct` styrer hvor
 * mye av lag-HCP-differansen høylaget får; `sideHcp` styrer hvordan en sides
 * lag-handicap regnes (sum for foursomes, 60/40 for Chapman). Returnerer alltid
 * `kind: 'foursomes_matchplay'` slik at alle view-/mail-konsumenter deles.
 */
export function computeFoursomesCore(
  ctx: ScoringContext,
  allowancePct: number,
  sideHcp: SideHandicapFn,
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
    return emptyShell();
  }

  const side1CaptainId = pickTeamCaptain(side1Players.map((p) => p.userId));
  const side2CaptainId = pickTeamCaptain(side2Players.map((p) => p.userId));

  // Lag-handicap per side via strategi (sum for foursomes, 60/40 for Chapman).
  const side1Combined = sideHcp(
    side1Players[0].courseHandicap,
    side1Players[1].courseHandicap,
  );
  const side2Combined = sideHcp(
    side2Players[0].courseHandicap,
    side2Players[1].courseHandicap,
  );

  // WHS-diff-formel: høylaget får (diff × allowance_pct/100) strokes via SI.
  // Lavlaget får 0. Ved tie i lag-HCP får begge 0 — gross-only matchplay.
  const teamDiff = Math.abs(side1Combined - side2Combined);
  const highSideExtraHCP = Math.round((teamDiff * allowancePct) / 100);
  // Når lag-HCP er like (teamDiff === 0): highSideNumber er irrelevant
  // (begge sider får 0 strokes uansett). Default til 1 for determinisme.
  const highSideNumber: 1 | 2 = side2Combined > side1Combined ? 2 : 1;

  const side1Extra = highSideNumber === 1 ? highSideExtraHCP : 0;
  const side2Extra = highSideNumber === 2 ? highSideExtraHCP : 0;

  // Kaptein-spiller for par-display (parFor via teeGender).
  const side1CaptainPlayer = side1Players.find((p) => p.userId === side1CaptainId);
  const side2CaptainPlayer = side2Players.find((p) => p.userId === side2CaptainId);

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
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  let side1Wins = 0;
  let side2Wins = 0;
  let holesPlayed = 0;

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
  const holesRemaining = Math.max(0, 18 - holesPlayed);
  const matchResult = computeMatchResult(holesUp, holesPlayed, holesRemaining);

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
