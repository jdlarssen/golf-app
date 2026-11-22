// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { LATEST_APP_BUILD } from '@/lib/app/latestBuild';
import { MIN_APP_VERSION } from '@/lib/app/minVersion';
import { GET } from './route';

/**
 * Type A (#2619, #2975): the route serves the shared constants as JSON with the cache
 * header the app relies on. No auth is read, so a bare call is the whole test.
 */
describe('GET /api/app/min-version', () => {
  it('returns the minimum and the latest build per platform', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ios: {
        minBuild: MIN_APP_VERSION.ios.minBuild,
        latestBuild: LATEST_APP_BUILD.ios.latestBuild,
        latestVersion: LATEST_APP_BUILD.ios.latestVersion,
        notes: [...LATEST_APP_BUILD.ios.notes],
      },
      android: {
        minVersionCode: MIN_APP_VERSION.android.minVersionCode,
        latestVersionCode: LATEST_APP_BUILD.android.latestVersionCode,
        latestVersion: LATEST_APP_BUILD.android.latestVersion,
        notes: [...LATEST_APP_BUILD.android.notes],
      },
    });
  });

  it('is cacheable for five minutes and public', () => {
    expect(GET().headers.get('cache-control')).toBe('public, max-age=300');
  });
});
