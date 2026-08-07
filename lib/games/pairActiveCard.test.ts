import { describe, it, expect } from 'vitest';
import { mergePairState, mergePairExtras } from './pairActiveCard';
import type { ActiveCardExtras } from './getActiveGameCardData';
import type { ActiveCardState } from './activeCardState';

/**
 * Type A coverage for the split-day merged active card (#1449): the pair's
 * state is its EARLIEST stage (still-scoring beats done), and the continue
 * route walks front9's next hole → back9's next hole → the back9 deliver host.
 */

function extras(
  state: ActiveCardState,
  nextHole: number | null,
  pending = 0,
): ActiveCardExtras {
  return { state, href: 'ignored', pendingApprovalsForMe: pending, nextHole };
}

describe('mergePairState', () => {
  const cases: [ActiveCardState, ActiveCardState, ActiveCardState][] = [
    ['continue', 'continue', 'continue'],
    ['continue', 'submitted', 'continue'],
    ['submitted', 'continue', 'continue'],
    ['pending_approval', 'submitted', 'pending_approval'],
    ['submitted', 'pending_approval', 'pending_approval'],
    ['submitted', 'submitted', 'submitted'],
    ['withdrawn', 'withdrawn', 'withdrawn'],
    ['continue', 'withdrawn', 'continue'],
  ];
  it.each(cases)('front9=%s + back9=%s → %s', (f, b, expected) => {
    expect(mergePairState(f, b)).toBe(expected);
  });
});

describe('mergePairExtras', () => {
  it('front9 still scoring → routes into front9 at its next hole', () => {
    const merged = mergePairExtras(
      { id: 'f', extras: extras('continue', 4) },
      { id: 'b', extras: extras('continue', null) },
    );
    expect(merged.state).toBe('continue');
    expect(merged.href).toBe('/games/f/holes/4');
  });

  it('front9 fully scored, back9 still scoring → routes into back9 at its next hole', () => {
    const merged = mergePairExtras(
      { id: 'f', extras: extras('continue', null) },
      { id: 'b', extras: extras('continue', 13) },
    );
    expect(merged.state).toBe('continue');
    expect(merged.href).toBe('/games/b/holes/13');
  });

  it('all 18 scored, nothing delivered → deliver on the back9 host (one delivery, #1466)', () => {
    const merged = mergePairExtras(
      { id: 'f', extras: extras('continue', null) },
      { id: 'b', extras: extras('continue', null) },
    );
    expect(merged.state).toBe('continue');
    expect(merged.href).toBe('/games/b');
  });

  it('delivered / awaiting approval → the pair card lands on the back9 host home', () => {
    const merged = mergePairExtras(
      { id: 'f', extras: extras('submitted', null) },
      { id: 'b', extras: extras('pending_approval', null) },
    );
    expect(merged.state).toBe('pending_approval');
    expect(merged.href).toBe('/games/b');
  });

  it('sums pending approvals across both halves', () => {
    const merged = mergePairExtras(
      { id: 'f', extras: extras('submitted', null, 1) },
      { id: 'b', extras: extras('pending_approval', null, 2) },
    );
    expect(merged.pendingApprovalsForMe).toBe(3);
  });
});
