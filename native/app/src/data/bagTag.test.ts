// #2256: klubben, sesongen og handicap-kurven til bag-taggen. Type A mot
// supabase-mocken.
//
// Sesongen går gjennom den ekte runde-lista (`data/roundHistory.ts`), så
// testen under er hele veien fra rader til flis-tall: året rundt nyttår i
// lokaltid (TZ=UTC i jest), en lagball-runde og en runde med 17 slag teller
// som runder, men ingen av dem blir beste runde.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const ME = 'user-me';
const NOW = new Date('2026-09-29T12:00:00.000Z');

type Mocks = typeof import('../test/supabaseMock');
type BagTag = typeof import('./bagTag');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function subject(): BagTag {
  return require('./bagTag') as BagTag;
}

const EIGHTEEN = [5, 4, 4, 3, 5, 4, 4, 5, 4, 4, 5, 3, 4, 4, 5, 4, 4, 5]; // 76

function playerRow(
  gameId: string,
  scheduledTeeOffAt: string,
  gameMode: string,
  resultSummary: unknown = null,
) {
  return {
    game_id: gameId,
    result_summary: resultSummary,
    games: { id: gameId, scheduled_tee_off_at: scheduledTeeOffAt, ended_at: null, game_mode: gameMode },
  };
}

function strokes(gameId: string, values: readonly number[]) {
  return values.map((value) => ({ game_id: gameId, strokes: value }));
}

describe('fetchBagTagExtras', () => {
  useFreshModules();

  beforeEach(() => {
    // Feilgrenene logger; en forventet feil skal ikke se ut som en ekte.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the first club and this year’s season', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const clubs = queryStub({ data: [{ joined_at: '2025-03-01', groups: { name: 'Losby GK' } }], error: null });
    // PostgREST gir numeric som tekst; rekkefølgen er basens.
    const history = queryStub({
      data: [
        { hcp_index: '16.8', recorded_at: '2025-11-03T10:00:00.000Z' },
        { hcp_index: '15.9', recorded_at: '2026-05-02T10:00:00.000Z' },
        { hcp_index: '14.2', recorded_at: '2026-09-20T10:00:00.000Z' },
      ],
      error: null,
    });
    routeFrom({
      group_members: [clubs],
      game_players: [
        queryStub({
          data: [
            playerRow('last-year', '2025-12-31T23:30:00.000Z', 'solo_strokeplay', { kind: 'placement', rank: 1, fieldSize: 4, isTeam: false }),
            playerRow('new-year', '2026-01-01T00:10:00.000Z', 'solo_strokeplay'),
            playerRow('scramble', '2026-06-01T08:00:00.000Z', 'texas_scramble', { kind: 'placement', rank: 1, fieldSize: 6, isTeam: true }),
            playerRow('short', '2026-07-01T08:00:00.000Z', 'solo_strokeplay'),
            playerRow('match', '2026-08-01T08:00:00.000Z', 'singles_matchplay', { kind: 'matchplay', outcome: 'win', margin: '2&1' }),
          ],
          error: null,
        }),
      ],
      scores: [
        queryStub({
          data: [
            ...strokes('new-year', EIGHTEEN),
            ...strokes('scramble', EIGHTEEN.map((s) => s - 1)),
            ...strokes('short', EIGHTEEN.slice(1).map((s) => s - 1)),
            ...strokes('match', EIGHTEEN.map((s) => s + 1)),
          ],
          error: null,
        }),
      ],
      handicap_history: [history],
    });

    const extras = await subject().fetchBagTagExtras(ME, NOW);

    expect(stepArgs(clubs, 'eq')).toEqual([['user_id', ME]]);
    expect(stepArgs(history, 'eq')).toEqual([['user_id', ME]]);
    expect(stepArgs(history, 'order')).toEqual([['recorded_at', { ascending: true }]]);
    expect(stepArgs(clubs, 'order')).toEqual([['joined_at', { ascending: true }]]);
    expect(stepArgs(clubs, 'limit')).toEqual([[1]]);
    expect(extras).toEqual({
      year: 2026,
      club: 'Losby GK',
      // Fire runder i 2026. Scramble (lagets 58 slag) og 17 slag gir ingen
      // beste runde, så den er 76. To seire: scramble som lag og matchplay.
      season: { rounds: 4, bestRound: 76, wins: 2 },
      // Sesongen starter fra verdien før nyttår.
      trend: { points: [16.8, 15.9, 14.2], change: -2.6 },
    });
  });

  it('reads the club from a join PostgREST gives as a list', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      group_members: [queryStub({ data: [{ joined_at: '2025-03-01', groups: [{ name: 'Bogstad' }] }], error: null })],
      game_players: [queryStub({ data: [], error: null })],
      handicap_history: [queryStub({ data: [], error: null })],
    });

    expect((await subject().fetchBagTagExtras(ME, NOW)).club).toBe('Bogstad');
  });

  it('gives no club when the player is in none', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      group_members: [queryStub({ data: [], error: null })],
      game_players: [queryStub({ data: [], error: null })],
      handicap_history: [queryStub({ data: [{ hcp_index: '14.2', recorded_at: '2026-09-20T10:00:00.000Z' }], error: null })],
    });

    expect(await subject().fetchBagTagExtras(ME, NOW)).toEqual({
      year: 2026,
      club: null,
      season: { rounds: 0, bestRound: null, wins: 0 },
      // Ett punkt er ingen kurve: «Oppdatert …» står.
      trend: null,
    });
  });

  it('keeps the rest when the club, the season or the curve fails', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      group_members: [
        queryStub({ data: null, error: { message: 'nede' } }),
        queryStub({ data: [{ joined_at: '2025-03-01', groups: { name: 'Losby GK' } }], error: null }),
      ],
      game_players: [
        queryStub({ data: [], error: null }),
        queryStub({ data: null, error: { message: 'tidsavbrudd' } }),
      ],
      handicap_history: [
        // Før migrasjonen er i basen: tabellen finnes ikke.
        queryStub({ data: null, error: { message: 'relation "public.handicap_history" does not exist' } }),
        queryStub({ data: [], error: null }),
      ],
    });

    expect(await subject().fetchBagTagExtras(ME, NOW)).toMatchObject({
      club: null,
      season: { rounds: 0 },
      trend: null,
    });
    expect(await subject().fetchBagTagExtras(ME, NOW)).toMatchObject({
      club: 'Losby GK',
      season: null,
    });
  });
});
