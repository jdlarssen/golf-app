import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEAM_SIZE,
  modeRequiresTeamNumber,
  expectedTeamSize,
  unassignedTeamPlayers,
  needsTeamAssignment,
  suggestTeamSplit,
  teamBuckets,
  type TeamPlayer,
} from './teamScope';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Type A-tester for teamScope (#1669) — tvillingen til flightScope.test.ts.
 *
 * Dekker de rene lag-tildelings-hjelperne som admin-actionen og start-vakta
 * deler: hvilke formater krever lag, hvem mangler lag, og hvordan et forslag
 * fordeler de utildelte uten å rive opp lagene som allerede er satt.
 */

/** Aktiv spiller med valgfritt lag/flight. */
function p(
  user_id: string,
  team_number: number | null = null,
  flight_number: number | null = null,
): TeamPlayer {
  return { user_id, team_number, flight_number, withdrawn_at: null };
}

/** Trukket spiller — teller aldri med. */
function withdrawn(
  user_id: string,
  team_number: number | null = null,
  flight_number: number | null = null,
): TeamPlayer {
  return { user_id, team_number, flight_number, withdrawn_at: '2026-01-01T00:00:00Z' };
}

// ─── DEFAULT_TEAM_SIZE ───────────────────────────────────────────────────────

describe('DEFAULT_TEAM_SIZE', () => {
  it('er 2 (par-formatene er den vanligste lag-formen)', () => {
    expect(DEFAULT_TEAM_SIZE).toBe(2);
  });
});

// ─── modeRequiresTeamNumber ──────────────────────────────────────────────────

describe('modeRequiresTeamNumber', () => {
  it.each<[GameMode, number, boolean]>([
    // Lag-formater — krever team_number
    ['best_ball', 2, true],
    ['texas_scramble', 4, true],
    ['ambrose', 4, true],
    ['florida_scramble', 4, true],
    ['shamble', 4, true],
    ['patsome', 2, true],
    ['stableford', 2, true],
    ['modified_stableford', 2, true],
    // Solo-formater — flat deltaker, ingen lag
    ['stableford', 1, false],
    ['modified_stableford', 1, false],
    ['solo_strokeplay', 1, false],
    ['wolf', 1, false],
    ['nassau', 1, false],
    ['skins', 1, false],
    ['bingo_bango_bongo', 1, false],
    ['nines', 1, false],
    ['round_robin', 1, false],
    ['acey_deucey', 1, false],
    // Matchplay-familien — egen incomplete_sides-vakt eier team_number
    ['singles_matchplay', 1, false],
    ['fourball_matchplay', 2, false],
    ['foursomes_matchplay', 2, false],
    ['greensome_matchplay', 2, false],
    ['chapman_matchplay', 2, false],
    ['gruesome_matchplay', 2, false],
  ])('%s (team_size %i) → %s', (mode, teamSize, expected) => {
    expect(modeRequiresTeamNumber(mode, teamSize)).toBe(expected);
  });
});

// ─── expectedTeamSize ────────────────────────────────────────────────────────

describe('expectedTeamSize', () => {
  it('leser team_size fra mode_config', () => {
    expect(expectedTeamSize({ team_size: 4 })).toBe(4);
    expect(expectedTeamSize({ team_size: 3 })).toBe(3);
    expect(expectedTeamSize({ team_size: 2 })).toBe(2);
  });

  it('faller tilbake til 2 når feltet mangler eller er ugyldig', () => {
    expect(expectedTeamSize(null)).toBe(DEFAULT_TEAM_SIZE);
    expect(expectedTeamSize(undefined)).toBe(DEFAULT_TEAM_SIZE);
    expect(expectedTeamSize({})).toBe(DEFAULT_TEAM_SIZE);
    expect(expectedTeamSize({ team_size: 0 })).toBe(DEFAULT_TEAM_SIZE);
    expect(expectedTeamSize({ team_size: -1 })).toBe(DEFAULT_TEAM_SIZE);
    expect(expectedTeamSize({ team_size: 2.5 })).toBe(DEFAULT_TEAM_SIZE);
  });
});

// ─── unassignedTeamPlayers ───────────────────────────────────────────────────

describe('unassignedTeamPlayers', () => {
  it('tom liste → tom liste', () => {
    expect(unassignedTeamPlayers([])).toEqual([]);
  });

  it('returnerer kun aktive spillere uten team_number', () => {
    const players = [p('u1'), p('u2', 1, 1), p('u3'), withdrawn('u4')];
    expect(unassignedTeamPlayers(players).map((x) => x.user_id)).toEqual(['u1', 'u3']);
  });

  it('alle har lag → tom liste', () => {
    const players = [p('u1', 1, 1), p('u2', 1, 1), p('u3', 2, 2)];
    expect(unassignedTeamPlayers(players)).toEqual([]);
  });
});

// ─── needsTeamAssignment ─────────────────────────────────────────────────────

describe('needsTeamAssignment', () => {
  const unassignedRoster = [p('u1'), p('u2'), p('u3'), p('u4')];

  it('best ball med utildelte spillere → true', () => {
    expect(needsTeamAssignment('best_ball', 2, unassignedRoster)).toBe(true);
  });

  it('par-stableford med utildelte spillere → true', () => {
    expect(needsTeamAssignment('stableford', 2, unassignedRoster)).toBe(true);
  });

  it('best ball der alle har lag → false', () => {
    const roster = [p('u1', 1, 1), p('u2', 1, 1), p('u3', 2, 2), p('u4', 2, 2)];
    expect(needsTeamAssignment('best_ball', 2, roster)).toBe(false);
  });

  it('trukket spiller uten lag blokkerer ikke', () => {
    const roster = [p('u1', 1, 1), p('u2', 1, 1), withdrawn('u3')];
    expect(needsTeamAssignment('best_ball', 2, roster)).toBe(false);
  });

  it('solo-format (skins) med utildelte → false', () => {
    expect(needsTeamAssignment('skins', 1, unassignedRoster)).toBe(false);
  });

  it('solo-stableford med utildelte → false', () => {
    expect(needsTeamAssignment('stableford', 1, unassignedRoster)).toBe(false);
  });

  it('matchplay med utildelte → false (incomplete_sides eier den)', () => {
    expect(needsTeamAssignment('singles_matchplay', 1, unassignedRoster)).toBe(false);
    expect(needsTeamAssignment('fourball_matchplay', 2, unassignedRoster)).toBe(false);
  });

  it('tom roster → false', () => {
    expect(needsTeamAssignment('best_ball', 2, [])).toBe(false);
  });
});

// ─── suggestTeamSplit ────────────────────────────────────────────────────────

describe('suggestTeamSplit', () => {
  it('tom liste → tomt forslag', () => {
    expect(suggestTeamSplit([], 2)).toEqual([]);
  });

  it('én spiller → lag 1, flight 1', () => {
    expect(suggestTeamSplit([p('u1')], 2)).toEqual([
      { user_id: 'u1', team_number: 1, flight_number: 1 },
    ]);
  });

  it('4 utildelte à 2 → lag 1, 1, 2, 2 (flight = lag)', () => {
    const players = [p('u1'), p('u2'), p('u3'), p('u4')];
    expect(suggestTeamSplit(players, 2)).toEqual([
      { user_id: 'u1', team_number: 1, flight_number: 1 },
      { user_id: 'u2', team_number: 1, flight_number: 1 },
      { user_id: 'u3', team_number: 2, flight_number: 2 },
      { user_id: 'u4', team_number: 2, flight_number: 2 },
    ]);
  });

  it('5 utildelte à 2 → siste lag blir delvis (lag 3 med én spiller)', () => {
    const players = [p('u1'), p('u2'), p('u3'), p('u4'), p('u5')];
    expect(suggestTeamSplit(players, 2).map((a) => a.team_number)).toEqual([1, 1, 2, 2, 3]);
  });

  it('lagstørrelse 4 → fire per lag', () => {
    const players = Array.from({ length: 6 }, (_, i) => p(`u${i + 1}`));
    expect(suggestTeamSplit(players, 4).map((a) => a.team_number)).toEqual([
      1, 1, 1, 1, 2, 2,
    ]);
  });

  it('foreslår kun for de utildelte — rører aldri spillere som har lag', () => {
    const players = [p('u1', 1, 1), p('u2', 1, 1), p('u3'), p('u4')];
    const result = suggestTeamSplit(players, 2);
    expect(result.map((a) => a.user_id)).toEqual(['u3', 'u4']);
  });

  it('fyller først eksisterende lag som har plass, deretter laveste ledige lag', () => {
    // Lag 1 er fullt (2/2), lag 3 har plass (1/2) → u4 fyller lag 3,
    // u5 starter lag 2 (laveste ledige nummer), u6 fyller lag 2.
    const players = [
      p('u1', 1, 1),
      p('u2', 1, 1),
      p('u3', 3, 3),
      p('u4'),
      p('u5'),
      p('u6'),
    ];
    expect(suggestTeamSplit(players, 2)).toEqual([
      { user_id: 'u4', team_number: 3, flight_number: 3 },
      { user_id: 'u5', team_number: 2, flight_number: 2 },
      { user_id: 'u6', team_number: 2, flight_number: 2 },
    ]);
  });

  it('beholder eksisterende flight_number når spilleren allerede har flight', () => {
    const players = [p('u1', null, 7), p('u2')];
    expect(suggestTeamSplit(players, 2)).toEqual([
      { user_id: 'u1', team_number: 1, flight_number: 7 },
      { user_id: 'u2', team_number: 1, flight_number: 1 },
    ]);
  });

  it('hopper over trukkede spillere — de får ikke lag og teller ikke mot kapasitet', () => {
    const players = [withdrawn('u1'), p('u2'), p('u3')];
    expect(suggestTeamSplit(players, 2)).toEqual([
      { user_id: 'u2', team_number: 1, flight_number: 1 },
      { user_id: 'u3', team_number: 1, flight_number: 1 },
    ]);
  });

  it('ugyldig lagstørrelse faller tilbake til 2', () => {
    const players = [p('u1'), p('u2'), p('u3')];
    expect(suggestTeamSplit(players, 0).map((a) => a.team_number)).toEqual([1, 1, 2]);
  });
});

// ─── teamBuckets ─────────────────────────────────────────────────────────────

describe('teamBuckets', () => {
  it('tom liste → tomme bøtter', () => {
    const { assigned, unassigned } = teamBuckets([]);
    expect(assigned.size).toBe(0);
    expect(unassigned).toEqual([]);
  });

  it('grupperer aktive spillere på team_number og samler resten i unassigned', () => {
    const players = [
      p('u1', 1, 1),
      p('u2', 1, 1),
      p('u3', 5, 5),
      p('u4'),
      withdrawn('u5', 1, 1),
    ];
    const { assigned, unassigned } = teamBuckets(players);
    expect(assigned.get(1)?.map((x) => x.user_id)).toEqual(['u1', 'u2']);
    expect(assigned.get(5)?.map((x) => x.user_id)).toEqual(['u3']);
    expect(unassigned.map((x) => x.user_id)).toEqual(['u4']);
  });
});
