// Server-side scoring-avledningene hull-siden gjør før render (#1716 — ren
// flytting ut av `page.tsx`): Wolf-poengene klienten trenger til
// trailing-wolf-regelen, og skins-potten for hullet. Stableford-totalen i
// headeren er borte: hullsiden viser ikke poeng mens slag føres (#2735).

import { computeLeaderboard } from '@/lib/scoring';
import * as skins from '@/lib/scoring/modes/skins';
import { wolfStakeForHole } from '@/lib/wolf/wolfPayout';
import {
  wolfPointsBeforeHole,
  wolfRotationRule,
  type WolfRotationRule,
  type WolfTurn,
} from '@/lib/scoring/modes/wolfTurn';
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

export type WolfContext = {
  choices: WolfHoleChoice[];
  players:
    | Array<{ userId: string; teamNumber: number; name: string }>
    | undefined;
  /** Poengene før hullet (stillingen regelen ser), fra motoren. */
  pointsByUser: Record<string, number> | undefined;
  /**
   * Innsatsen på hullet slik motoren regnet den (2 etter ett delt hull, 3
   * etter to). Wolf-valget ganger gevinsten med den (#2313). Undefined når
   * spillet ikke er Wolf eller motoren ikke kunne kjøre.
   */
  stake: number | undefined;
  /**
   * #2314: ulven på hullet slik motoren valgte den, og om catch-up-regelen ga
   * hullet til den som ligger sist. Undefined når motoren ikke kunne kjøre.
   */
  turn: WolfTurn | undefined;
  /** Spillets regel (`mode_config.wolf_rotation`), til reserven på klienten. */
  rule: WolfRotationRule;
};

/**
 * Wolf-mode-spesifikt: regn ut ulven på hullet og stillingen før det
 * server-side via scoring-modulen (#2314). Klient-laget bruker motorens ulv,
 * og poengene bare som reserve og til catch-up-linja. Vi
 * kjører `computeLeaderboard()` med full ScoringContext slik at vi får
 * konsistent answer med leaderboard-rendringen. wolfPlayers er server-
 * valgt subset av game_players med team_number 1-4 og navn. Fra samme
 * kjøring kommer innsatsen på `holeNumber` (#2313).
 */
export function computeWolfContext(args: {
  isWolf: boolean;
  gameId: string;
  holeNumber: number;
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
    holeNumber,
    game,
    allPlayers,
    unknownPlayer,
    wolfChoicesData,
    wolfAllHolesRes,
    wolfAllScoresRes,
  } = args;
  if (!isWolf) {
    return {
      choices: [],
      players: undefined,
      pointsByUser: undefined,
      stake: undefined,
      turn: undefined,
      rule: 'trailing',
    };
  }
  const rule = wolfRotationRule(game.mode_config);

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
    return { choices, players, pointsByUser: undefined, stake: undefined, turn: undefined, rule };
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
    return { choices, players, pointsByUser: undefined, stake: undefined, turn: undefined, rule };
  }
  const row = result.holes.find((h) => h.holeNumber === holeNumber);
  return {
    choices,
    players,
    pointsByUser: Object.fromEntries(wolfPointsBeforeHole(result.holes, holeNumber)),
    stake: wolfStakeForHole(result.holes, holeNumber),
    turn: row?.wolfUserId ? { userId: row.wolfUserId, catchUp: row.catchUp } : undefined,
    rule,
  };
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
