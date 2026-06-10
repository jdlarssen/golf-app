import { describe, it, expect } from 'vitest';
import {
  isMatchplayMode,
  countSidePlayers,
  computeSideShortfall,
  isSideRosterComplete,
  type RosterRow,
} from './matchplaySides';
import type { GameMode } from '@/lib/scoring/modes/types';

// Helper: build a roster row with defaults
function row(
  team_number: number | null,
  withdrawn_at: string | null = null,
): RosterRow {
  return { team_number, withdrawn_at };
}

// ─── isMatchplayMode ──────────────────────────────────────────────────────────

describe('isMatchplayMode', () => {
  it.each<[GameMode, boolean]>([
    ['singles_matchplay', true],
    ['fourball_matchplay', true],
    ['foursomes_matchplay', true],
    ['greensome_matchplay', true],
    ['chapman_matchplay', true],
    ['gruesome_matchplay', true],
    ['stableford', false],
    ['solo_strokeplay', false],
    ['best_ball', false],
    ['texas_scramble', false],
    ['wolf', false],
    ['nassau', false],
  ])('isMatchplayMode(%s) === %s', (mode, expected) => {
    expect(isMatchplayMode(mode)).toBe(expected);
  });
});

// ─── countSidePlayers ─────────────────────────────────────────────────────────

describe('countSidePlayers', () => {
  it('teller aktive spillere per side', () => {
    const roster: RosterRow[] = [
      row(1),
      row(1),
      row(2),
    ];
    expect(countSidePlayers(roster)).toEqual({ side1: 2, side2: 1 });
  });

  it('ignorerer trukkede spillere', () => {
    const roster: RosterRow[] = [
      row(1),
      row(1, '2026-01-01T00:00:00Z'), // trukket
      row(2),
      row(2, '2026-01-02T00:00:00Z'), // trukket
    ];
    expect(countSidePlayers(roster)).toEqual({ side1: 1, side2: 1 });
  });

  it('ignorerer rader med null team_number', () => {
    const roster: RosterRow[] = [
      row(null),
      row(1),
      row(2),
    ];
    expect(countSidePlayers(roster)).toEqual({ side1: 1, side2: 1 });
  });

  it('returnerer 0/0 for tom roster', () => {
    expect(countSidePlayers([])).toEqual({ side1: 0, side2: 0 });
  });
});

// ─── computeSideShortfall ────────────────────────────────────────────────────

describe('computeSideShortfall', () => {
  it('singles teamSize=1: side1 full, side2 tom → side2Needs=1', () => {
    const roster: RosterRow[] = [row(1)];
    expect(computeSideShortfall(roster, 1)).toEqual({
      side1Needs: 0,
      side2Needs: 1,
    });
  });

  it('fourball teamSize=2: begge sider tomme → begge mangler 2', () => {
    expect(computeSideShortfall([], 2)).toEqual({
      side1Needs: 2,
      side2Needs: 2,
    });
  });

  it('begge sider fulle → null (ingen mangel)', () => {
    const roster: RosterRow[] = [row(1), row(2)];
    expect(computeSideShortfall(roster, 1)).toBeNull();
  });

  it('begge sider fulle (teamSize=2) → null', () => {
    const roster: RosterRow[] = [row(1), row(1), row(2), row(2)];
    expect(computeSideShortfall(roster, 2)).toBeNull();
  });

  it('trukkede spillere teller ikke mot kapasitet', () => {
    const roster: RosterRow[] = [
      row(1),
      row(1, '2026-01-01T00:00:00Z'), // trukket
      row(2),
    ];
    // side1 har 1 aktiv (ikke 2), side2 har 1 aktiv
    // teamSize=2 → side1Needs=1, side2Needs=1
    expect(computeSideShortfall(roster, 2)).toEqual({
      side1Needs: 1,
      side2Needs: 1,
    });
  });
});

// ─── isSideRosterComplete ────────────────────────────────────────────────────

describe('isSideRosterComplete', () => {
  it.each<[string, RosterRow[], number, boolean]>([
    [
      'singles komplett (1v1)',
      [row(1), row(2)],
      1,
      true,
    ],
    [
      'fourball komplett (2v2)',
      [row(1), row(1), row(2), row(2)],
      2,
      true,
    ],
    [
      'singles side 2 mangler → false',
      [row(1)],
      1,
      false,
    ],
    [
      'fourball side 1 underbooket → false',
      [row(1), row(2), row(2)],
      2,
      false,
    ],
    [
      'null team_number blokkerer → false',
      [row(1), row(null), row(2)],
      1,
      false,
    ],
    [
      'trukket spiller teller ikke — side 2 fortsatt ufullstendig',
      [row(1), row(2, '2026-01-01T00:00:00Z')],
      1,
      false,
    ],
    [
      'trukket spiller teller ikke — men begge sider ellers fulle → true',
      [row(1), row(2), row(2, '2026-01-01T00:00:00Z')],
      1,
      true,
    ],
    [
      'tom roster → false',
      [],
      1,
      false,
    ],
    [
      'overbooket side (2 aktive på side 1, 1 på side 2, teamSize=1) → false',
      [row(1), row(1), row(2)],
      1,
      false,
    ],
  ])('%s', (_, roster, teamSize, expected) => {
    expect(isSideRosterComplete(roster, teamSize)).toBe(expected);
  });
});
