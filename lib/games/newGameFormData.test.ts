import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #435 — `getNewGameFormData(includeEmail)` must drop the `email` column from
 * the `users` query (and the mapped `PlayerOption`) when called with `false`,
 * so a non-admin's create/edit page never carries co-players' e-postadresser
 * in its payload. The admin default (`true`) keeps the full roster.
 *
 * We mock the Supabase server client and capture the exact column string passed
 * to `.from('users').select(...)` — that string IS the data-layer contract:
 * if `email` isn't selected, it can't reach the RSC payload.
 */

type Row = Record<string, unknown>;

const capturedUserSelect = vi.fn<(cols: string) => void>();
let usersData: Row[] = [];
let coursesData: Row[] = [];

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    from: (table: string) => {
      const result =
        table === 'users'
          ? { data: usersData, error: null }
          : { data: coursesData, error: null };
      const builder: Record<string, unknown> = {
        select: (cols: string) => {
          if (table === 'users') capturedUserSelect(cols);
          return builder;
        },
        order: () => builder,
        returns: () => builder,
        // The query builder is awaited inside Promise.all, so it must be a
        // thenable resolving to a PostgREST-shaped { data, error }.
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  }),
}));

import { getNewGameFormData } from './newGameFormData';

beforeEach(() => {
  capturedUserSelect.mockReset();
  coursesData = [];
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

  it('beholder email i select OG output når includeEmail=true (default admin-flate)', async () => {
    const { players } = await getNewGameFormData(true);
    expect(capturedUserSelect).toHaveBeenCalledTimes(1);
    expect(capturedUserSelect.mock.calls[0]![0]).toContain('email');
    expect(players[0]).toMatchObject({ email: 'kari@example.com' });
    expect(players[1]).toMatchObject({ email: 'pending@example.com' });
  });

  it('defaulter til full roster (med email) når kalt uten argument', async () => {
    const { players } = await getNewGameFormData();
    expect(capturedUserSelect.mock.calls[0]![0]).toContain('email');
    expect(players[0]).toMatchObject({ email: 'kari@example.com' });
  });
});
