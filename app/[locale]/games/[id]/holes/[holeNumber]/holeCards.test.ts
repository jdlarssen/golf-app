import { describe, it, expect } from 'vitest';
import { isCardLocked, summarizeMyCard } from './holeCards';
import type { HoleCard } from './holeLiveQueries';

function card(overrides: Partial<HoleCard> & { userId: string }): HoleCard {
  return {
    name: overrides.userId,
    nickname: null,
    initial: 'X',
    extraStrokes: 0,
    initialStrokes: null,
    initialPutts: null,
    initialClientUpdatedAt: null,
    initialServerUpdatedAt: null,
    submitted: false,
    score: null,
    putts: null,
    ...overrides,
  };
}

const ME = 'me';

// #2211: the card of a flight-mate who has submitted is frozen on the server;
// the hole page locks it so nobody types a number that is never stored.
describe('isCardLocked', () => {
  it.each([
    ['submitted flight-mate', true, card({ userId: 'mate', submitted: true }), false, false],
    ['flight-mate still playing', false, card({ userId: 'mate' }), false, false],
    ['my own card after withdrawing', true, card({ userId: ME }), false, true],
    ['a flight-mate while I am withdrawn', false, card({ userId: 'mate' }), false, true],
    ['any card on a locked page', true, card({ userId: 'mate' }), true, false],
  ])('%s → locked=%s', (_label, expected, c, pageDisabled, withdrawn) => {
    expect(isCardLocked(c, { pageDisabled, withdrawn, myUserId: ME })).toBe(
      expected,
    );
  });
});

describe('summarizeMyCard', () => {
  it('does not count a submitted card as missing a score', () => {
    const summary = summarizeMyCard(
      [
        card({ userId: ME, score: 4 }),
        card({ userId: 'mate-submitted', submitted: true }),
        card({ userId: 'mate-playing' }),
      ],
      { isTeamCollapsedMode: false, myTeamNumber: null, myUserId: ME },
    );
    expect(summary.missingFlightScoreCount).toBe(1);
  });
});
