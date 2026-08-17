import { describe, it, expect } from 'vitest';

import { shouldMountGlobalSyncBanner } from './globalMount';

/**
 * Type A — the route policy behind the global SyncBanner mount (#1391). Pure
 * string in, boolean out, so every case is enumerated here and never
 * re-asserted through a render.
 */
describe('shouldMountGlobalSyncBanner', () => {
  it.each([
    ['/games/g1/holes/3', false],
    ['/games/g1', false],
    ['/games/g1/leaderboard', false],
  ] as const)('%s → %s (the round layout owns its own banner)', (path, expected) => {
    expect(shouldMountGlobalSyncBanner(path)).toBe(expected);
  });

  it.each([
    [null, true],
    ['', true],
    ['/', true],
    ['/innboks', true],
    ['/klubbhuset', true],
    ['/profile', true],
    ['/admin', true],
    ['/games', true],
    ['/gamesomething', true],
  ] as const)('%s → %s', (path, expected) => {
    expect(shouldMountGlobalSyncBanner(path)).toBe(expected);
  });
});
