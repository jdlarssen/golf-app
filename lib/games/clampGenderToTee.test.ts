import { describe, it, expect } from 'vitest';
import { clampGenderToTee } from './clampGenderToTee';

// Cases moved verbatim from `useGameFormState.test.ts` (AC3) when the helper was
// lifted out of the web wizard hook, plus the all-false boundary the hook never
// hit: a tee with no rating at all must still yield a value, not an empty one.
describe('clampGenderToTee', () => {
  it.each([
    // g, avail, expected
    ['J', { M: true, D: false, J: false }, 'M'], // junior på herre-only → M
    ['D', { M: true, D: false, J: true }, 'M'], // dame utilgjengelig, første tilgjengelige er M
    ['M', { M: true, D: true, J: true }, 'M'], // M tilgjengelig → uendret
    ['J', { M: true, D: true, J: true }, 'J'], // J tilgjengelig → uendret
    ['D', { M: false, D: true, J: true }, 'D'], // D tilgjengelig → uendret
    ['J', { M: false, D: true, J: false }, 'D'], // J utilgjengelig, M utilgjengelig → D
    ['D', { M: false, D: false, J: false }, 'D'], // ingen rating → verdien selv, aldri tom
  ] as const)('%s på avail=%o → %s', (g, avail, expected) => {
    expect(clampGenderToTee(g, avail)).toBe(expected);
  });
});
