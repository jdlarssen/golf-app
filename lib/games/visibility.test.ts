import { describe, it, expect } from 'vitest';
import { revealState, shouldHideNetto } from './visibility';

describe('revealState', () => {
  it('returns live-always for live visibility in any status', () => {
    expect(revealState('live', 'draft')).toBe('live-always');
    expect(revealState('live', 'scheduled')).toBe('live-always');
    expect(revealState('live', 'active')).toBe('live-always');
    expect(revealState('live', 'finished')).toBe('live-always');
  });

  it('returns reveal-active for reveal visibility while game is not finished', () => {
    expect(revealState('reveal', 'draft')).toBe('reveal-active');
    expect(revealState('reveal', 'scheduled')).toBe('reveal-active');
    expect(revealState('reveal', 'active')).toBe('reveal-active');
  });

  it('returns reveal-finished for reveal visibility when game is finished', () => {
    expect(revealState('reveal', 'finished')).toBe('reveal-finished');
  });
});

describe('shouldHideNetto', () => {
  it('hides netto only in reveal-active state', () => {
    expect(shouldHideNetto('live-always')).toBe(false);
    expect(shouldHideNetto('reveal-active')).toBe(true);
    expect(shouldHideNetto('reveal-finished')).toBe(false);
  });
});
