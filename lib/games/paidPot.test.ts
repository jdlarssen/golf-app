import { describe, it, expect } from 'vitest';
import { computePaidPotKr, type PotPlayer } from './paidPot';

// Helper: build a minimal player with paid/withdrawn defaults.
function player(
  paid_at: string | null,
  withdrawn_at: string | null = null,
): PotPlayer {
  return { paid_at, withdrawn_at };
}

const PAID = '2026-07-12T10:00:00Z';
const WD = '2026-07-12T11:00:00Z';

describe('computePaidPotKr', () => {
  it('is 0 for an empty roster', () => {
    expect(computePaidPotKr([], 100)).toBe(0);
  });

  it('counts a single paid, non-withdrawn player', () => {
    expect(computePaidPotKr([player(PAID)], 100)).toBe(100);
  });

  it('sums many paid, non-withdrawn players', () => {
    const players = [player(PAID), player(PAID), player(PAID)];
    expect(computePaidPotKr(players, 150)).toBe(450);
  });

  it('excludes a withdrawn player even if they paid (parity with admin count)', () => {
    const players = [player(PAID), player(PAID, WD)];
    expect(computePaidPotKr(players, 100)).toBe(100);
  });

  it('excludes unpaid players', () => {
    const players = [player(PAID), player(null), player(null)];
    expect(computePaidPotKr(players, 200)).toBe(200);
  });

  it('handles a mix of paid, unpaid and withdrawn-paid', () => {
    const players = [
      player(PAID), // counts
      player(null), // unpaid
      player(PAID, WD), // withdrawn — excluded
      player(PAID), // counts
      player(null, WD), // unpaid + withdrawn
    ];
    expect(computePaidPotKr(players, 100)).toBe(200);
  });

  it('is 0 when entry_fee_kr is 0 (no fee → no pot)', () => {
    expect(computePaidPotKr([player(PAID), player(PAID)], 0)).toBe(0);
  });

  it('is 0 for a negative entry_fee_kr (guard)', () => {
    expect(computePaidPotKr([player(PAID)], -50)).toBe(0);
  });
});
