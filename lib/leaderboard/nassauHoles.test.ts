import { describe, it, expect } from 'vitest';
import { fours, nassauResult as nassau } from './__fixtures__/nassauResult';
import { NASSAU_SECTION_KEYS } from './nassauBoard';
import { nassauAloneFrom, nassauHoleCards, nassauStandingAfter } from './nassauHoles';

/**
 * The B3 artboard's round (`Nassau-hull-B3-*`): par 4 and handicap 0, so net
 * is gross. Hole winners as drawn — front 9: meg, =, jonas, anne, anne, =, =,
 * marte, =; back 9: =, anne, meg, meg, =, meg, =, marte, =. Anne wins the
 * front 9 (33) alone from hole 5, meg the back 9 (34) alone from hole 15
 * (alone after 13, caught on 14), Anne the total (68) alone from hole 5.
 */
const B3 = {
  meg: [3, 4, 4, 4, 4, 4, 5, 4, 3, 4, 4, 3, 3, 4, 3, 4, 4, 5],
  anne: [4, 4, 4, 3, 3, 4, 4, 4, 3, 4, 3, 4, 4, 3, 4, 4, 4, 5],
  jonas: [4, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 4, 5],
  marte: [4, 4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 5],
} as const;

const lastHole = { front9: 9, back9: 18, total18: 18 } as const;

describe('nassauStandingAfter — the lead after a hole, on the engine rule', () => {
  it('the B3 round after hole 15: meg leads the back 9 by 1, Anne the total by 1', () => {
    const result = nassau(B3);
    expect(nassauStandingAfter(result, 'back9', 15)).toEqual({ leaderUserIds: ['meg'], lead: 1 });
    expect(nassauStandingAfter(result, 'total18', 15)).toEqual({ leaderUserIds: ['anne'], lead: 1 });
  });

  it('a shared lead has no margin', () => {
    // After hole 4: meg, anne and jonas on 15.
    const standing = nassauStandingAfter(nassau(B3), 'front9', 4);
    expect(standing?.leaderUserIds).toEqual(expect.arrayContaining(['meg', 'anne', 'jonas']));
    expect(standing?.leaderUserIds).toHaveLength(3);
    expect(standing?.lead).toBeNull();
  });

  it('nobody has played the match up to the hole: no standing', () => {
    const result = nassau({ a: fours(9), b: fours(9) });
    expect(nassauStandingAfter(result, 'back9', 12)).toBeNull();
    // A hole outside the match has no standing in it either.
    expect(nassauStandingAfter(result, 'back9', 5)).toBeNull();
  });

  it('one player: leads alone, and with nobody to compare against there is no margin', () => {
    expect(nassauStandingAfter(nassau({ a: fours(9) }), 'front9', 9)).toEqual({
      leaderUserIds: ['a'],
      lead: null,
    });
  });

  it('net total: a skipped hole counts the padding, so the player is behind', () => {
    // a skips hole 3 and is better elsewhere; b plays every hole in par.
    const result = nassau({ a: [3, 3, null, 3, 3, 3, 3, 3, 3], b: fours(9) });
    expect(nassauStandingAfter(result, 'front9', 9)).toEqual({ leaderUserIds: ['b'], lead: null });
    expect(result.sections.front9.winnerUserIds).toEqual(['b']);
  });

  it('net to par: a skipped hole counts par once the player has played one, as the engine', () => {
    const result = nassau({ a: [3, 3, null, 3, 3, 3, 3, 3, 3], b: fours(9) }, 'net_to_par');
    // a is 8 under on the holes played, b level: a leads by 8.
    expect(nassauStandingAfter(result, 'front9', 9)).toEqual({ leaderUserIds: ['a'], lead: 8 });
    expect(result.sections.front9.winnerUserIds).toEqual(['a']);
  });

  it('net to par: a player without a hole in the match so far ranks last', () => {
    const result = nassau({ a: [null, 5], b: [5, 5] }, 'net_to_par');
    expect(nassauStandingAfter(result, 'front9', 1)).toEqual({ leaderUserIds: ['b'], lead: null });
    // From hole 2 a has played one and the skipped hole counts par: a +1, b +2.
    expect(nassauStandingAfter(result, 'front9', 2)).toEqual({ leaderUserIds: ['a'], lead: 1 });
  });
});

describe('nassauAloneFrom — the hole the winner led alone from, out the match', () => {
  it('the B3 round: front 9 from 5, back 9 from 15, total from 5', () => {
    const result = nassau(B3);
    expect(nassauAloneFrom(result, 'front9')).toBe(5);
    expect(nassauAloneFrom(result, 'back9')).toBe(15);
    expect(nassauAloneFrom(result, 'total18')).toBe(5);
  });

  it('led from the first hole: the match’s first hole', () => {
    const result = nassau({ a: [3, ...fours(17)], b: fours(18) });
    expect(nassauAloneFrom(result, 'front9')).toBe(1);
    expect(nassauAloneFrom(result, 'total18')).toBe(1);
  });

  it('took the lead alone on the last hole', () => {
    const result = nassau({ a: [...fours(8), 3], b: fours(9) });
    expect(nassauAloneFrom(result, 'front9')).toBe(9);
  });

  it('a tied match (a push): nobody was alone out the match', () => {
    const result = nassau({ a: fours(18), b: fours(18) });
    expect(result.sections.front9.winnerUserIds).toHaveLength(2);
    expect(nassauAloneFrom(result, 'front9')).toBeNull();
  });

  it('won on countback: the sums are equal after the last hole, so there is no hole', () => {
    // 72 each; b has the better back 9 and wins the total on countback.
    const result = nassau({
      a: [...[3, 3, 4, 4, 4, 4, 4, 4, 5], ...[4, 4, 4, 4, 4, 4, 4, 4, 5]],
      b: [...[4, 4, 4, 4, 4, 4, 4, 4, 5], ...[3, 3, 4, 4, 4, 4, 4, 4, 5]],
    });
    expect(result.sections.total18.winnerUserIds).toEqual(['b']);
    expect(nassauStandingAfter(result, 'total18', 18)?.leaderUserIds).toHaveLength(2);
    expect(nassauAloneFrom(result, 'total18')).toBeNull();
  });

  it('nobody played the match (the round ended after the front 9): no winner, no hole', () => {
    const result = nassau({ a: [3, ...fours(8)], b: fours(9) });
    expect(result.sections.back9.winnerUserIds).toEqual([]);
    expect(nassauAloneFrom(result, 'back9')).toBeNull();
  });

  it('the standing after the last hole names the engine’s winner whenever the sum decides (one home)', () => {
    const rounds = [
      nassau(B3),
      nassau(B3, 'net_to_par'),
      nassau({ a: [3, 3, null, 3, 3, 3, 3, 3, 3], b: fours(9) }),
      nassau({ a: [3, 3, null, 3, 3, 3, 3, 3, 3], b: fours(9) }, 'net_to_par'),
      nassau({ a: [5, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3], b: fours(18), c: [4, 4, 4, 4, 4, 4, 4, 4, 4, 5] }),
    ];
    let checked = 0;
    for (const result of rounds) {
      for (const key of NASSAU_SECTION_KEYS) {
        const section = result.sections[key];
        const standing = nassauStandingAfter(result, key, lastHole[key]);
        if (section.winnerUserIds.length !== 1 || standing?.leaderUserIds.length !== 1) continue;
        expect(standing.leaderUserIds[0]).toBe(section.winnerUserIds[0]);
        expect(nassauAloneFrom(result, key)).not.toBeNull();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});

describe('nassauHoleCards — what the screen draws', () => {
  it('the B3 round: each hole’s outcome and winner, as drawn', () => {
    const cards = nassauHoleCards(nassau(B3), { viewerUserId: 'meg' });
    expect(cards.holes.map((h) => (h.outcome === 'won' ? h.winnerUserId : h.outcome))).toEqual([
      'meg', 'tied', 'jonas', 'anne', 'anne', 'tied', 'tied', 'marte', 'tied',
      'tied', 'anne', 'meg', 'meg', 'tied', 'meg', 'tied', 'marte', 'tied',
    ]);
  });

  it('each match: winner, the sum the board leads with, and the hole alone from', () => {
    const { matches } = nassauHoleCards(nassau(B3), { viewerUserId: 'meg' });
    expect(matches.front9).toMatchObject({ outcome: 'won', winnerUserIds: ['anne'], aloneFrom: 5 });
    expect(matches.front9.headline?.text).toBe('33');
    expect(matches.back9).toMatchObject({ outcome: 'won', winnerUserIds: ['meg'], aloneFrom: 15 });
    expect(matches.back9.headline?.text).toBe('34');
    expect(matches.total18).toMatchObject({ outcome: 'won', winnerUserIds: ['anne'], aloneFrom: 5 });
    expect(matches.total18.headline?.text).toBe('68');
  });

  it('net to par: the sum is the board’s «mot par»', () => {
    const { matches } = nassauHoleCards(nassau(B3, 'net_to_par'), { viewerUserId: 'meg' });
    // The board's minus sign (`vsPar.formatVsPar`), not a hyphen.
    expect(matches.front9.headline?.text).toBe('−3');
  });

  it('hole 15: par and index, the rows best first, and the standing in its match and the total', () => {
    const hole = nassauHoleCards(nassau(B3), { viewerUserId: 'meg' }).holes[14];
    expect(hole).toMatchObject({ holeNumber: 15, par: 4, strokeIndex: 15, section: 'back9' });
    expect(hole.rows.map((r) => [r.userId, r.effective])).toEqual([
      ['meg', 3],
      ['anne', 4],
      ['jonas', 4],
      ['marte', 4],
    ]);
    expect(hole.sectionStanding).toEqual({ leaderUserIds: ['meg'], lead: 1 });
    expect(hole.totalStanding).toEqual({ leaderUserIds: ['anne'], lead: 1 });
  });

  it('a tied match and a match nobody played', () => {
    const tied = nassauHoleCards(nassau({ a: fours(18), b: fours(18) }), { viewerUserId: 'a' });
    expect(tied.matches.front9).toMatchObject({ outcome: 'tied', aloneFrom: null });
    expect(tied.matches.front9.headline?.text).toBe('36');

    const short = nassauHoleCards(nassau({ a: [3, ...fours(8)], b: fours(9) }), { viewerUserId: 'a' });
    expect(short.matches.back9).toMatchObject({ outcome: 'none', winnerUserIds: [], headline: null, aloneFrom: null });
    expect(short.holes[11]).toMatchObject({ outcome: 'unplayed', winnerUserId: null, sectionStanding: null });
  });

  describe('the hole the card opens on', () => {
    it('where the viewer went alone in a match they won (B3: hole 15)', () => {
      expect(nassauHoleCards(nassau(B3), { viewerUserId: 'meg' }).startHoleNumber).toBe(15);
    });

    it('the viewer won more than one: the biggest (the total before the back 9 before the front 9)', () => {
      // a wins the front 9 alone from 9 and the total alone from 12 (level after 11).
      const both = nassau({
        a: [...fours(8), 3, 4, 4, 3, ...fours(6)],
        b: [...fours(8), 4, 4, 3, 4, ...fours(6)],
      });
      expect(nassauAloneFrom(both, 'front9')).toBe(9);
      expect(nassauAloneFrom(both, 'total18')).toBe(12);
      expect(nassauHoleCards(both, { viewerUserId: 'a' }).startHoleNumber).toBe(12);
    });

    it('the viewer won nothing: where the total’s winner went alone', () => {
      expect(nassauHoleCards(nassau(B3), { viewerUserId: 'jonas' }).startHoleNumber).toBe(5);
      expect(nassauHoleCards(nassau(B3), { viewerUserId: null }).startHoleNumber).toBe(5);
    });

    it('nobody went alone out the total: hole 1', () => {
      expect(nassauHoleCards(nassau({ a: fours(18), b: fours(18) }), { viewerUserId: 'a' }).startHoleNumber).toBe(1);
    });
  });
});
