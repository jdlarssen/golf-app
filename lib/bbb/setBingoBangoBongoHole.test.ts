import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn();
const upsertSelectMock = vi.fn();
const getUserMock = vi.fn();
const updateTagMock = vi.fn();
const maybeSingleMock = vi.fn();

// Track which table was queried for games-status check
let fromCalls: string[] = [];

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      fromCalls.push(table);
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: maybeSingleMock,
        };
      }
      return { upsert: upsertMock };
    },
  }),
}));

// #2091: `updateTag`, not `revalidateTag(tag, 'max')` — the first reload after a
// registration must show it, not the cached state from before. Only `updateTag`
// is mocked, so a return to `revalidateTag` fails here.
vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}));

import { setBingoBangoBongoHole } from './setBingoBangoBongoHole';

type Input = Parameters<typeof setBingoBangoBongoHole>[0];

beforeEach(() => {
  upsertMock.mockReset();
  upsertSelectMock.mockReset();
  getUserMock.mockReset();
  updateTagMock.mockReset();
  maybeSingleMock.mockReset();
  fromCalls = [];
  upsertMock.mockReturnValue({ select: upsertSelectMock });
});

function mockAuthed(userId: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } } });
}

function mockGame(status: string) {
  maybeSingleMock.mockResolvedValue({ data: { status }, error: null });
}

/** What `upsert(...).select('hole_number')` resolves to. */
function mockUpsert(result: {
  data: { hole_number: number }[] | null;
  error: { message: string } | null;
}) {
  upsertSelectMock.mockResolvedValue(result);
}

const UPSERTED = { data: [{ hole_number: 1 }], error: null };

describe('setBingoBangoBongoHole — validering før DB', () => {
  it('avviser ikke-autentisert bruker', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 1,
      key: 'bingoUserId',
      userId: 'u-1',
    });

    expect(result).toEqual({ ok: false, error: 'not_authenticated' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('avviser hole_number 0 (utenfor 1-18)', async () => {
    mockAuthed('u-1');

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 0,
      key: 'bingoUserId',
      userId: 'u-1',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_hole' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('avviser hole_number 19', async () => {
    mockAuthed('u-1');

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 19,
      key: 'bingoUserId',
      userId: 'u-1',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_hole' });
  });

  // #1950: `key` names the one column the write sets, and a server action takes
  // any payload. A column name, an unknown key, or an old client that still
  // sends the whole row is refused before the DB, so it can never write NULLs.
  // A valid key with a userId that is neither null nor a user id would build
  // `{ <column>: undefined }`; JSON drops it, and the upsert would write a row
  // without the category yet answer ok. Refused the same way.
  it.each<[string, Record<string, unknown>]>([
    ['ukjent nøkkel', { gameId: 'g', holeNumber: 4, key: 'wolfUserId', userId: 'u-1' }],
    ['kolonnenavn i stedet for nøkkel', { gameId: 'g', holeNumber: 4, key: 'entered_by', userId: 'u-1' }],
    [
      'gammel klient med hel rad og ingen nøkkel',
      { gameId: 'g', holeNumber: 4, bingoUserId: 'u-1', bangoUserId: null, bongoUserId: null },
    ],
    ['gyldig nøkkel uten userId', { gameId: 'g', holeNumber: 4, key: 'bingoUserId' }],
    ['userId satt til undefined', { gameId: 'g', holeNumber: 4, key: 'bangoUserId', userId: undefined }],
    ['userId som tall', { gameId: 'g', holeNumber: 4, key: 'bongoUserId', userId: 42 }],
    ['userId som tom streng', { gameId: 'g', holeNumber: 4, key: 'bingoUserId', userId: '' }],
  ])('avviser %s med invalid_category, uten upsert', async (_label, input) => {
    mockAuthed('u-1');
    mockGame('active');
    mockUpsert(UPSERTED);

    const result = await setBingoBangoBongoHole(input as unknown as Input);

    expect(result).toEqual({ ok: false, error: 'invalid_category' });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });
});

describe('setBingoBangoBongoHole — finished-lock', () => {
  it('avviser upsert når spillet er finished', async () => {
    mockAuthed('u-1');
    mockGame('finished');

    const result = await setBingoBangoBongoHole({
      gameId: 'g-done',
      holeNumber: 5,
      key: 'bangoUserId',
      userId: 'u-2',
    });

    expect(result).toEqual({ ok: false, error: 'game_finished' });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it('returnerer game_not_found hvis games-rad mangler', async () => {
    mockAuthed('u-1');
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'missing',
      holeNumber: 1,
      key: 'bingoUserId',
      userId: null,
    });

    expect(result).toEqual({ ok: false, error: 'game_not_found' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // #1445: a failed games-query used to share the 0-row branch and told the
  // scorer «spillet finnes ikke» mid-round. It now has its own code; the
  // 0-row case above still answers game_not_found.
  it('games-oppslaget feiler → db_error (ikke game_not_found)', async () => {
    mockAuthed('u-1');
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'AbortError: This operation was aborted', code: '' },
    });

    const result = await setBingoBangoBongoHole({
      gameId: 'g-flaky',
      holeNumber: 1,
      key: 'bingoUserId',
      userId: null,
    });

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });
});

describe('setBingoBangoBongoHole — DB-interaksjon', () => {
  // #1950: the payload carries only the tapped category (+ entered_by). The
  // other two columns are absent, so PostgREST's ON CONFLICT DO UPDATE leaves a
  // flight-mate's concurrent registration standing. toStrictEqual, so a column
  // sent as undefined or null counts as present.
  it('happy path: upserter bare den ene kategorien med entered_by + utløper game-tag', async () => {
    mockAuthed('u-scorer');
    mockGame('active');
    mockUpsert({ data: [{ hole_number: 7 }], error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'g-42',
      holeNumber: 7,
      key: 'bangoUserId',
      userId: 'u-2',
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock.mock.calls).toStrictEqual([
      [
        { game_id: 'g-42', hole_number: 7, bango_user_id: 'u-2', entered_by: 'u-scorer' },
        { onConflict: 'game_id,hole_number' },
      ],
    ]);
    // #2080: the row comes back so a 0-row write can be told apart from a save.
    expect(upsertSelectMock).toHaveBeenCalledWith('hole_number');
    expect(updateTagMock.mock.calls).toStrictEqual([['game-g-42']]);
  });

  it('tømming («Ingen») nuller bare den ene kolonnen', async () => {
    mockAuthed('u-scorer');
    mockGame('active');
    mockUpsert({ data: [{ hole_number: 9 }], error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 9,
      key: 'bingoUserId',
      userId: null,
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock.mock.calls).toStrictEqual([
      [
        { game_id: 'g', hole_number: 9, bingo_user_id: null, entered_by: 'u-scorer' },
        { onConflict: 'game_id,hole_number' },
      ],
    ]);
  });

  it('samme spiller alle tre (3 poeng — lovlig): ett kall per kategori, hver til sin kolonne', async () => {
    mockAuthed('u-scorer');
    mockGame('active');
    mockUpsert({ data: [{ hole_number: 3 }], error: null });

    for (const key of ['bingoUserId', 'bangoUserId', 'bongoUserId'] as const) {
      expect(
        await setBingoBangoBongoHole({ gameId: 'g', holeNumber: 3, key, userId: 'u-star' }),
      ).toEqual({ ok: true });
    }

    expect(upsertMock.mock.calls.map(([payload]) => payload)).toStrictEqual([
      { game_id: 'g', hole_number: 3, bingo_user_id: 'u-star', entered_by: 'u-scorer' },
      { game_id: 'g', hole_number: 3, bango_user_id: 'u-star', entered_by: 'u-scorer' },
      { game_id: 'g', hole_number: 3, bongo_user_id: 'u-star', entered_by: 'u-scorer' },
    ]);
  });

  it('entered_by settes til auth.uid() uavhengig av hvilken spiller som vant', async () => {
    mockAuthed('admin-user');
    mockGame('active');
    mockUpsert(UPSERTED);

    await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 1,
      key: 'bongoUserId',
      userId: 'player-3',
    });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ entered_by: 'admin-user' }),
      expect.any(Object),
    );
  });

  it('Postgres-feil → rls_denied (uten å lekke detaljer)', async () => {
    mockAuthed('u-1');
    mockGame('active');
    mockUpsert({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 1,
      key: 'bingoUserId',
      userId: 'u-1',
    });

    expect(result).toEqual({ ok: false, error: 'rls_denied' });
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  // #2080: PostgREST answers error == null when RLS lets the upsert touch
  // nothing. That is not a save: same code as a refused write, no cache expiry.
  it('upsert uten rader tilbake → rls_denied, ikke ok', async () => {
    mockAuthed('u-1');
    mockGame('active');
    mockUpsert({ data: [], error: null });

    const result = await setBingoBangoBongoHole({
      gameId: 'g',
      holeNumber: 1,
      key: 'bingoUserId',
      userId: 'u-1',
    });

    expect(result).toEqual({ ok: false, error: 'rls_denied' });
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it('utløper IKKE game-tagen ved feil', async () => {
    mockAuthed('u-1');
    mockGame('active');
    mockUpsert({ data: null, error: { message: 'db error' } });

    await setBingoBangoBongoHole({
      gameId: 'g-99',
      holeNumber: 2,
      key: 'bangoUserId',
      userId: null,
    });

    expect(updateTagMock).not.toHaveBeenCalled();
  });
});
