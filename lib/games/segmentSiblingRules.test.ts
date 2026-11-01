import { describe, it, expect } from 'vitest';
import { isBroModus, type SegmentSibling } from './segmentSiblingRules';

// Type A per docs/test-discipline.md: the one rule web and app share for when
// a first half delivers nothing and bridges to hole 10 instead (#1466, #2752).
const sibling = (mySubmittedAt: string | null): SegmentSibling => ({
  gameId: 'back9-host',
  gameMode: 'best_ball',
  holeSegment: 'back9',
  mySubmittedAt,
  myTeamNumber: 1,
});

describe('isBroModus', () => {
  it('true on a front9 host while my back9 card is undelivered', () => {
    expect(isBroModus('front9', sibling(null))).toBe(true);
  });

  it('false once the back9 card is delivered, so a rejected front9 card can be delivered again', () => {
    expect(isBroModus('front9', sibling('2026-11-01T10:00:00Z'))).toBe(false);
  });

  it('false without a sibling: resolving nothing leaves the normal deliver button', () => {
    expect(isBroModus('front9', null)).toBe(false);
  });

  it('false on a back9 host: the round is delivered there', () => {
    expect(isBroModus('back9', sibling(null))).toBe(false);
  });

  it('false on a full game', () => {
    expect(isBroModus('full', null)).toBe(false);
  });
});
