import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSlugGuard, fetchPublicCourseSlugManifest } from './slugGuard';

const ORIGIN = 'https://tornygolf.no';

describe('createSlugGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks an unknown slug after a fresh fetch', async () => {
    const fetchSlugs = vi.fn().mockResolvedValue(['bogstad', 'oslo-gk']);
    const guard = createSlugGuard({ fetchSlugs });

    await expect(guard.shouldBlock('finnes-ikke', ORIGIN)).resolves.toBe(
      true,
    );
    expect(fetchSlugs).toHaveBeenCalledTimes(1);
    expect(fetchSlugs).toHaveBeenCalledWith(ORIGIN);
  });

  it('passes a known slug through on the first (uncached) check', async () => {
    const fetchSlugs = vi.fn().mockResolvedValue(['bogstad', 'oslo-gk']);
    const guard = createSlugGuard({ fetchSlugs });

    await expect(guard.shouldBlock('bogstad', ORIGIN)).resolves.toBe(false);
  });

  it('serves a repeat check for a known slug from cache without refetching', async () => {
    const fetchSlugs = vi.fn().mockResolvedValue(['bogstad']);
    const guard = createSlugGuard({ fetchSlugs });

    await guard.shouldBlock('bogstad', ORIGIN);
    await guard.shouldBlock('bogstad', ORIGIN);

    expect(fetchSlugs).toHaveBeenCalledTimes(1);
  });

  it('re-fetches before blocking a slug missing from cache once the miss-window lapses (newly published course)', async () => {
    let currentTime = 0;
    const fetchSlugs = vi
      .fn()
      .mockResolvedValueOnce(['bogstad'])
      .mockResolvedValueOnce(['bogstad', 'ny-bane']);
    const guard = createSlugGuard({
      fetchSlugs,
      ttlMs: 60_000,
      missTtlMs: 1000,
      now: () => currentTime,
    });

    await guard.shouldBlock('bogstad', ORIGIN); // populerer cache uten 'ny-bane'

    currentTime = 1500; // utenfor miss-vinduet, godt innenfor TTL
    await expect(guard.shouldBlock('ny-bane', ORIGIN)).resolves.toBe(false);

    expect(fetchSlugs).toHaveBeenCalledTimes(2);
  });

  it('answers repeated misses from a recent manifest without refetching (negative cache)', async () => {
    let currentTime = 0;
    const fetchSlugs = vi.fn().mockResolvedValue(['bogstad']);
    const guard = createSlugGuard({
      fetchSlugs,
      ttlMs: 60_000,
      missTtlMs: 1000,
      now: () => currentTime,
    });

    await expect(guard.shouldBlock('finnes-ikke', ORIGIN)).resolves.toBe(true);
    expect(fetchSlugs).toHaveBeenCalledTimes(1);

    currentTime = 500; // innenfor miss-vinduet: ingen ny fetch per ukjent slug
    await expect(guard.shouldBlock('finnes-ikke', ORIGIN)).resolves.toBe(true);
    await expect(guard.shouldBlock('heller-ikke', ORIGIN)).resolves.toBe(true);
    expect(fetchSlugs).toHaveBeenCalledTimes(1);

    currentTime = 1500; // vinduet utløpt → neste bom henter ferskt manifest
    await expect(guard.shouldBlock('finnes-ikke', ORIGIN)).resolves.toBe(true);
    expect(fetchSlugs).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent misses into a single manifest fetch', async () => {
    let resolveManifest!: (slugs: string[]) => void;
    const fetchSlugs = vi.fn().mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveManifest = resolve;
        }),
    );
    const guard = createSlugGuard({ fetchSlugs });

    const first = guard.shouldBlock('finnes-ikke', ORIGIN);
    const second = guard.shouldBlock('bogstad', ORIGIN);
    resolveManifest(['bogstad']);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(fetchSlugs).toHaveBeenCalledTimes(1);
  });

  it('keeps passing an unpublished slug through until the cache expires', async () => {
    let currentTime = 0;
    const fetchSlugs = vi
      .fn()
      .mockResolvedValueOnce(['bogstad'])
      .mockResolvedValueOnce([]); // banen fjernet fra manifestet i mellomtiden
    const guard = createSlugGuard({
      fetchSlugs,
      ttlMs: 1000,
      now: () => currentTime,
    });

    await guard.shouldBlock('bogstad', ORIGIN); // cacher 'bogstad' ved t=0

    currentTime = 500; // fortsatt innenfor TTL
    await expect(guard.shouldBlock('bogstad', ORIGIN)).resolves.toBe(false);
    expect(fetchSlugs).toHaveBeenCalledTimes(1); // rask sti, ingen refetch

    currentTime = 1500; // cache nå utløpt
    await expect(guard.shouldBlock('bogstad', ORIGIN)).resolves.toBe(true);
    expect(fetchSlugs).toHaveBeenCalledTimes(2);
  });

  it('fails open (and logs) when the manifest fetch throws', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const fetchSlugs = vi.fn().mockRejectedValue(new Error('network error'));
    const guard = createSlugGuard({ fetchSlugs });

    await expect(guard.shouldBlock('anything', ORIGIN)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[slugGuard]'),
      expect.any(Error),
    );
  });

  it('retries the fetch on the next check instead of caching a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchSlugs = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(['bogstad']);
    const guard = createSlugGuard({ fetchSlugs });

    await expect(guard.shouldBlock('bogstad', ORIGIN)).resolves.toBe(false); // fail-open
    await expect(guard.shouldBlock('bogstad', ORIGIN)).resolves.toBe(false); // nå bekreftet gyldig

    expect(fetchSlugs).toHaveBeenCalledTimes(2);
  });
});

describe('fetchPublicCourseSlugManifest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the internal manifest endpoint and returns its slugs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slugs: ['bogstad', 'oslo-gk'] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicCourseSlugManifest(ORIGIN)).resolves.toEqual([
      'bogstad',
      'oslo-gk',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ORIGIN}/api/public-course-slugs`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 500 })),
    );

    await expect(fetchPublicCourseSlugManifest(ORIGIN)).rejects.toThrow();
  });

  it('throws on a malformed manifest body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ slugs: 'not-an-array' }), {
          status: 200,
        }),
      ),
    );

    await expect(fetchPublicCourseSlugManifest(ORIGIN)).rejects.toThrow();
  });

  it('throws when manifest elements are not strings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ slugs: [1, 2] }), { status: 200 }),
      ),
    );

    await expect(fetchPublicCourseSlugManifest(ORIGIN)).rejects.toThrow();
  });
});
