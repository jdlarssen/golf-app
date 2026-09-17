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
