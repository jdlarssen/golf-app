// Server-side scoring-avledningene hull-siden gjør før render (#1716 — ren
// flytting ut av `page.tsx`): stableford-totalen i headeren, Wolf-poengene
// klienten trenger til trailing-wolf-regelen, og skins-potten for hullet.

import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import { parFor } from '@/lib/scoring/modes/parResolver';
import { computeLeaderboard } from '@/lib/scoring';
import * as skins from '@/lib/scoring/modes/skins';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  WolfHoleChoice,
} from '@/lib/scoring/modes/types';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import type { HolePageData, HoleRow } from './holePageData';

type ScoreRowForCtx = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

function toScoringHoles(rows: HoleRow[] | null): ScoringHole[] {
  return (rows ?? []).map((h) => ({
    number: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));
}

function toScoringPlayers(allPlayers: PlayerForHole[]): ScoringPlayer[] {
  return allPlayers.map((p) => ({
    userId: p.user_id,
    teamNumber: p.team_number,
    flightNumber: p.flight_number,
    courseHandicap: p.course_handicap ?? 0,
    teeGender: p.tee_gender ?? 'mens',
  }));
}

function toScoringScores(rows: ScoreRowForCtx[] | null): ScoringHoleScore[] {
  return (rows ?? []).map((s) => ({
    userId: s.user_id,
    holeNumber: s.hole_number,
    gross: s.strokes,
  }));
}

/**
 * Stableford totals — komputeres server-side når modus krever det.
 * `total`: summen over alle ferdig-tastede hull (brukerens egen
 * course-handicap brukes til stroke-fordeling). `forCurrentHole`: poeng for
 * current hull spesifikt, brukes til «N poeng»-chip-en.
 */
export function computeStablefordTotals(args: {
  isStableford: boolean;
  game: GameForHole;
  me: PlayerForHole;
  holeNumber: number;
  allHolesRes: HolePageData['allHolesRes'];
  myAllScoresRes: HolePageData['myAllScoresRes'];
}): { total: number | null; forCurrentHole: number | null } {
  const { isStableford, game, me, holeNumber, allHolesRes, myAllScoresRes } =
    args;
  if (!isStableford) return { total: null, forCurrentHole: null };
  if (allHolesRes.error) throw allHolesRes.error;
  if (myAllScoresRes.error) throw myAllScoresRes.error;
  const myCh = me.course_handicap ?? 0;
  const holesByNum = new Map<number, HoleRow>();
  for (const h of allHolesRes.data ?? []) holesByNum.set(h.hole_number, h);
  const stablefordPointsFn =
    game.game_mode === 'modified_stableford'
      ? computeModifiedStablefordPoints
      : computeStablefordPoints;
  let total = 0;
  let forCurrentHole: number | null = null;
  for (const s of myAllScoresRes.data ?? []) {
    if (s.strokes == null) continue;
    const h = holesByNum.get(s.hole_number);
    if (!h) continue;
    const extra = strokesForHole(myCh, h.stroke_index);
    const net = s.strokes - extra;
    // #240 — meg's stableford-poeng skal bruke meg's tee_gender-par.
    // parFor() leser av per-kjønn-tabellen og faller tilbake til mens
    // når kolonnene er like (vanlig tilfelle).
    const myPar = parFor(
      {
        number: h.hole_number,
        par: h.par_mens,
        parByGender: {
          mens: h.par_mens,
          ladies: h.par_ladies,
          juniors: h.par_juniors,
        },
        strokeIndex: h.stroke_index,
      },
      me.tee_gender,
    );
    const pts = stablefordPointsFn({ par: myPar, netStrokes: net });
    total += pts;
    if (s.hole_number === holeNumber) {
      forCurrentHole = pts;
    }
  }
  return { total, forCurrentHole };
}

export type WolfContext = {
  choices: WolfHoleChoice[];
  players:
    | Array<{ userId: string; teamNumber: number; name: string }>
    | undefined;
  pointsByUser: Record<string, number> | undefined;
};

/**
 * Wolf-mode-spesifikt: regn ut pointsByUser server-side via scoring-modulen.
 * Klient-laget bruker dette til trailing-wolf-regelen (hull 17-18). Vi
 * kjører `computeLeaderboard()` med full ScoringContext slik at vi får
 * konsistent answer med leaderboard-rendringen. wolfPlayers er server-
 * valgt subset av game_players med team_number 1-4 og navn.
 */
export function computeWolfContext(args: {
  isWolf: boolean;
  gameId: string;
  game: GameForHole;
  allPlayers: PlayerForHole[];
  unknownPlayer: string;
  wolfChoicesData: HolePageData['wolfChoicesData'];
  wolfAllHolesRes: HolePageData['wolfAllHolesRes'];
  wolfAllScoresRes: HolePageData['wolfAllScoresRes'];
}): WolfContext {
  const {
    isWolf,
    gameId,
    game,
    allPlayers,
    unknownPlayer,
    wolfChoicesData,
    wolfAllHolesRes,
    wolfAllScoresRes,
  } = args;
  if (!isWolf) {
    return { choices: [], players: undefined, pointsByUser: undefined };
  }

  const choices = wolfChoicesData as WolfHoleChoice[];

  // n spillere (3-5, #465) med team_number 1..n — validatoren sikrer riktig
  // antall + sammenhengende slots.
  const players = allPlayers
    .filter((p) => p.team_number != null)
    .map((p) => ({
      userId: p.user_id,
      teamNumber: p.team_number as number,
      name: p.users?.nickname?.trim() || p.users?.name || unknownPlayer,
    }));

  // Bygg ScoringContext for compute(). Vi trenger course-holes for SI/par
  // og scores for alle spillere over hele runden.
  if (
    wolfAllHolesRes.error ||
    wolfAllScoresRes.error ||
    game.mode_config.kind !== 'wolf'
  ) {
    return { choices, players, pointsByUser: undefined };
  }
  const ctx: ScoringContext = {
    game: {
      id: gameId,
      game_mode: 'wolf',
      mode_config: game.mode_config,
    },
    players: toScoringPlayers(allPlayers),
    holes: toScoringHoles(wolfAllHolesRes.data),
    scores: toScoringScores(wolfAllScoresRes.data),
    wolfChoices: choices,
  };
  const result = computeLeaderboard(ctx);
  if (result.kind !== 'wolf') {
    return { choices, players, pointsByUser: undefined };
  }
  const map: Record<string, number> = {};
  for (const p of result.players) {
    map[p.userId] = p.totalPoints;
  }
  return { choices, players, pointsByUser: map };
}

/**
 * Skins-modus: beregn atStake for gjeldende hull via compute() over alle
 * scorer. Sendes til HoleClient som informasjons-banner. Speiler Wolf-mønstret.
 */
export function computeSkinsStake(args: {
  isSkins: boolean;
  gameId: string;
  game: GameForHole;
  allPlayers: PlayerForHole[];
  holeNumber: number;
  skinsAllHolesRes: HolePageData['skinsAllHolesRes'];
  skinsAllScoresRes: HolePageData['skinsAllScoresRes'];
}): { atStake: number | undefined; carriedIn: number | undefined } {
  const {
    isSkins,
    gameId,
    game,
    allPlayers,
    holeNumber,
    skinsAllHolesRes,
    skinsAllScoresRes,
  } = args;
  if (
    !isSkins ||
    skinsAllHolesRes.error ||
    skinsAllScoresRes.error ||
    game.mode_config.kind !== 'skins'
  ) {
    return { atStake: undefined, carriedIn: undefined };
  }
  const skinsCtx: ScoringContext = {
    game: {
      id: gameId,
      game_mode: 'skins',
      mode_config: game.mode_config,
    },
    players: toScoringPlayers(allPlayers),
    holes: toScoringHoles(skinsAllHolesRes.data),
    scores: toScoringScores(skinsAllScoresRes.data),
  };
  const skinsResult = skins.compute(skinsCtx);
  const row = skinsResult.holes.find((r) => r.holeNumber === holeNumber);
  if (!row) return { atStake: undefined, carriedIn: undefined };
  return { atStake: row.atStake, carriedIn: row.carriedIn };
}
