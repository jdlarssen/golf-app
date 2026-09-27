import { describe, it, expect } from 'vitest';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import { buildPlayersForClient, resolveFlight } from './holePagePlayers';

// #2067 — Type A: lagkortets slag-prikker på hull-siden skal regnes av samme
// lag som scoring-motoren. Sletter et medlem kontoen midt i runden, er det
// trukket (0174) og ute av flighten, men handicapet teller det fortsatt i
// én-ball-formatene (`buildUniformContext`). Ellers viser kortet andre slag
// enn tavla og appen.

const WD = '2026-09-17T10:00:00Z';

function player(
  user_id: string,
  team_number: number,
  course_handicap: number,
  withdrawn_at: string | null = null,
): PlayerForHole {
  return {
    user_id,
    team_number,
    flight_number: 1,
    course_handicap,
    submitted_at: null,
    approved_at: null,
    rejection_reason: null,
    withdrawn_at,
    accepted_at: null,
    paid_at: null,
    users: { name: user_id, nickname: null, is_guest: false },
    tee_gender: 'mens',
  };
}

function game(
  game_mode: GameForHole['game_mode'],
  mode_config: GameForHole['mode_config'],
): GameForHole {
  return { id: 'g1', game_mode, mode_config } as unknown as GameForHole;
}

function teamCardStrokes(opts: {
  game: GameForHole;
  allPlayers: PlayerForHole[];
  me: PlayerForHole;
  strokeIndex: number;
  holeNumber?: number;
}): Record<number, number> {
  const flight = resolveFlight({ game: opts.game, allPlayers: opts.allPlayers, me: opts.me });
  const cards = buildPlayersForClient({
    game: opts.game,
    holeNumber: opts.holeNumber ?? 10,
    flight,
    allPlayers: opts.allPlayers,
    strokeIndex: opts.strokeIndex,
    scoresByUser: {},
    unknownPlayer: 'Ukjent',
  });
  return Object.fromEntries(
    cards.map((c) => [(c as { teamNumber: number }).teamNumber, c.extraStrokes]),
  );
}

describe('buildPlayersForClient — lag-handicap med trukket medlem (#2067)', () => {
  const TEXAS = game('texas_scramble', {
    kind: 'texas_scramble',
    team_size: 2,
    teams_count: 2,
    team_handicap_pct: 25,
  });

  it('texas: den trukne kapteinen teller i lag-handicapet (10 + 20 → 8, ikke 5)', () => {
    const me = player('b-partner', 1, 20);
    const strokes = teamCardStrokes({
      game: TEXAS,
      allPlayers: [player('a-captain', 1, 10, WD), me, player('c', 2, 0), player('d', 2, 0)],
      me,
      strokeIndex: 7,
    });

    expect(strokes[1]).toBe(1);
  });

  it('texas uten trukne: uendret (10 + 20 → 8)', () => {
    const me = player('b-partner', 1, 20);
    const strokes = teamCardStrokes({
      game: TEXAS,
      allPlayers: [player('a-captain', 1, 10), me, player('c', 2, 0), player('d', 2, 0)],
      me,
      strokeIndex: 7,
    });

    expect(strokes[1]).toBe(1);
  });

  it('foursomes: siden med trukket kaptein beholder sin kombinerte CH mot motstanderne', () => {
    // Side 1: 15 (trukket) + 15 = 30. Side 2: 10 + 10 = 20. Diff 10 × 50 % = 5.
    // Uten det trukne medlemmet ville side 1 stått på 15 og fått 0 slag.
    const FOURSOMES = game('foursomes_matchplay', {
      kind: 'foursomes_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    });
    const me = player('b-partner', 1, 15);
    const strokes = teamCardStrokes({
      game: FOURSOMES,
      allPlayers: [player('a-captain', 1, 15, WD), me, player('c', 2, 10), player('d', 2, 10)],
      me,
      strokeIndex: 5,
    });

    expect(strokes).toEqual({ 1: 1, 2: 0 });
  });

  it('foursomes: et trukket medlem på motstandersiden teller også der', () => {
    // Side 1: 10 + 10 = 20. Side 2: 15 (trukket) + 15 = 30 → side 2 får 5.
    const FOURSOMES = game('foursomes_matchplay', {
      kind: 'foursomes_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    });
    const me = player('a', 1, 10);
    const strokes = teamCardStrokes({
      game: FOURSOMES,
      allPlayers: [me, player('b', 1, 10), player('c-captain', 2, 15, WD), player('d', 2, 15)],
      me,
      strokeIndex: 5,
    });

    expect(strokes).toEqual({ 1: 0, 2: 1 });
  });
});

// #2218 — Type A: per-spiller-kortene på hullsiden skal vise de slagene
// motoren regner med. Fourball og round robin tar allowance fra
// `mode_config`, og brutto-valget gir 0 slag. Før fiksen fikk kortet slag
// etter rått banehandicap, så flighten trodde et hull var delt som tavla ga
// bort.
function perPlayerStrokes(opts: {
  game: GameForHole;
  allPlayers: PlayerForHole[];
  strokeIndex: number;
  holeNumber?: number;
}): Record<string, number> {
  const me = opts.allPlayers[0];
  const flight = resolveFlight({ game: opts.game, allPlayers: opts.allPlayers, me });
  const cards = buildPlayersForClient({
    game: opts.game,
    holeNumber: opts.holeNumber ?? 1,
    flight,
    allPlayers: opts.allPlayers,
    strokeIndex: opts.strokeIndex,
    scoresByUser: {},
    unknownPlayer: 'Ukjent',
  });
  return Object.fromEntries(cards.map((c) => [c.userId, c.extraStrokes]));
}

describe('buildPlayersForClient — per-spiller-slag som motoren (#2218)', () => {
  const FOURBALL_PLAYERS = [player('a', 1, 20), player('a2', 1, 10), player('b', 2, 4), player('b2', 2, 8)];
  const fourball = (allowance_pct: number) =>
    game('fourball_matchplay', { kind: 'fourball_matchplay', team_size: 2, teams_count: 2, allowance_pct });

  it('fourball 85 %: banehandicap 20 blir 17 — ingen slag på SI 18, ett på SI 1', () => {
    expect(perPlayerStrokes({ game: fourball(85), allPlayers: FOURBALL_PLAYERS, strokeIndex: 18 }).a).toBe(0);
    expect(perPlayerStrokes({ game: fourball(85), allPlayers: FOURBALL_PLAYERS, strokeIndex: 1 }).a).toBe(1);
  });

  it('fourball med allowance 0 (brutto) gir 0 slag', () => {
    expect(perPlayerStrokes({ game: fourball(0), allPlayers: FOURBALL_PLAYERS, strokeIndex: 1 }).a).toBe(0);
  });

  it('round robin uten allowance-felt faller tilbake til 85 % som motoren', () => {
    const RR = game('round_robin', { kind: 'round_robin', team_size: 1, teams_count: 4 } as unknown as GameForHole['mode_config']);
    const players = [player('a', 1, 20), player('b', 2, 10), player('c', 3, 4), player('d', 4, 8)];
    expect(perPlayerStrokes({ game: RR, allPlayers: players, strokeIndex: 18 }).a).toBe(0);
  });

  it('skins brutto gir 0 slag, også med banehandicap 18', () => {
    const SKINS = game('skins', { kind: 'skins', team_size: 1, skins_scoring: 'gross' });
    const players = [player('a', 1, 18), player('b', 1, 4), player('c', 1, 8)];
    expect(perPlayerStrokes({ game: SKINS, allPlayers: players, strokeIndex: 1 }).a).toBe(0);
  });

  it('best ball beholder fullt banehandicap: 20 gir ett slag på SI 18 (uendret)', () => {
    const BEST_BALL = game('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 });
    expect(perPlayerStrokes({ game: BEST_BALL, allPlayers: FOURBALL_PLAYERS, strokeIndex: 18 }).a).toBe(1);
  });

  it('greensome med egne lag-slag {8, 3}: lag 1 får slag på SI 5, ikke på SI 6 (#1447 holder)', () => {
    const GREENSOME = game('greensome_matchplay', {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
      team_strokes_override: { team1: 8, team2: 3 },
    });
    const me = player('a', 1, 12);
    const allPlayers = [me, player('a2', 1, 20), player('b', 2, 5), player('b2', 2, 8)];
    expect(teamCardStrokes({ game: GREENSOME, allPlayers, me, strokeIndex: 5 })).toEqual({ 1: 1, 2: 0 });
    expect(teamCardStrokes({ game: GREENSOME, allPlayers, me, strokeIndex: 6 })).toEqual({ 1: 0, 2: 0 });
  });
});
