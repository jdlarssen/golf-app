/**
 * Type-A pure-logic tests for fitsPlayerCount.
 *
 * One test per rule cluster; it.each covers representative counts including
 * boundary, off-by-one, odd-vs-even, and multiple-of-N edges.
 *
 * Does NOT assert UI behaviour — that lives in GameWizard.test.tsx.
 */

import { describe, it, expect } from 'vitest';
import { fitsPlayerCount, soloPlayerCap } from './fitsPlayerCount';
import type { GameMode } from '@/lib/scoring/modes/types';

// ── stableford / modified_stableford: 1+ (solo OR par config) ────────────────

describe('fitsPlayerCount — stableford', () => {
  it.each([
    [1, true],
    [2, true],
    [3, true],
    [8, true],
  ])('stableford n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('stableford', n)).toBe(expected);
  });

  it('stableford n=0 → false', () => {
    expect(fitsPlayerCount('stableford', 0)).toBe(false);
  });
});

describe('fitsPlayerCount — modified_stableford', () => {
  it.each([
    [1, true],
    [2, true],
    [4, true],
  ])('modified_stableford n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('modified_stableford', n)).toBe(expected);
  });
});

// ── solo_strokeplay: 1+ ──────────────────────────────────────────────────────

describe('fitsPlayerCount — solo_strokeplay', () => {
  it.each([
    [1, true],
    [2, true],
    [8, true],
  ])('solo_strokeplay n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('solo_strokeplay', n)).toBe(expected);
  });

  it('solo_strokeplay n=0 → false', () => {
    expect(fitsPlayerCount('solo_strokeplay', 0)).toBe(false);
  });
});

// ── singles_matchplay: exactly 2 ─────────────────────────────────────────────

describe('fitsPlayerCount — singles_matchplay', () => {
  it.each([
    [1, false],
    [2, true],
    [3, false],
    [4, false],
  ])('singles_matchplay n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('singles_matchplay', n)).toBe(expected);
  });
});

// ── best_ball: even 2–8 (#374) ────────────────────────────────────────────────

describe('fitsPlayerCount — best_ball (even 2–8 per #374)', () => {
  it.each([
    [1, false],
    [2, true],
    [3, false],
    [4, true],
    [5, false],
    [6, true],
    [7, false],
    [8, true],
    [9, false],
    [10, false],
  ])('best_ball n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('best_ball', n)).toBe(expected);
  });
});

// ── texas_scramble: even 4–8 — needs ≥2 teams to be a tournament (#467) ──────
// Teams of 2 or 4; a single team (n=2) is not a competition, so the floor is 4.
// 8-slot payload cap means {4, 6, 8} are the only buildable competition sizes.

describe('fitsPlayerCount — texas_scramble (even 4–8, ≥2 teams per #467)', () => {
  it.each([
    [1, false],
    [2, false],  // bare 1 lag à 2 — ingen turnering
    [3, false],
    [4, true],   // 2 lag à 2
    [5, false],
    [6, true],   // 3 lag à 2
    [7, false],
    [8, true],   // 4 lag à 2 OR 2 lag à 4
    [10, false], // over 8-slot-cap
  ])('texas_scramble n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('texas_scramble', n)).toBe(expected);
  });
});

// ── ambrose: even 4–8 — needs ≥2 teams (#467) ────────────────────────────────
// Teams of 2 or 4, mechanically identical to Texas. Was previously permissive
// (return true) since it was klubb-only; now in the Kompis catalog it needs a
// real floor.

describe('fitsPlayerCount — ambrose (even 4–8, ≥2 teams per #467)', () => {
  it.each([
    [1, false],
    [2, false],
    [3, false],
    [4, true],   // 2 lag à 2
    [5, false],
    [6, true],   // 3 lag à 2
    [8, true],   // 2 lag à 4 OR 4 lag à 2
    [10, false],
  ])('ambrose n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('ambrose', n)).toBe(expected);
  });
});

// ── florida_scramble: 6 or 8 — teams of 3 or 4, needs ≥2 teams (#467) ─────────
// Florida ("step-aside") uses teams of 3 or 4, so the smallest competition is
// 2 lag à 3 = 6. Was previously permissive (return true) as a klubb-only format.

describe('fitsPlayerCount — florida_scramble (6 or 8, ≥2 teams per #467)', () => {
  it.each([
    [1, false],
    [2, false],
    [3, false],  // 1 lag à 3 — ingen turnering
    [4, false],  // 1 lag à 4 — ingen turnering
    [5, false],
    [6, true],   // 2 lag à 3
    [7, false],
    [8, true],   // 2 lag à 4
    [9, false],  // over 8-slot-cap (3 lag à 3 ikke byggbart)
  ])('florida_scramble n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('florida_scramble', n)).toBe(expected);
  });
});

// ── wolf: 3–5 (#465) ─────────────────────────────────────────────────────────

describe('fitsPlayerCount — wolf', () => {
  it.each([
    [2, false],
    [3, true],
    [4, true],
    [5, true],
    [6, false],
  ])('wolf n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('wolf', n)).toBe(expected);
  });
});

// ── nassau: 2–16 (#460) ──────────────────────────────────────────────────────

describe('fitsPlayerCount — nassau', () => {
  it.each([
    [1, false],
    [2, true],
    [3, true],
    [4, true],
    [5, true],
    [8, true],
    [16, true],
    [17, false],
  ])('nassau n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('nassau', n)).toBe(expected);
  });
});

// ── skins: 2–16 (#460) ───────────────────────────────────────────────────────

describe('fitsPlayerCount — skins', () => {
  it.each([
    [1, false],
    [2, true],
    [4, true],
    [5, true],
    [8, true],
    [16, true],
    [17, false],
  ])('skins n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('skins', n)).toBe(expected);
  });
});

// ── nines: exactly 3 ─────────────────────────────────────────────────────────

describe('fitsPlayerCount — nines', () => {
  it.each([
    [2, false],
    [3, true],
    [4, false],
  ])('nines n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('nines', n)).toBe(expected);
  });
});

// ── round_robin: exactly 4 ───────────────────────────────────────────────────

describe('fitsPlayerCount — round_robin', () => {
  it.each([
    [3, false],
    [4, true],
    [5, false],
  ])('round_robin n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('round_robin', n)).toBe(expected);
  });
});

// ── acey_deucey: exactly 4 ───────────────────────────────────────────────────

describe('fitsPlayerCount — acey_deucey', () => {
  it.each([
    [3, false],
    [4, true],
    [5, false],
  ])('acey_deucey n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('acey_deucey', n)).toBe(expected);
  });
});

// ── bingo_bango_bongo: 2–16 (#460) ───────────────────────────────────────────

describe('fitsPlayerCount — bingo_bango_bongo', () => {
  it.each([
    [1, false],
    [2, true],
    [4, true],
    [5, true],
    [8, true],
    [16, true],
    [17, false],
  ])('bingo_bango_bongo n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('bingo_bango_bongo', n)).toBe(expected);
  });
});

// ── fourball_matchplay / foursomes_matchplay / greensome_matchplay /
//    chapman_matchplay / gruesome_matchplay: exactly 4 (2v2) ──────────────────

describe('fitsPlayerCount — 2v2 matchplay family (exactly 4)', () => {
  const MODES = [
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ] as const;

  it.each(MODES)('%s n=4 → true', (mode) => {
    expect(fitsPlayerCount(mode, 4)).toBe(true);
  });

  it.each(MODES)('%s n=3 → false', (mode) => {
    expect(fitsPlayerCount(mode, 3)).toBe(false);
  });

  it.each(MODES)('%s n=5 → false', (mode) => {
    expect(fitsPlayerCount(mode, 5)).toBe(false);
  });
});

// ── patsome: even 4+ ─────────────────────────────────────────────────────────

describe('fitsPlayerCount — patsome', () => {
  it.each([
    [2, false],
    [3, false],
    [4, true],
    [5, false],
    [6, true],
    [8, true],
  ])('patsome n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('patsome', n)).toBe(expected);
  });
});

// ── shamble: 6 or 8 — teams of 3 or 4, needs ≥2 teams (#469) ──────────────────
// Same scramble-family principle as #467: a single team is not a tournament.
// Teams of 3 or 4 → smallest competition is 2 lag à 3 = 6. 8-slot payload cap
// means {6, 8} are the only buildable competition sizes.

describe('fitsPlayerCount — shamble (6 or 8, ≥2 teams per #469)', () => {
  it.each([
    [1, false],
    [2, false],
    [3, false],  // 1 lag à 3 — ingen turnering
    [4, false],  // 1 lag à 4 — ingen turnering
    [5, false],
    [6, true],   // 2 lag à 3
    [7, false],
    [8, true],   // 2 lag à 4
    [9, false],  // over 8-slot-cap (3 lag à 3 ikke byggbart)
    [12, false], // over 8-slot-cap
  ])('shamble n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('shamble', n)).toBe(expected);
  });
});

// ── permissive fallback for unknown / future modes ───────────────────────────
// Modes with no explicit case fall through to `default: return true` (we'd
// rather show a possibly-unfitting format than hide a fitting one). Cast a
// non-existent mode to exercise the branch without coupling to a real format.

describe('fitsPlayerCount — permissive fallback', () => {
  const unknownMode = 'some_future_format' as GameMode;

  it('unknown mode n=4 → true (permissive default)', () => {
    expect(fitsPlayerCount(unknownMode, 4)).toBe(true);
  });

  it('unknown mode n=0 → false (n<=0 guard wins)', () => {
    expect(fitsPlayerCount(unknownMode, 0)).toBe(false);
  });
});

// ── soloPlayerCap (#661) ─────────────────────────────────────────────────────
// Returns the upper player-count cap for solo formats that have a hard ceiling.
// Used by registerForOpenGame to block signup before INSERT.

describe('soloPlayerCap (#661)', () => {
  it.each([
    ['wolf', 5],
    ['nines', 3],
    ['round_robin', 4],
    ['acey_deucey', 4],
    ['nassau', 16],
    ['skins', 16],
    ['bingo_bango_bongo', 16],
  ] as [GameMode, number][])('%s → %i', (mode, expected) => {
    expect(soloPlayerCap(mode)).toBe(expected);
  });

  it.each([
    'stableford',
    'modified_stableford',
    'solo_strokeplay',
    // matchplay family excluded (side-cap handles it separately)
    'singles_matchplay',
    'fourball_matchplay',
    'foursomes_matchplay',
    // team formats excluded
    'texas_scramble',
    'best_ball',
    'patsome',
  ] as GameMode[])('%s → null (no cap)', (mode) => {
    expect(soloPlayerCap(mode)).toBeNull();
  });
});
