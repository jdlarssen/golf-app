import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

/**
 * Type A (#1350) — the service worker's routing decisions are pure logic:
 * "which document do we hand back for which route, online and offline?".
 *
 * `public/sw.js` is a classic (non-bundled) worker script, so the logic cannot
 * be imported as a module — and duplicating it into one would give the rule two
 * homes (AGENTS.md trap 4). The only honest test is to execute the real source
 * inside a stubbed ServiceWorkerGlobalScope and assert what comes back.
 *
 * The security invariant at the top of sw.js (#819) is what most of these
 * assertions guard: no authenticated/personal HTML may ever be written to the
 * cache, and the offline fallback must never be another user's page.
 */

const ORIGIN = 'https://tornygolf.no';

interface FakeResponse {
  tag: string;
  clone(): FakeResponse;
}

function makeResponse(tag: string): FakeResponse {
  return { tag, clone: () => makeResponse(tag) };
}

/** The real Cache API keys on absolute URLs; normalize so '/' === ORIGIN + '/'. */
function absolute(key: string | { url: string }): string {
  return new URL(typeof key === 'string' ? key : key.url, ORIGIN).href;
}

function bootSw() {
  const src = readFileSync(
    path.resolve(__dirname, '../../public/sw.js'),
    'utf8',
  );

  const listeners: Record<string, (event: unknown) => unknown> = {};
  const store = new Map<string, FakeResponse>();

  const put = vi.fn(async (req: { url: string }, res: FakeResponse) => {
    store.set(absolute(req), res);
  });
  const addAll = vi.fn(async (urls: string[]) => {
    for (const url of urls) store.set(absolute(url), makeResponse(url));
  });
  const cache = {
    match: async (key: string | { url: string }) => store.get(absolute(key)),
    put,
    addAll,
    keys: async () => [],
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };

  // Default: offline. Tests that need a live network swap this in.
  let fetchImpl: () => Promise<FakeResponse> = async () => {
    throw new TypeError('Failed to fetch');
  };

  const self = {
    addEventListener: (type: string, fn: (event: unknown) => unknown) => {
      listeners[type] = fn;
    },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []) },
    registration: { showNotification: vi.fn(async () => {}) },
  };

  const factory = new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    'URL',
    'console',
    src,
  );
  factory(
    self,
    caches,
    () => fetchImpl(),
    { error: () => makeResponse('network-error') },
    URL,
    console,
  );

  return {
    listeners,
    store,
    put,
    addAll,
    self,
    /** Pre-populate the runtime cache, as an earlier online visit would have. */
    seed(pathname: string, tag = pathname) {
      store.set(absolute(pathname), makeResponse(tag));
    },
    online(tag = 'fresh') {
      fetchImpl = async () => makeResponse(tag);
    },
    async navigate(pathname: string): Promise<FakeResponse> {
      const request = {
        url: absolute(pathname),
        method: 'GET',
        mode: 'navigate',
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'accept' ? 'text/html' : null,
        },
      };
      let responded: Promise<FakeResponse> | undefined;
      listeners.fetch({
        request,
        respondWith: (value: Promise<FakeResponse>) => {
          responded = value;
        },
      });
      if (!responded) throw new Error('fetch handler did not respond');
      return responded;
    },
    async install(): Promise<void> {
      const pending: Promise<unknown>[] = [];
      listeners.install({
        waitUntil: (value: Promise<unknown>) => pending.push(value),
      });
      await Promise.all(pending);
    },
  };
}

const HOLE_PATH = '/games/11111111-1111-1111-1111-111111111111/holes/6';

describe('sw.js — navigation routing', () => {
  it('serves the neutral offline document — never the cached home page — for an offline hole navigation', async () => {
    const sw = bootSw();
    // The home page is personalized since #1265, so its presence in the cache
    // is exactly what must NOT leak onto another route.
    sw.seed('/', 'home-document');
    sw.seed('/offline.html');
    sw.seed('/offline-en.html');

    const res = await sw.navigate(HOLE_PATH);

    expect(res.tag).toBe('/offline.html');
  });

  it('serves the English offline document under /en', async () => {
    const sw = bootSw();
    sw.seed('/');
    sw.seed('/offline.html');
    sw.seed('/offline-en.html');

    const res = await sw.navigate(`/en${HOLE_PATH}`);

    expect(res.tag).toBe('/offline-en.html');
  });

  it('never caches authenticated HTML (#819)', async () => {
    const sw = bootSw();
    sw.online('game-html');

    const res = await sw.navigate(HOLE_PATH);

    expect(res.tag).toBe('game-html');
    expect(sw.put).not.toHaveBeenCalled();
  });

  it('caches allowlisted public shell routes', async () => {
    const sw = bootSw();
    sw.online('privacy-html');

    await sw.navigate('/legal/privacy');

    expect(sw.put).toHaveBeenCalledTimes(1);
  });

  it('does not cache the root route — it renders the personalized home page (#1265)', async () => {
    const sw = bootSw();
    sw.online('home-html');

    await sw.navigate('/');

    expect(sw.put).not.toHaveBeenCalled();
  });

  it.each(['/finn-turneringer', '/spillformater', '/en/finn-turneringer'])(
    'does not cache %s — auth-optional routes render signed-in chrome (#1265 class)',
    async (path) => {
      const sw = bootSw();
      sw.online('auth-optional-html');

      await sw.navigate(path);

      expect(sw.put).not.toHaveBeenCalled();
    },
  );

  it('precaches both offline documents on install', async () => {
    const sw = bootSw();

    await sw.install();

    expect(sw.addAll).toHaveBeenCalledWith(['/offline.html', '/offline-en.html']);
  });
});

describe('sw.js — offline documents', () => {
  // The copy lives in two standalone HTML files instead of messages/*.json
  // (they must render with zero cached /_next chunks), so nothing else stops
  // the English one from being forgotten or drifting. This is that guard.
  it.each([
    ['offline.html', 'Du er uten nett'],
    ['offline-en.html', "You're offline"],
  ])('public/%s carries its heading and retry target', (file, heading) => {
    const html = readFileSync(
      path.resolve(__dirname, '../../public', file),
      'utf8',
    );

    expect(html).toContain(heading);
    expect(html).toContain('data-testid="offline-retry"');
    expect(html).toContain('data-testid="offline-fallback"');
  });
});
