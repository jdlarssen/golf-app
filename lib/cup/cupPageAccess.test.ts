import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => getServerClientMock(),
}));

import { canViewCupPage } from './cupPageAccess';

/**
 * Type A for klubb-gaten på `/cup/[id]` (#524) etter #1547: «deltaker» må bety
 * det samme her som i cup-lista — rosteret ELLER en `tournament_participants`-
 * rad. Supabase er systemgrensa og er derfor det eneste som mockes.
 */

/** Chainable stub: hver tabell svarer med sin egen `maybeSingle`-rad. */
function buildClient(byTable: Record<string, unknown>) {
  const tables: string[] = [];
  const filters: Array<{ table: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      tables.push(table);
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => {
          filters.push({ table, args });
          return builder;
        },
        maybeSingle: async () => ({
          data: byTable[table] ?? null,
          error: null,
        }),
      };
      return builder;
    },
  };
  getServerClientMock.mockResolvedValue(client);
  return { tables, filters };
}

const ROSTER = {
  team1: [{ userId: 'kaptein' }],
  team2: [{ userId: 'motstander' }],
};
const EMPTY_ROSTER = { team1: [], team2: [] };

describe('canViewCupPage (#524, #1547)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('roster-deltaker slipper inn uten et eneste oppslag', async () => {
    buildClient({});

    await expect(
      canViewCupPage({
        tournamentId: 'cup-1',
        groupId: 'klubb-1',
        roster: ROSTER,
        proxyUserId: 'kaptein',
      }),
    ).resolves.toBe(true);
    expect(getServerClientMock).not.toHaveBeenCalled();
  });

  it('utkast-cup: kun tournament_participants-rad → slipper inn', async () => {
    const { tables, filters } = buildClient({
      tournament_participants: { user_id: 'utkast-spiller' },
    });

    await expect(
      canViewCupPage({
        tournamentId: 'cup-1',
        groupId: 'klubb-1',
        roster: EMPTY_ROSTER,
        proxyUserId: 'utkast-spiller',
      }),
    ).resolves.toBe(true);
    expect(tables).toContain('tournament_participants');
    expect(filters).toContainEqual({
      table: 'tournament_participants',
      args: ['tournament_id', 'cup-1'],
    });
  });

  it('verken deltaker, medlem eller admin → stengt', async () => {
    buildClient({ users: { is_admin: false } });

    await expect(
      canViewCupPage({
        tournamentId: 'cup-1',
        groupId: 'klubb-1',
        roster: ROSTER,
        proxyUserId: 'tilfeldig-forbipasserende',
      }),
    ).resolves.toBe(false);
  });
});
