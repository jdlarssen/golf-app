import { describe, it, expect, vi } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

let adminClient: unknown;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminClient }));

import {
  planTournamentGameDeletion,
  selectNeverPlayedHostGameIds,
  type CupHostGameForDeletion,
} from './tournamentGameDeletion';

// Type A per docs/test-discipline.md — ren utvalgs-logikk (#1441 finding A).
describe('selectNeverPlayedHostGameIds', () => {
  it('returnerer tomt array for en tom liste', () => {
    expect(selectNeverPlayedHostGameIds([])).toEqual([]);
  });

  it.each([
    // [status, hasScores, forventet slettet]
    ['draft', false, true],
    ['draft', true, true], // draft har aldri scores i praksis; testen dekker likevel begge
    ['scheduled', false, true],
    ['scheduled', true, true],
    ['active', false, true], // startet, men ingen slag tastet
    ['active', true, false], // reell spilling — beholdes
    ['finished', false, false], // avsluttet uten scores — beholdes uansett (bevisst, se docstring)
    ['finished', true, false],
  ] as const)(
    'status=%s hasScores=%s → slettet=%s',
    (status, hasScores, expectedDeleted) => {
      const hosts: CupHostGameForDeletion[] = [{ id: 'g1', status, hasScores }];
      const result = selectNeverPlayedHostGameIds(hosts);
      expect(result).toEqual(expectedDeleted ? ['g1'] : []);
    },
  );

  it('plukker ut riktig delmengde fra en blandet batch, i original rekkefølge', () => {
    const hosts: CupHostGameForDeletion[] = [
      { id: 'draft-1', status: 'draft', hasScores: false },
      { id: 'active-played', status: 'active', hasScores: true },
      { id: 'scheduled-1', status: 'scheduled', hasScores: false },
      { id: 'active-empty', status: 'active', hasScores: false },
      { id: 'finished-1', status: 'finished', hasScores: true },
    ];
    expect(selectNeverPlayedHostGameIds(hosts)).toEqual([
      'draft-1',
      'scheduled-1',
      'active-empty',
    ]);
  });

  it('dupliserte id-er i input speiles i output (kallers ansvar å ikke sende duplikater)', () => {
    const hosts: CupHostGameForDeletion[] = [
      { id: 'dup', status: 'draft', hasScores: false },
      { id: 'dup', status: 'draft', hasScores: false },
    ];
    expect(selectNeverPlayedHostGameIds(hosts)).toEqual(['dup', 'dup']);
  });
});

// #1894: the only destructive scores read. A response cut at the row cap
// would read a played host as «never played» and delete it.
describe('planTournamentGameDeletion — scores past the row cap', () => {
  it('keeps an active host whose scores only show up on page 2', async () => {
    const fake = createAdminClientMock({
      respond: (op) => {
        if (op.table === 'games') {
          return {
            data: [
              { id: 'g-big', status: 'active', source_game_id: null },
              { id: 'g-late', status: 'active', source_game_id: null },
            ],
          };
        }
        // Page 1 is a full 1 000 rows of g-big; g-late's only row is on page 2.
        const [from] = op.range ?? [0, 0];
        return from === 0
          ? { data: Array.from({ length: 1000 }, () => ({ game_id: 'g-big' })) }
          : from === 1000
            ? { data: [{ game_id: 'g-late' }] }
            : { data: [] };
      },
    });
    adminClient = fake.client;

    const plan = await planTournamentGameDeletion('t1');

    expect(plan.hostIdsToDelete).toEqual([]);
    expect(fake.ops.filter((op) => op.table === 'scores').map((op) => op.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
