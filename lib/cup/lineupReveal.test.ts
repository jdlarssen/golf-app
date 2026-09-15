import { describe, it, expect } from 'vitest';
import {
  buildRevealMatches,
  canRetryReveal,
  nextLabelNumber,
} from './lineupReveal';

/**
 * Type A for avdekkings-øyeblikket (#1884): de to leverte uttakene blir til
 * matcher. Selve innsettingen er I/O og bor i `insertCupMatches`; her testes
 * hva som SKAL settes inn.
 */

describe('nextLabelNumber', () => {
  it('starts at 1 for a format the cup has not played yet', () => {
    expect(nextLabelNumber([], 'foursomes_matchplay')).toBe(1);
  });

  it('continues after the existing matches in that format', () => {
    expect(
      nextLabelNumber(
        [
          'foursomes_matchplay',
          'foursomes_matchplay',
          'singles_matchplay',
          'foursomes_matchplay',
        ],
        'foursomes_matchplay',
      ),
    ).toBe(4);
  });

  it('counts each format on its own', () => {
    const existing = ['foursomes_matchplay', 'foursomes_matchplay'];
    expect(nextLabelNumber(existing, 'singles_matchplay')).toBe(1);
  });
});

describe('canRetryReveal (#1901)', () => {
  const T = '2026-09-07T10:00:00.000Z';

  // Alle åtte kombinasjonene av de tre tidsstemplene. Nøyaktig én er `true`:
  // begge lag levert, ingenting avdekket — den fastlåste økta.
  it.each([
    { revealedAt: null, team1SubmittedAt: null, team2SubmittedAt: null, expected: false },
    { revealedAt: null, team1SubmittedAt: T, team2SubmittedAt: null, expected: false },
    { revealedAt: null, team1SubmittedAt: null, team2SubmittedAt: T, expected: false },
    { revealedAt: null, team1SubmittedAt: T, team2SubmittedAt: T, expected: true },
    { revealedAt: T, team1SubmittedAt: null, team2SubmittedAt: null, expected: false },
    { revealedAt: T, team1SubmittedAt: T, team2SubmittedAt: null, expected: false },
    { revealedAt: T, team1SubmittedAt: null, team2SubmittedAt: T, expected: false },
    { revealedAt: T, team1SubmittedAt: T, team2SubmittedAt: T, expected: false },
  ])(
    'revealed=$revealedAt team1=$team1SubmittedAt team2=$team2SubmittedAt → $expected',
    ({ expected, ...input }) => {
      expect(canRetryReveal(input)).toBe(expected);
    },
  );
});

describe('buildRevealMatches', () => {
  it('turns paired slots into matches with continuing labels', () => {
    const out = buildRevealMatches({
      sessionId: 'sess-1',
      format: 'foursomes_matchplay',
      startNumber: 9,
      pairs: [
        { slotIndex: 0, side1: ['a', 'b'], side2: ['w', 'x'] },
        { slotIndex: 1, side1: ['c', 'd'], side2: ['y', 'z'] },
      ],
    });
    expect(out).toEqual([
      {
        id: 'sess-1-0',
        format: 'foursomes_matchplay',
        label: 'Foursome 9',
        side1: ['a', 'b'],
        side2: ['w', 'x'],
        segment: 'full',
      },
      {
        id: 'sess-1-1',
        format: 'foursomes_matchplay',
        label: 'Foursome 10',
        side1: ['c', 'd'],
        side2: ['y', 'z'],
        segment: 'full',
      },
    ]);
  });

  it('labels singles from one when the cup has none yet', () => {
    const out = buildRevealMatches({
      sessionId: 's',
      format: 'singles_matchplay',
      startNumber: 1,
      pairs: [
        { slotIndex: 0, side1: ['a'], side2: ['x'] },
        { slotIndex: 1, side1: ['b'], side2: ['y'] },
      ],
    });
    expect(out.map((m) => m.label)).toEqual(['Singel 1', 'Singel 2']);
  });

  it('never emits a bundle match: no sourceId, no flightIndex, always full', () => {
    const out = buildRevealMatches({
      sessionId: 's',
      format: 'greensome_matchplay',
      startNumber: 1,
      pairs: [{ slotIndex: 0, side1: ['a', 'b'], side2: ['x', 'y'] }],
    });
    expect(out[0].sourceId).toBeUndefined();
    expect(out[0].flightIndex).toBeUndefined();
    expect(out[0].segment).toBe('full');
  });

  it('rejects a pair where a side is short', () => {
    expect(() =>
      buildRevealMatches({
        sessionId: 's',
        format: 'foursomes_matchplay',
        startNumber: 1,
        pairs: [{ slotIndex: 0, side1: ['a'], side2: ['x', 'y'] }],
      }),
    ).toThrow(/side1/);
  });

  it('rejects an empty pair list', () => {
    expect(() =>
      buildRevealMatches({
        sessionId: 's',
        format: 'singles_matchplay',
        startNumber: 1,
        pairs: [],
      }),
    ).toThrow(/ingen plasser/);
  });
});
