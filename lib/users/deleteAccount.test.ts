import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for #1012 (grenvalget i sletting) og #1909 (hvem sperren
 * treffer). Supabase-admin-klienten er system-grensen — mocket med ett
 * pre-kanet svar per tabell, pluss spioner for GoTrue-admin-API-et og
 * `anonymize_user`-RPC-en.
 *
 * Svarene er nøklet på TABELL, ikke på rekkefølge: spørringene i blokk-
 * sjekken kjører i `Promise.all`, og en FIFO-kø ville dermed testet
 * kall-rekkefølgen i stedet for regelen. Mocken noterer i tillegg hvilke
 * filtre hver spørring satte, slik at «draft blokkerer ikke» og «ferdig
 * blokkerer ikke» kan bevises for ekte — mocken kan jo ikke filtrere selv.
 *
 * SQL-siden (scrub, frafall, vakter) dekkes av
 * supabase/tests/users_anonymize_withdrawal_test.sql, ikke her.
 */

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };
type SpyFn = (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>;
type Filter = { method: string; args: unknown[] };

const state = {
  /** Svar per tabellnavn. Uoppgitt tabell → tomt svar (ingen treff). */
  tables: {} as Record<string, QueryResult>,
  /** Én oppføring per `from(...)`-kjede, i kallsrekkefølge. */
  calls: [] as Array<{ table: string; filters: Filter[] }>,
  rpc: vi.fn<SpyFn>(),
  deleteUser: vi.fn<SpyFn>(),
};

function makeBuilder(table: string) {
  const call = { table, filters: [] as Filter[] };
  state.calls.push(call);
  const result = () =>
    Promise.resolve(state.tables[table] ?? { data: null, error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'is', 'not', 'in', 'limit']) {
    proxy[m] = (...args: unknown[]) => {
      call.filters.push({ method: m, args });
      return proxy;
    };
  }
  proxy.maybeSingle = () => result();
  proxy.then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => result().then(onFulfilled, onRejected);
  return proxy;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
    rpc: (...args: unknown[]) => state.rpc(...args),
    auth: { admin: { deleteUser: (...args: unknown[]) => state.deleteUser(...args) } },
  }),
}));

const { deleteOrAnonymizeUser, getDeleteBlockReason } = await import(
  './deleteAccount'
);

const USER_ID = '00000000-0000-4000-a000-000000000001';

/** Tabellene blokk-sjekken faktisk spurte. */
const queriedTables = () => state.calls.map((c) => c.table);
/** Filtrene den (første) spørringen mot `table` satte. */
const filtersFor = (table: string) =>
  state.calls.find((c) => c.table === table)?.filters ?? [];

/** Levende bruker, ingen av delene: utgangspunktet for blokk-testene. */
const livingUser = { data: { is_admin: false, deleted_at: null } };

beforeEach(() => {
  vi.clearAllMocks();
  state.tables = {};
  state.calls = [];
  state.rpc.mockResolvedValue({ data: null, error: null });
  state.deleteUser.mockResolvedValue({ data: null, error: null });
});

describe('deleteOrAnonymizeUser', () => {
  it('hard-deletes when the user has no game history', async () => {
    state.tables = {
      users: { data: { deleted_at: null } },
      game_players: { count: 0 },
    };
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'hard' });
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(USER_ID);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('falls back to anonymization when hard delete hits a residual FK', async () => {
    state.tables = {
      users: { data: { deleted_at: null } },
      game_players: { count: 0 },
    };
    state.deleteUser
      .mockResolvedValueOnce({ data: null, error: { message: 'FK violation' } }) // hard
      .mockResolvedValueOnce({ data: null, error: null }); // soft
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'anonymized' });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('anonymize_user', {
      p_user_id: USER_ID,
    });
    expect(state.deleteUser).toHaveBeenNthCalledWith(2, USER_ID, true);
  });

  it('anonymizes directly when the user has game history', async () => {
    state.tables = {
      users: { data: { deleted_at: null } },
      game_players: { count: 3 },
    };
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'anonymized' });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('anonymize_user', {
      p_user_id: USER_ID,
    });
    // Kun soft delete — aldri et hard-delete-forsøk som ville feilet på FK.
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(USER_ID, true);
  });

  it('retries only the auth soft delete when deleted_at is already set', async () => {
    state.tables = { users: { data: { deleted_at: '2026-07-03T10:00:00Z' } } };
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'anonymized' });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(USER_ID, true);
  });

  it('reports failure when the anonymize RPC errors', async () => {
    state.tables = {
      users: { data: { deleted_at: null } },
      game_players: { count: 1 },
    };
    state.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(state.deleteUser).not.toHaveBeenCalled();
  });
});

describe('getDeleteBlockReason', () => {
  describe('short-circuits before any engagement lookup', () => {
    it('blocks admin accounts', async () => {
      state.tables = { users: { data: { is_admin: true, deleted_at: null } } };
      expect(await getDeleteBlockReason(USER_ID)).toBe('admin_account');
      expect(queriedTables()).toEqual(['users']);
    });

    it('passes an already anonymized account (only the auth retry is left)', async () => {
      state.tables = {
        users: { data: { is_admin: false, deleted_at: '2026-07-03T10:00:00Z' } },
      };
      expect(await getDeleteBlockReason(USER_ID)).toBeNull();
      expect(queriedTables()).toEqual(['users']);
    });

    it('passes a user that does not exist', async () => {
      state.tables = { users: { data: null } };
      expect(await getDeleteBlockReason(USER_ID)).toBeNull();
      expect(queriedTables()).toEqual(['users']);
    });
  });

  describe('participation no longer blocks (#1909)', () => {
    // `game_players` er ladet med en rad nettopp for å bevise at den aldri
    // konsulteres — frafallet skjer i anonymize_user, ikke via en sperre.
    it.each(['active', 'scheduled'])(
      'passes a player in a %s game they did not organise',
      async (status) => {
        state.tables = {
          users: livingUser,
          game_players: { data: [{ game_id: 'g1', games: { status } }] },
          games: { data: [] },
          tournaments: { data: [] },
          leagues: { data: [] },
        };
        expect(await getDeleteBlockReason(USER_ID)).toBeNull();
        expect(queriedTables()).not.toContain('game_players');
      },
    );

    // Fail-closed (#1909): etter at deltaker-grenen forsvant er disse tre
    // spørringene det eneste som skiller en arrangør fra en anonymisering som
    // etterlater turneringen uten styring. En feilende spørring gir
    // `data: null`, som uten vakten ville lest som «arrangerer ingenting».
    it.each(['games', 'tournaments', 'leagues'])(
      'blocks when the %s query fails, instead of reading the error as "nothing"',
      async (failing) => {
        state.tables = {
          users: livingUser,
          games: { data: [] },
          tournaments: { data: [] },
          leagues: { data: [] },
          [failing]: { data: null, error: { message: 'boom' } },
        };
        expect(await getDeleteBlockReason(USER_ID)).toBe('active_engagements');
      },
    );

    it('asks only about things the account organises', async () => {
      state.tables = { users: livingUser };
      await getDeleteBlockReason(USER_ID);
      expect(queriedTables()).toEqual([
        'users',
        'games',
        'tournaments',
        'leagues',
      ]);
      for (const table of ['games', 'tournaments', 'leagues']) {
        expect(filtersFor(table)).toContainEqual({
          method: 'eq',
          args: ['created_by', USER_ID],
        });
      }
    });
  });

  describe('organising something unfinished blocks', () => {
    it.each(['active', 'scheduled'])(
      'blocks the creator of a %s game',
      async (status) => {
        state.tables = {
          users: livingUser,
          games: { data: [{ id: `g-${status}` }] },
          tournaments: { data: [] },
          leagues: { data: [] },
        };
        expect(await getDeleteBlockReason(USER_ID)).toBe('active_engagements');
      },
    );

    it('blocks the creator of an unfinished cup', async () => {
      state.tables = {
        users: livingUser,
        games: { data: [] },
        tournaments: { data: [{ id: 't1' }] },
        leagues: { data: [] },
      };
      expect(await getDeleteBlockReason(USER_ID)).toBe('active_engagements');
    });

    it('blocks the creator of an unfinished league', async () => {
      state.tables = {
        users: livingUser,
        games: { data: [] },
        tournaments: { data: [] },
        leagues: { data: [{ id: 'l1' }] },
      };
      expect(await getDeleteBlockReason(USER_ID)).toBe('active_engagements');
    });
  });

  describe('nothing left to run passes', () => {
    it('passes the creator of a draft game', async () => {
      // Mocken filtrerer ikke, så draft-caset må bevises på filteret:
      // spørringen ber kun om active/scheduled, altså kan draft aldri treffe.
      state.tables = {
        users: livingUser,
        games: { data: [] },
        tournaments: { data: [] },
        leagues: { data: [] },
      };
      expect(await getDeleteBlockReason(USER_ID)).toBeNull();
      expect(filtersFor('games')).toContainEqual({
        method: 'in',
        args: ['status', ['active', 'scheduled']],
      });
    });

    it('passes the creator of finished games, cups and leagues only', async () => {
      state.tables = {
        users: livingUser,
        games: { data: [] },
        tournaments: { data: [] },
        leagues: { data: [] },
      };
      expect(await getDeleteBlockReason(USER_ID)).toBeNull();
      for (const table of ['tournaments', 'leagues']) {
        expect(filtersFor(table)).toContainEqual({
          method: 'neq',
          args: ['status', 'finished'],
        });
      }
    });
  });
});
