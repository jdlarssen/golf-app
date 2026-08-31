// Native sideturnering (#1850): låser LD/CTP-lesingen.
//
// To ting kan drive fra hverandre uten at noe kompilerer rødt:
//
//  1. **Kolonnelista og sorteringen** mot webbens `fetchSideWinners`. Ulike
//     kolonner der = andre vinnere i appen enn på nettsiden for samme runde.
//  2. **Skillet feil/tomt.** Tom liste er et gyldig svar (avsluttet uten
//     kåring); en feilet henting er det ikke. Leses de likt, tegner appen en
//     poengtabell der sidepoengene mangler — 2p per slot, stille feil totaler.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';

type Mocks = typeof import('../test/supabaseMock');
type SideWinners = typeof import('./sideWinners');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function sideWinners(): SideWinners {
  return require('./sideWinners') as SideWinners;
}

describe('fetchSideWinners', () => {
  useFreshModules();

  it('gir radene tilbake slik serveren sorterte dem', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const query = queryStub({
      data: [
        { category: 'closest_to_pin', position: 1, winner_user_id: MATE },
        // Slot 2 ble spilt, men ingen vant den — null skal overleve hele veien.
        { category: 'longest_drive', position: 1, winner_user_id: ME },
        { category: 'longest_drive', position: 2, winner_user_id: null },
      ],
      error: null,
    });
    routeFrom({ game_side_winners: [query] });

    expect(await sideWinners().fetchSideWinners(GAME)).toEqual([
      { category: 'closest_to_pin', position: 1, winner_user_id: MATE },
      { category: 'longest_drive', position: 1, winner_user_id: ME },
      { category: 'longest_drive', position: 2, winner_user_id: null },
    ]);
    // Kolonnelista + sorteringen ER kontrakten mot webbens leaderboardContext.
    expect(stepArgs(query, 'select')).toEqual([
      ['category, position, winner_user_id'],
    ]);
    expect(stepArgs(query, 'eq')).toEqual([['game_id', GAME]]);
    expect(stepArgs(query, 'order')).toEqual([['category'], ['position']]);
  });

  const EMPTY: [string, unknown][] = [
    ['tom tabell', []],
    ['null fra PostgREST', null],
  ];

  it.each(EMPTY)(
    'gir tom liste ved %s — avsluttet uten kåring er et gyldig svar',
    async (_label, data) => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ game_side_winners: [queryStub({ data, error: null })] });

      expect(await sideWinners().fetchSideWinners(GAME)).toEqual([]);
    },
  );

  it('kaster når spørringen feiler — «vet ikke» er ikke «ingen vant»', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      game_side_winners: [queryStub({ data: null, error: { message: 'offline' } })],
    });

    await expect(sideWinners().fetchSideWinners(GAME)).rejects.toThrow('offline');
  });
});
