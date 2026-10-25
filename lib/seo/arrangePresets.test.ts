/**
 * Type-A tests for the guides' recommended setups (#2331).
 */

import { describe, expect, it } from 'vitest';
import { ARRANGE_AUDIENCES } from './arrangeAudiences';
import { ARRANGE_PRESETS, parseArrangePreset } from './arrangePresets';
import { teamSizesForMode } from '@/lib/games/teamFormatLimits';
import { isSoloFormat } from '@/lib/scoring/modes/types';

describe('ARRANGE_PRESETS', () => {
  it('every audience has a setup', () => {
    for (const audience of ARRANGE_AUDIENCES) {
      expect(ARRANGE_PRESETS[audience]).toBeDefined();
    }
  });

  it('every team size is one the format can be played with', () => {
    for (const audience of ARRANGE_AUDIENCES) {
      const { gameMode, teamSize } = ARRANGE_PRESETS[audience];
      expect(
        teamSizesForMode(gameMode).includes(teamSize) || isSoloFormat(gameMode, teamSize),
        `${audience}: ${gameMode} with ${teamSize}`,
      ).toBe(true);
    }
  });
});

describe('parseArrangePreset', () => {
  it('accepts the three audiences', () => {
    expect(parseArrangePreset('firmagolf')).toBe('firmagolf');
    expect(parseArrangePreset('vennegjeng')).toBe('vennegjeng');
    expect(parseArrangePreset('klubbkveld')).toBe('klubbkveld');
  });

  it('rejects unknown, empty and missing values', () => {
    expect(parseArrangePreset('tull')).toBeUndefined();
    expect(parseArrangePreset('FIRMAGOLF')).toBeUndefined();
    expect(parseArrangePreset('')).toBeUndefined();
    expect(parseArrangePreset(undefined)).toBeUndefined();
  });
});
