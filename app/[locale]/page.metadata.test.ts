import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from './page';
import noMessages from '@/messages/no.json';

/**
 * #2562, Type B: the front page's <title>. With the app out it says «i appen
 * eller på nettet» instead of «i nettleseren»; with the switch off it is the
 * title search has today.
 */
describe('front page metadata', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [undefined, noMessages.landing.metaTitle],
    ['ios', noMessages.landing.metaTitleLaunched],
    ['on', noMessages.landing.metaTitleLaunched],
  ])('title with %s', async (flag, expected) => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', flag);
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: 'no' }),
    });
    expect(meta.title).toEqual({ absolute: expected });
  });
});
