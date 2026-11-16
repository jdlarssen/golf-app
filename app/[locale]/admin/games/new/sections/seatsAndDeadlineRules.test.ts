import { describe, expect, it } from 'vitest';
import {
  CAP_START,
  capInBounds,
  capStep,
  flightsOfFour,
  showsSeatsAndDeadline,
} from './seatsAndDeadlineRules';

// Type A (#2482): − and + on «Antall plasser», the flights line under it, and
// when the card shows at all.

const B = { min: 2, max: 200 };

describe('capStep', () => {
  it('+ from no cap starts at 16 (four flights of four), or the format cap below it', () => {
    expect(capStep(null, 1, B)).toBe(CAP_START);
    expect(capStep(null, 1, { min: 2, max: 5 })).toBe(5);
  });

  it('− from no cap does nothing', () => {
    expect(capStep(null, -1, B)).toBeNull();
  });

  it('steps one seat', () => {
    expect(capStep(16, 1, B)).toBe(17);
    expect(capStep(16, -1, B)).toBe(15);
  });

  it('never above the top bound', () => {
    expect(capStep(200, 1, B)).toBe(200);
    expect(capStep(5, 1, { min: 2, max: 5 })).toBe(5);
  });

  it('− at the bottom bound removes the cap (never below 2)', () => {
    expect(capStep(2, -1, B)).toBeNull();
  });
});

describe('capInBounds', () => {
  it('keeps a cap inside, clamps one outside (the format changed), none on matchplay', () => {
    expect(capInBounds(16, B)).toBe(16);
    expect(capInBounds(16, { min: 2, max: 5 })).toBe(5);
    expect(capInBounds(1, B)).toBe(2);
    expect(capInBounds(null, B)).toBeNull();
    expect(capInBounds(16, null)).toBeNull();
  });
});

describe('flightsOfFour', () => {
  it('a multiple of four gives the flights; anything else nothing', () => {
    expect(flightsOfFour(16)).toBe(4);
    expect(flightsOfFour(4)).toBe(1);
    expect(flightsOfFour(18)).toBeNull();
    expect(flightsOfFour(null)).toBeNull();
  });
});

describe('showsSeatsAndDeadline', () => {
  it('open and manual approval show it; invite only and a club tournament do not', () => {
    expect(showsSeatsAndDeadline('open', false)).toBe(true);
    expect(showsSeatsAndDeadline('manual_approval', false)).toBe(true);
    expect(showsSeatsAndDeadline('invite_only', false)).toBe(false);
    expect(showsSeatsAndDeadline('open', true)).toBe(false);
  });
});
