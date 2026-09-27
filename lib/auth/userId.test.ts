import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// next/headers is the system boundary: the test hands the helper the request
// headers the proxy would have forwarded.
let requestHeaders = new Headers();
vi.mock('next/headers', () => ({
  headers: async () => requestHeaders,
}));

import { getProxyVerifiedUserId } from './userId';
import {
  clearVerifiedUser,
  readVerifiedUserId,
  setVerifiedUser,
} from './proxyIdentity';

beforeEach(() => {
  requestHeaders = new Headers();
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-proxy-identity-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getProxyVerifiedUserId', () => {
  it("a bare x-torny-user-id without the proxy's signature returns null", async () => {
    requestHeaders.set('x-torny-user-id', 'u1');
    expect(await getProxyVerifiedUserId()).toBeNull();
  });

  it('returns the user id the proxy signed', async () => {
    setVerifiedUser(requestHeaders, 'u1');
    expect(await getProxyVerifiedUserId()).toBe('u1');
  });
});

describe('proxyIdentity', () => {
  it('setVerifiedUser → readVerifiedUserId round-trips the id', () => {
    const h = new Headers();
    setVerifiedUser(h, 'u1');
    expect(readVerifiedUserId(h)).toBe('u1');
  });

  it.each([
    [
      'a signature made for another id',
      (h: Headers) => {
        const other = new Headers();
        setVerifiedUser(other, 'u2');
        h.set('x-torny-user-id', 'u1');
        h.set('x-torny-user-sig', other.get('x-torny-user-sig')!);
      },
    ],
    [
      'a truncated signature',
      (h: Headers) => {
        setVerifiedUser(h, 'u1');
        h.set('x-torny-user-sig', h.get('x-torny-user-sig')!.slice(0, -1));
      },
    ],
    [
      'a signature without an id',
      (h: Headers) => {
        setVerifiedUser(h, 'u1');
        h.delete('x-torny-user-id');
      },
    ],
    [
      'headers after clearVerifiedUser',
      (h: Headers) => {
        setVerifiedUser(h, 'u1');
        clearVerifiedUser(h);
      },
    ],
  ])('%s reads as null', (_label, arrange) => {
    const h = new Headers();
    arrange(h);
    expect(readVerifiedUserId(h)).toBeNull();
  });

  it('without a signing key, setVerifiedUser logs and sets nothing, and reads are null', () => {
    const signed = new Headers();
    setVerifiedUser(signed, 'u1');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const unsigned = new Headers();
    setVerifiedUser(unsigned, 'u1');

    expect(error).toHaveBeenCalledTimes(1);
    expect([...unsigned.keys()]).toEqual([]);
    expect(readVerifiedUserId(unsigned)).toBeNull();
    // A pair signed while the key existed does not read back once it is gone.
    expect(readVerifiedUserId(signed)).toBeNull();
  });
});
