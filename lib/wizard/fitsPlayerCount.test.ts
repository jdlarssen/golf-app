/**
 * Type-A pure-logic tests for fitsPlayerCount.
 *
 * One test per rule cluster; it.each covers representative counts including
 * boundary, off-by-one, odd-vs-even, and multiple-of-N edges.
 *
 * Does NOT assert UI behaviour — that lives in GameWizard.test.tsx.
 */

import { describe, it, expect } from 'vitest';
import { fitsPlayerCount } from './fitsPlayerCount';

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

// ── texas_scramble: multiple of 2 (teams of 2 or 4 both valid) ───────────────

describe('fitsPlayerCount — texas_scramble', () => {
  it.each([
    [1, false],
    [2, true],   // 1 lag à 2
    [3, false],
    [4, true],   // 2 lag à 2 OR 1 lag à 4
    [6, true],   // 3 lag à 2
    [8, true],   // 4 lag à 2 OR 2 lag à 4
  ])('texas_scramble n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('texas_scramble', n)).toBe(expected);
  });
});

// ── wolf: exactly 4 ──────────────────────────────────────────────────────────

describe('fitsPlayerCount — wolf', () => {
  it.each([
    [3, false],
    [4, true],
    [5, false],
  ])('wolf n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('wolf', n)).toBe(expected);
  });
});

// ── nassau: 2–4 ──────────────────────────────────────────────────────────────

describe('fitsPlayerCount — nassau', () => {
  it.each([
    [1, false],
    [2, true],
    [3, true],
    [4, true],
    [5, false],
  ])('nassau n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('nassau', n)).toBe(expected);
  });
});

// ── skins: 2–4 ───────────────────────────────────────────────────────────────

describe('fitsPlayerCount — skins', () => {
  it.each([
    [1, false],
    [2, true],
    [4, true],
    [5, false],
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

// ── bingo_bango_bongo: 2–4 ───────────────────────────────────────────────────

describe('fitsPlayerCount — bingo_bango_bongo', () => {
  it.each([
    [1, false],
    [2, true],
    [4, true],
    [5, false],
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

// ── shamble: multiple of 3 or 4 ──────────────────────────────────────────────

describe('fitsPlayerCount — shamble', () => {
  it.each([
    [1, false],
    [2, false],
    [3, true],   // 1 lag à 3
    [4, true],   // 1 lag à 4
    [5, false],
    [6, true],   // 2 lag à 3
    [7, false],
    [8, true],   // 2 lag à 4
    [9, true],   // 3 lag à 3
    [12, true],  // 3 lag à 4 or 4 lag à 3
  ])('shamble n=%i → %s', (n, expected) => {
    expect(fitsPlayerCount('shamble', n)).toBe(expected);
  });
});

// ── permissive fallback for unknown modes ────────────────────────────────────

describe('fitsPlayerCount — permissive fallback', () => {
  it('ambrose n=4 → true (permissive — not in Kompis catalog)', () => {
    expect(fitsPlayerCount('ambrose', 4)).toBe(true);
  });

  it('florida_scramble n=3 → true (permissive — not in Kompis catalog)', () => {
    expect(fitsPlayerCount('florida_scramble', 3)).toBe(true);
  });
});
