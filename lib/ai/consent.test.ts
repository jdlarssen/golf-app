import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { aiAllowedUserIds, readAiAllowedUserIds, readAiAllowedUserIdsOrNull, readOwnAiConsent } =
  await import('./consent');

/**
 * The client is the system boundary. One canned answer for every read, plus a
 * record of the ids each `.in()` asked for.
 */
function fakeClient(answer: { data: unknown; error: unknown }) {
  const inCalls: string[][] = [];
  const builder = {
    select: () => builder,
    in: (_col: string, ids: string[]) => {
      inCalls.push(ids);
      return Promise.resolve(answer);
    },
    maybeSingle: () => Promise.resolve(answer),
  };
  const client = { from: vi.fn(() => builder) };
  return { client: client as never, inCalls, from: client.from };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aiAllowedUserIds', () => {
  it.each([
    ['ja', [{ user_id: 'a', granted: true }], ['a']],
    ['nei', [{ user_id: 'a', granted: false }], []],
    ['ingen rad', [], []],
    [
      'blandet',
      [
        { user_id: 'a', granted: true },
        { user_id: 'b', granted: false },
        { user_id: 'd', granted: true },
      ],
      ['a', 'd'],
    ],
  ])('%s', (_label, rows, expected) => {
    expect([...aiAllowedUserIds(['a', 'b', 'c', 'd'], rows)].sort()).toEqual(expected);
  });

  it('ignores a row for a user that was not asked about', () => {
    expect([...aiAllowedUserIds(['a'], [{ user_id: 'z', granted: true }])]).toEqual([]);
  });
});

describe('readAiAllowedUserIds', () => {
  it('returns the users who said yes', async () => {
    const { client } = fakeClient({
      data: [
        { user_id: 'a', granted: true },
        { user_id: 'b', granted: false },
      ],
      error: null,
    });
    expect([...(await readAiAllowedUserIds(client, ['a', 'b', 'c']))]).toEqual(['a']);
  });

  it('fails closed: a read error gives an empty set and is logged', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    expect((await readAiAllowedUserIds(client, ['a'])).size).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[aiConsent\]/), expect.anything());
  });

  // #2561: the Kavalkade must tell a failed read from «nobody said yes», so a
  // read error does not store a year without an opening text.
  it('the OrNull variant gives null on a read error, and the same set otherwise', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = fakeClient({ data: null, error: { message: 'boom' } });
    expect(await readAiAllowedUserIdsOrNull(failing.client, ['a'])).toBeNull();
    const working = fakeClient({ data: [{ user_id: 'a', granted: true }], error: null });
    expect([...((await readAiAllowedUserIdsOrNull(working.client, ['a'])) ?? [])]).toEqual(['a']);
  });

  it('asks nothing for an empty list', async () => {
    const { client, from } = fakeClient({ data: [], error: null });
    expect((await readAiAllowedUserIds(client, [])).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('reads a long list in chunks small enough for the URL', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const { client, inCalls } = fakeClient({ data: [], error: null });
    await readAiAllowedUserIds(client, ids);
    expect(inCalls.flat()).toEqual(ids);
    expect(Math.max(...inCalls.map((c) => c.length))).toBeLessThanOrEqual(100);
  });
});

describe('readOwnAiConsent', () => {
  it.each([
    ['ja', { granted: true }, true],
    ['nei', { granted: false }, false],
    ['ingen rad', null, null],
  ])('%s', async (_label, row, expected) => {
    const { client } = fakeClient({ data: row, error: null });
    expect(await readOwnAiConsent(client)).toBe(expected);
  });

  it('throws on a read error, so a page never shows a guessed answer', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(readOwnAiConsent(client)).rejects.toThrow(/aiConsent/);
  });
});
