import { describe, it, expect } from 'vitest';
import { previewHcp } from './profilePreview';

/**
 * #2350: «Slik ser de andre deg» shows the handicap the way others will see
 * it, or nothing while the typed value would be refused. Same rows as the
 * app's `onboardingPreviewHcp` (`native/app/src/lib/profileCopy.test.ts`), so
 * the two surfaces agree on what is valid.
 */
describe('previewHcp', () => {
  it.each<[string, boolean, string | null]>([
    ['18,4', false, '18,4'],
    ['18.4', false, '18,4'],
    ['54', false, '54,0'],
    ['2,5', true, '+2,5'],
    ['0', true, '0,0'],
    ['', false, null],
    ['  ', false, null],
    ['abc', false, null],
    ['54,1', false, null],
    ['10,5', true, null],
    ['+10,5', false, null],
    ['-3', false, null],
  ])('«%s» (plus: %s) → %s', (typed, isPlus, expected) => {
    expect(previewHcp(typed, isPlus, 'no')).toBe(expected);
  });

  it('uses the locale decimal separator', () => {
    expect(previewHcp('18,4', false, 'en')).toBe('18.4');
  });
});
