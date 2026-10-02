import { describe, expect, it } from 'vitest';
import { fitNamePx } from './InvitationPreviewCard';

// Type A (docs/test-discipline.md): the name in the «Klar?» card is never
// clipped (#2282). It keeps 26 px when it fits, shrinks in half pixels to fit
// one line, and stops at 18 px (below that the field wraps instead).
describe('fitNamePx', () => {
  it.each<[string, number, number, number]>([
    ['fits at 26 px', 200, 289, 26],
    ['exactly fits', 289, 289, 26],
    ['a little too wide shrinks', 330, 289, 22.5],
    ['much too wide stops at 18 px', 600, 289, 18],
    ['not measured yet (0 width) stays 26 px', 0, 289, 26],
    ['field without width stays 26 px', 300, 0, 26],
  ])('%s', (_label, textWidth, available, expected) => {
    expect(fitNamePx(textWidth, available)).toBe(expected);
  });
});
