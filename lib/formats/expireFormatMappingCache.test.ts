import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from 'next/cache';
import { expireFormatMappingCache } from './expireFormatMappingCache';

/**
 * #2336: a change in Format-styring expires the wizard's format list at once.
 * The sweep that keeps every caller on this helper lives in
 * `lib/games/expireGameCache.test.ts`, next to the game/cup rule.
 */
describe('expireFormatMappingCache', () => {
  beforeEach(() => vi.mocked(revalidateTag).mockClear());

  it('expires the format tag immediately', () => {
    expireFormatMappingCache();
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('format-mapping', {
      expire: 0,
    });
  });
});
