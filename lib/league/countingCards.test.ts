import { describe, it, expect } from 'vitest';
import { countingCards } from './countingCards';

/**
 * #2815: the cards that count in the table, the one rule the table
 * (`getLigaSnapshot`) and the card view's gate (`leagueCardAccess`) share.
 */
const card = (id: string, over: Partial<{ withdrawn_at: string | null; submitted_at: string | null; approved_at: string | null }> = {}) => ({
  id,
  withdrawn_at: null,
  submitted_at: '2026-11-10T19:00:00Z',
  approved_at: null,
  ...over,
});
const ids = (cards: Array<{ id: string }>) => cards.map((c) => c.id);

describe('countingCards', () => {
  it('a finished regular flight counts its delivered, not withdrawn cards', () => {
    const players = [card('a'), card('b'), card('c', { withdrawn_at: '2026-11-10T18:00:00Z' }), card('d', { submitted_at: null })];
    expect(ids(countingCards('finished', players, false))).toEqual(['a', 'b']);
  });

  it('a flight that is not finished counts nothing', () => {
    expect(['active', 'scheduled'].map((s) => countingCards(s, [card('a'), card('b')], false))).toEqual([[], []]);
  });

  it('the marker rule: a regular flight with one delivered card counts nothing; a simulator flight counts one', () => {
    expect(countingCards('finished', [card('a'), card('b', { submitted_at: null })], false)).toEqual([]);
    expect(ids(countingCards('finished', [card('a', { approved_at: '2026-11-10T20:00:00Z' })], true))).toEqual(['a']);
  });

  it('in a simulator league a card counts only once its marker approved it (#2661)', () => {
    const players = [card('a', { approved_at: '2026-11-10T20:00:00Z' }), card('b')];
    expect(ids(countingCards('finished', players, true))).toEqual(['a']);
    expect(countingCards('finished', [card('b')], true)).toEqual([]);
  });
});
