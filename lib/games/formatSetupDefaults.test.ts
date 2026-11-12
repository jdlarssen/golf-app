import { describe, expect, it } from 'vitest';
import { ambroseDefaultPct } from '@/lib/scoring/modes/ambrose';
import { defaultFloridaHandicapPct } from '@/lib/scoring/modes/floridaScramble';
import {
  DEFAULT_SHAMBLE_SETUP,
  defaultTeamHandicapPct,
  defaultTeamSizeForMode,
  defaultTexasHandicapPct,
} from './formatSetupDefaults';

/** Type A (#2753): the wizard defaults the web and the app share. */
describe('formatSetupDefaults', () => {
  it.each([
    ['texas_scramble', 4],
    ['ambrose', 4],
    ['florida_scramble', 3],
    ['shamble', 4],
    ['patsome', 2],
    ['solo_strokeplay', 1],
  ] as const)('%s starter på lag à %i', (mode, size) => {
    expect(defaultTeamSizeForMode(mode)).toBe(size);
  });

  it('Texas følger NGF: 25, 15 og 10 % av summen for 2, 3 og 4', () => {
    expect([2, 3, 4].map((n) => defaultTexasHandicapPct(n as 2 | 3 | 4))).toEqual([25, 15, 10]);
  });

  it('lag-handicapet per format er formatets egen standard', () => {
    expect(defaultTeamHandicapPct('texas_scramble', 4)).toBe(10);
    expect(defaultTeamHandicapPct('ambrose', 3)).toBe(ambroseDefaultPct(3));
    expect(defaultTeamHandicapPct('florida_scramble', 3)).toBe(defaultFloridaHandicapPct(3));
    expect(defaultTeamHandicapPct('shamble', 4)).toBeNull();
  });

  it('shamble starter som shamble, to teller, netto', () => {
    expect(DEFAULT_SHAMBLE_SETUP).toEqual({ variant: 'shamble', count: 2, scoring: 'net' });
  });
});
