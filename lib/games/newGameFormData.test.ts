import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #435 — `getNewGameFormData(includeEmail)` must drop the `email` column from
 * the `users` query (and the mapped `PlayerOption`) when called with `false`,
 * so a non-admin's create/edit page never carries co-players' e-postadresser
 * in its payload.
 *
 * #2207 — users.email is not readable through the user's own session. The
 * e-post roster is read with the admin client, and only when the caller's own
 * row has is_admin; everyone else gets the e-post-free roster whatever they
 * asked for.
 *
 * We mock both clients and capture the exact column string passed to
 * `.from('users').select(...)` — that string IS the data-layer contract:
 * if `email` isn't selected, it can't reach the RSC payload.
 */

type Row = Record<string, unknown>;

const capturedUserSelect = vi.fn<(cols: string) => void>();
const capturedAdminSelect = vi.fn<(cols: string) => void>();
let usersData: Row[] = [];
let coursesData: Row[] = [];
let clubsData: Row[] = [];
let callerIsAdmin = true;

/** A thenable PostgREST-ish builder; `onSelect` sees every select's columns. */
function builderFor(table: string, onSelect: (cols: string) => void) {
  const result =
    table === 'users'
      ? { data: usersData, error: null }
      : table === 'group_members'
        ? { data: clubsData, error: null }
        : { data: coursesData, error: null };
  const builder: Record<string, unknown> = {
    select: (cols: string) => {
      // The caller's own is_admin read (#2207) is not a roster read.
      if (table === 'users' && cols === 'is_admin') {
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: { is_admin: callerIsAdmin }, error: null }),
          }),
        };
      }
      if (table === 'users') onSelect(cols);
      return builder;
    },
    order: () => builder,
    eq: () => builder,
    // #1012: .is('deleted_at', null)-leddet i users-kjeden
    is: () => builder,
    returns: () => builder,
    // The query builder is awaited inside Promise.all, so it must be a
    // thenable resolving to a PostgREST-shaped { data, error }.
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    // #442: getNewGameFormData henter også brukerens klubber, så mocken må
    // tilby auth.getUser() + en group_members-spørring (med .eq()).
    auth: {
      getUser: async () => ({ data: { user: { id: 'me' } }, error: null }),
    },
    from: (table: string) => builderFor(table, capturedUserSelect),
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => builderFor(table, capturedAdminSelect),
  }),
}));

import { getNewGameFormData } from './newGameFormData';

beforeEach(() => {
  capturedUserSelect.mockReset();
  capturedAdminSelect.mockReset();
  callerIsAdmin = true;
  coursesData = [];
  clubsData = [];
  usersData = [
    {
      id: 'u1',
      name: 'Kari Nordmann',
      nickname: 'Kaja',
      hcp_index: 12.4,
      email: 'kari@example.com',
      profile_completed_at: '2026-01-01T00:00:00Z',
      gender: 'ladies',
      level: 'normal',
    },
    {
      id: 'u2',
      name: null,
      nickname: null,
      hcp_index: 36,
      email: 'pending@example.com',
      profile_completed_at: null,
      gender: null,
      level: 'normal',
    },
  ];
});

describe('getNewGameFormData — e-post-scoping (#435)', () => {
  it('utelater email-kolonnen fra users-select når includeEmail=false', async () => {
    await getNewGameFormData(false);
    expect(capturedUserSelect).toHaveBeenCalledTimes(1);
    const cols = capturedUserSelect.mock.calls[0]![0];
    expect(cols).not.toContain('email');
    // Sanity: de feltene velgeren faktisk trenger er fortsatt med.
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('nickname');
    expect(cols).toContain('hcp_index');
  });

  it('utelater email fra PlayerOption-output når includeEmail=false', async () => {
    const { players } = await getNewGameFormData(false);
    expect(players).toHaveLength(2);
    for (const p of players) {
      expect('email' in p).toBe(false);
    }
    // Resten av kartleggingen er uendret.
    expect(players[0]).toMatchObject({
      id: 'u1',
      name: 'Kari Nordmann',
      nickname: 'Kaja',
      hcp_index: 12.4,
      pending: false,
    });
    expect(players[1]).toMatchObject({ id: 'u2', name: null, pending: true });
  });

  it('beholder email i select OG output når includeEmail=true og kalleren er admin — via admin-klienten (#2207)', async () => {
    const { players } = await getNewGameFormData(true);
    expect(capturedAdminSelect).toHaveBeenCalledTimes(1);
    expect(capturedAdminSelect.mock.calls[0]![0]).toContain('email');
    expect(capturedUserSelect).not.toHaveBeenCalled();
    expect(players[0]).toMatchObject({ email: 'kari@example.com' });
    expect(players[1]).toMatchObject({ email: 'pending@example.com' });
  });

  it('defaulter til full roster (med email) når kalt uten argument av en admin', async () => {
    const { players } = await getNewGameFormData();
    expect(capturedAdminSelect.mock.calls[0]![0]).toContain('email');
    expect(players[0]).toMatchObject({ email: 'kari@example.com' });
  });

  it('en ikke-admin får e-post-fri roster på egen klient selv med includeEmail=true (#2207)', async () => {
    callerIsAdmin = false;
    const { players } = await getNewGameFormData(true);
    expect(capturedAdminSelect).not.toHaveBeenCalled();
    expect(capturedUserSelect).toHaveBeenCalledTimes(1);
    expect(capturedUserSelect.mock.calls[0]![0]).not.toContain('email');
    for (const p of players) {
      expect('email' in p).toBe(false);
    }
  });
});

describe('getNewGameFormData — klubber (#442)', () => {
  it('FK-normaliserer, hopper over tomme rader og sorterer klubbene på navn', async () => {
    clubsData = [
      { groups: { id: 'g2', name: 'Bjørnholt GK' } },
      { groups: [{ id: 'g1', name: 'Aurskog' }] }, // FK-join som array
      { groups: null }, // hoppes over
    ];
    const { clubs } = await getNewGameFormData(false);
    expect(clubs).toEqual([
      { id: 'g1', name: 'Aurskog' },
      { id: 'g2', name: 'Bjørnholt GK' },
    ]);
  });

  it('returnerer tom klubb-liste når brukeren ikke er medlem av noen', async () => {
    clubsData = [];
    const { clubs } = await getNewGameFormData(false);
    expect(clubs).toEqual([]);
  });
});
