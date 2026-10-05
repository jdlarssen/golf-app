import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { EditGameRow } from '@/lib/games/editGameInitialValues';
import { loadDraftResume } from './loadDraftResume';

// The one rule both edit routes use to resume a draft in the wizard (#1385,
// #2269): only a draft, never a cup- or league-linked one, and only a format
// the wizard's catalogue can show. Anything else is GameForm (null).

const CATALOG = { kompis: [{ slug: 'best_ball' }], klubb: [], solo: [{ slug: 'stableford' }] };
const ROSTER = [{ user_id: 'u1', team_number: 1, flight_number: 1, tee_gender: 'mens' }];

function fakeClient(result: { data: unknown; error: unknown } = { data: ROSTER, error: null }) {
  const from = vi.fn(() => {
    const q = {
      select: () => q,
      eq: () => q,
      returns: () => Promise.resolve(result),
    };
    return q;
  });
  return { client: { from } as unknown as SupabaseClient<Database>, from };
}

const row = (over: Partial<EditGameRow>) =>
  ({ status: 'draft', game_mode: 'best_ball', group_id: null, tournament_id: null, league_round_id: null, ...over }) as EditGameRow;

describe('loadDraftResume', () => {
  it.each([
    ['a scheduled game', { status: 'scheduled' as const }],
    ['a cup-linked draft', { tournament_id: 't1' }],
    ['a league-linked draft', { league_round_id: 'l1' }],
  ])('%s keeps GameForm, and reads nothing', async (_label, over) => {
    const { client, from } = fakeClient();
    const loadMountData = vi.fn(async () => ({ formatsByIntent: CATALOG }));
    expect(await loadDraftResume(client, 'g1', row(over), loadMountData)).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(loadMountData).not.toHaveBeenCalled();
  });

  it('keeps GameForm for a format no catalogue can show', async () => {
    const { client } = fakeClient();
    const read = await loadDraftResume(client, 'g1', row({ game_mode: 'wolf' }), async () => ({
      formatsByIntent: CATALOG,
    }));
    expect(read).toBeNull();
  });

  it('resumes a draft in the wizard with its roster and the caller’s data', async () => {
    const { client } = fakeClient();
    const data = { formatsByIntent: CATALOG, players: ['the caller’s own'] };
    const read = await loadDraftResume(client, 'g1', row({}), async () => data);
    expect(read).toEqual({
      wizardData: data,
      plan: { kind: 'wizard', intent: 'kompis', groupId: undefined },
      playerRows: ROSTER,
    });
  });

  it('throws when the roster read fails, never resumes with an empty roster', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'roster down' } });
    await expect(
      loadDraftResume(client, 'g1', row({}), async () => ({ formatsByIntent: CATALOG })),
    ).rejects.toEqual({ message: 'roster down' });
  });
});
