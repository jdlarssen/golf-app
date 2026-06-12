import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock `next/root-params` so each test can control whether the render-phase
// read succeeds (Server Component) or throws E1014 (Server Action) — see
// node_modules/next/dist/server/request/root-params.js.
const rootLocaleMock = vi.fn<() => Promise<string>>();
vi.mock('next/root-params', () => ({
  locale: () => rootLocaleMock(),
}));

// `getRequestConfig` is an identity wrapper (returns the callback as-is), but
// the react-client build vitest resolves to throws on import — stub it.
vi.mock('next-intl/server', () => ({
  getRequestConfig: (fn: unknown) => fn,
}));

import getConfig from './request';

function serverActionRootParamsError(): Error {
  const err = new Error(
    "`import('next/root-params').locale()` was used inside a Server Action. This is not supported. Functions from 'next/root-params' can only be called in the context of a route.",
  );
  Object.defineProperty(err, '__NEXT_ERROR_CODE', { value: 'E1014' });
  return err;
}

const noopGetConfigParams = {
  locale: undefined,
  requestLocale: Promise.resolve<string | undefined>(undefined),
};

describe('i18n request config locale resolution', () => {
  beforeEach(() => {
    rootLocaleMock.mockReset();
  });

  it('reads the [locale] root param during render', async () => {
    rootLocaleMock.mockResolvedValue('en');
    const config = await getConfig(noopGetConfigParams);
    expect(config.locale).toBe('en');
  });

  it('falls back to requestLocale when root params throw in a Server Action (E1014)', async () => {
    rootLocaleMock.mockRejectedValue(serverActionRootParamsError());
    const config = await getConfig({
      locale: undefined,
      requestLocale: Promise.resolve('en'),
    });
    expect(config.locale).toBe('en');
  });

  it('falls back to the default locale when neither source resolves', async () => {
    rootLocaleMock.mockRejectedValue(serverActionRootParamsError());
    const config = await getConfig(noopGetConfigParams);
    expect(config.locale).toBe('no');
  });

  it('rejects unsupported locales from the root param', async () => {
    rootLocaleMock.mockResolvedValue('sv');
    const config = await getConfig(noopGetConfigParams);
    expect(config.locale).toBe('no');
  });
});
