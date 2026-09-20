import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSharePng } from './useSharePng';

/**
 * Del-hooken (#2130). Den bærer to ting som har kostet oss noe før: selv-gatingen
 * (404 ⇒ ingen knapp, #942) og nedlastingen som reserve når Web Share ikke tar
 * filer. Begge testes her, sammen med utfallet kallstedet logger på.
 */

function pngResponse(): Response {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
  } as unknown as Response;
}

function notFound(): Response {
  return {
    ok: false,
    headers: new Headers({ 'content-type': 'text/plain' }),
    blob: async () => new Blob([]),
  } as unknown as Response;
}

type ShareNavigator = Navigator & {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
};

const nav = () => navigator as ShareNavigator;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:torny');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete nav().share;
  delete nav().canShare;
});

const options = {
  fileName: 'torny-kort.png',
  shareText: 'Se kavalkaden min på tornygolf.no',
};

describe('useSharePng — henting og gating', () => {
  it('blir klar når ruta svarer med en PNG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pngResponse()));
    const { result } = renderHook(() =>
      useSharePng({ imageUrl: '/kavalkade/2026/card/team', ...options }),
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(fetch).toHaveBeenCalledWith('/kavalkade/2026/card/team');
  });

  it('blir aldri klar når ruta svarer 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound()));
    const { result } = renderHook(() =>
      useSharePng({ imageUrl: '/kavalkade/2026/card/rival', ...options }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
  });

  it('blir aldri klar når svaret ikke er et bilde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        blob: async () => new Blob(['<html>']),
      })),
    );
    const { result } = renderHook(() =>
      useSharePng({ imageUrl: '/kavalkade/2026/card/gang', ...options }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
  });

  it('henter ingenting før adressen er kjent', () => {
    vi.stubGlobal('fetch', vi.fn(async () => pngResponse()));
    renderHook(() => useSharePng({ imageUrl: null, ...options }));

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('useSharePng — deling', () => {
  async function readyHook(onShared?: (o: 'shared' | 'downloaded') => void) {
    vi.stubGlobal('fetch', vi.fn(async () => pngResponse()));
    const hook = renderHook(() =>
      useSharePng({ imageUrl: '/kavalkade/2026/card/best-round', ...options, onShared }),
    );
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    return hook;
  }

  it('deler filen via Web Share og melder fra', async () => {
    const share = vi.fn(async () => {});
    nav().canShare = () => true;
    nav().share = share;
    const onShared = vi.fn();

    const { result } = await readyHook(onShared);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.share();
    });

    expect(outcome).toBe('shared');
    expect(onShared).toHaveBeenCalledWith('shared');
    const data = share.mock.calls[0][0] as unknown as ShareData & { files: File[] };
    expect(data.files[0].name).toBe('torny-kort.png');
    expect(data.text).toContain('tornygolf.no');
  });

  it('teller ikke en deling spilleren avbrøt', async () => {
    nav().canShare = () => true;
    nav().share = vi.fn(async () => {
      throw Object.assign(new Error('avbrutt'), { name: 'AbortError' });
    });
    const onShared = vi.fn();

    const { result } = await readyHook(onShared);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.share();
    });

    expect(outcome).toBe('dismissed');
    expect(onShared).not.toHaveBeenCalled();
  });

  it('laster ned når Web Share ikke tar filer, og melder fra', async () => {
    const onShared = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { result } = await readyHook(onShared);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.share();
    });

    expect(outcome).toBe('downloaded');
    expect(click).toHaveBeenCalled();
    expect(onShared).toHaveBeenCalledWith('downloaded');
  });

  it('faller tilbake til nedlasting når delingen feiler av en annen grunn', async () => {
    nav().canShare = () => true;
    nav().share = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const onShared = vi.fn();

    const { result } = await readyHook(onShared);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.share();
    });

    expect(outcome).toBe('downloaded');
    expect(click).toHaveBeenCalled();
    expect(onShared).toHaveBeenCalledWith('downloaded');
  });

  it('gjør ingenting før bildet er hentet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound()));
    const { result } = renderHook(() =>
      useSharePng({ imageUrl: '/kavalkade/2026/card/team', ...options }),
    );

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.share();
    });
    expect(outcome).toBe('not-ready');
  });

  it('lar en feilende del-logging passere uten å velte delingen', async () => {
    nav().canShare = () => true;
    nav().share = vi.fn(async () => {});

    const { result } = await readyHook(() => {
      throw new Error('server-action nede');
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.share();
    });

    expect(outcome).toBe('shared');
  });
});
