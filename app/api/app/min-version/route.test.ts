// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { MIN_APP_VERSION } from '@/lib/app/minVersion';
import { GET } from './route';

/**
 * Type A (#2619): the route serves the shared constant as JSON with the cache
 * header the app relies on. No auth is read, so a bare call is the whole test.
 */
describe('GET /api/app/min-version', () => {
  it('returns the minimum build per platform', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ios: { minBuild: MIN_APP_VERSION.ios.minBuild },
      android: { minVersionCode: MIN_APP_VERSION.android.minVersionCode },
    });
  });

  it('is cacheable for five minutes and public', () => {
    expect(GET().headers.get('cache-control')).toBe('public, max-age=300');
  });
});
