import { describe, expect, it } from 'vitest';
import { blockingHostMatches, type CupFinishMatch } from './cupFinishBlockers';

const match = (over: Partial<CupFinishMatch>): CupFinishMatch => ({
  status: 'active',
  sourceGameId: null,
  allScorecardsSubmitted: false,
  ...over,
});

describe('blockingHostMatches', () => {
  it.each([
    ['finished host', match({ status: 'finished' }), false],
    ['active host, all submitted', match({ status: 'active', allScorecardsSubmitted: true }), false],
    ['active host, missing submissions', match({ status: 'active', allScorecardsSubmitted: false }), true],
    // MAJOR-1: never-started matches must block — they otherwise slip
    // silently past both gates and the cup finishes with unplayed matches.
    ['scheduled host (never started)', match({ status: 'scheduled' }), true],
    ['draft host', match({ status: 'draft' }), true],
    // Derived matches follow their host and never block on their own —
    // even in states that would block for a host.
    ['derived active, missing submissions', match({ sourceGameId: 'host-id' }), false],
    ['derived scheduled', match({ status: 'scheduled', sourceGameId: 'host-id' }), false],
  ])('%s → blocking=%s', (_label, m, blocks) => {
    expect(blockingHostMatches([m]).length === 1).toBe(blocks);
  });

  it('missing allScorecardsSubmitted defaults to blocking for active hosts', () => {
    const m = { status: 'active' as const, sourceGameId: null };
    expect(blockingHostMatches([m])).toHaveLength(1);
  });

  it('empty list blocks nothing', () => {
    expect(blockingHostMatches([])).toHaveLength(0);
  });
});
