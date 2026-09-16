import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOOP_REPO, type GitHubClient } from './discordActions';
import {
  LAUNCH_BOARD_ISSUE,
  launchMarkerBody,
  postLaunchMarker,
  stampLaunchBoard,
} from './launchMarker';

function ghReturning(status: number) {
  const rest = vi.fn(async () => ({ status, json: null }));
  const gh: GitHubClient = { rest, graphql: vi.fn() };
  return { gh, rest };
}

describe('launchMarkerBody', () => {
  it('gir det eksakte formatet Utroperen leser', () => {
    expect(launchMarkerBody('Premiebord', new Date('2026-09-10T08:00:00Z'))).toBe(
      '✅ Publisert: Premiebord — 2026-09-10',
    );
  });
});

describe('postLaunchMarker', () => {
  it('201 → ok, poster markøren på oppgitt issue', async () => {
    const { gh, rest } = ghReturning(201);
    expect(await postLaunchMarker(gh, 1208, 'Premiebord')).toEqual({ ok: true });
    expect(rest).toHaveBeenCalledWith('POST', `/repos/${LOOP_REPO}/issues/1208/comments`, {
      body: expect.stringMatching(/^✅ Publisert: Premiebord — \d{4}-\d{2}-\d{2}$/),
    });
  });

  it('ikke-201 → http med status', async () => {
    const { gh } = ghReturning(403);
    expect(await postLaunchMarker(gh, 1208, 'T')).toEqual({
      ok: false,
      reason: 'http',
      status: 403,
    });
  });

  it('kast → network, kaster aldri videre', async () => {
    const gh: GitHubClient = {
      rest: vi.fn(async () => {
        throw new Error('fetch failed');
      }),
      graphql: vi.fn(),
    };
    expect(await postLaunchMarker(gh, 1208, 'T')).toEqual({ ok: false, reason: 'network' });
  });
});

describe('stampLaunchBoard', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([['preview'], ['development'], [undefined]])(
    'VERCEL_ENV=%s → ingen fetch',
    async (env) => {
      vi.stubEnv('VERCEL_ENV', env as string);
      vi.stubEnv('GITHUB_LOOP_PAT', 'pat');
      await stampLaunchBoard('T');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('prod uten PAT → ingen fetch, logger feil', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('GITHUB_LOOP_PAT', '');
    await stampLaunchBoard('T');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('prod med PAT → poster markøren på tavla med tidsgrense', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('GITHUB_LOOP_PAT', 'pat');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }));
    await stampLaunchBoard('Premiebord');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${LOOP_REPO}/issues/${LAUNCH_BOARD_ISSUE}/comments`);
    expect(JSON.parse(init.body as string).body).toMatch(/^✅ Publisert: Premiebord — /);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('prod, HTTP-feil → logger, kaster ikke', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('GITHUB_LOOP_PAT', 'pat');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(stampLaunchBoard('T')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'HTTP 500');
  });

  it('prod, nettverksfeil → logger, kaster ikke', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('GITHUB_LOOP_PAT', 'pat');
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(stampLaunchBoard('T')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'nettverksfeil');
  });
});
