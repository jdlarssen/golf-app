// #2752, kriterium 2: en delt cup-dag uten nett, gjennom det ekte datalaget.
//
// Spilleren henter runden hjemme. På banen faller nettet: hull 9 føres i første
// halvdel, broen går til hull 10, og hull 10 føres i andre halvdel. Når nettet er
// tilbake, går hvert slag til sitt eget spill. Bare grensene er stubbet (supabase
// og fetch); bundelen, SQLite-laget, køen og `drainQueue` er ekte.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { mockFetch, mockNetwork, respondWith, useWebRoute } from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
  subscribeSyncTriggers: () => () => undefined,
}));

const FRONT9 = 'front9-game';
const BACK9 = 'back9-game';
const ME = 'user-me';

type Mocks = typeof import('../test/supabaseMock');
const mocks = () => require('../test/supabaseMock') as Mocks;

const holes = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

const gameRow = (id: string, hole_segment: string, game_mode: string) => ({
  id,
  name: id,
  status: 'active',
  game_mode,
  mode_config: {},
  course_id: 'course-1',
  tee_box_id: null,
  require_peer_approval: false,
  scheduled_tee_off_at: '2026-11-01T09:00:00.000Z',
  hole_segment,
  source_game_id: null,
  created_by: 'organiser',
  score_visibility: 'live',
  tournament_id: 'cup-1',
  league_round_id: null,
  foursomes_side1_tee_starter_user_id: null,
  foursomes_side2_tee_starter_user_id: null,
  side_tournament_enabled: false,
  side_ld_count: 0,
  side_ctp_count: 0,
  side_disabled_categories: [],
  hcp_allowance_pct: 100,
  courses: { name: 'Losby', course_holes: holes },
  tee_boxes: null,
});

const playerRow = {
  user_id: ME,
  team_number: 1,
  flight_number: 1,
  course_handicap: 0,
  tee_gender: 'mens',
  accepted_at: null,
  submitted_at: null,
  submitted_by_user_id: null,
  approved_at: null,
  approved_by_user_id: null,
  rejection_reason: null,
  withdrawn_at: null,
  users: { name: 'Meg', nickname: null, is_guest: false },
};

const sibling = (gameId: string, holeSegment: string, gameMode: string) => ({
  sibling: { gameId, gameMode, holeSegment, mySubmittedAt: null, myTeamNumber: 1 },
});

describe('en delt cup-dag uten nett', () => {
  useWebRoute();

  beforeEach(() => {
    mocks().currentDeviceUserId.mockResolvedValue(ME);
  });

  it('hull 9, broen og hull 10 føres uten nett, og hvert slag går til sitt spill etterpå', async () => {
    const { queryStub, routeFrom, supabase } = mocks();
    const { loadGameBundle, refreshGameBundle } = require('./gameBundle') as typeof import('./gameBundle');
    const { bridgeHole } = require('../lib/segmentRound') as typeof import('../lib/segmentRound');
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');
    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    const { getDb, listQueue, listScoresForGame } = require('./db') as typeof import('./db');

    // Hjemme: begge halvdelene legges på telefonen.
    routeFrom({
      games: [queryStub({ data: gameRow(FRONT9, 'front9', 'greensome_matchplay'), error: null })],
      game_players: [queryStub({ data: [playerRow], error: null })],
    });
    respondWith(200, sibling(BACK9, 'back9', 'best_ball'));
    const front = await refreshGameBundle(FRONT9);
    routeFrom({
      games: [queryStub({ data: gameRow(BACK9, 'back9', 'best_ball'), error: null })],
      game_players: [queryStub({ data: [playerRow], error: null })],
    });
    respondWith(200, sibling(FRONT9, 'front9', 'greensome_matchplay'));
    await refreshGameBundle(BACK9);

    // På banen: ingen nett, og broen peker på hull 10 i andre halvdel.
    mockNetwork.online = false;
    mockFetch.mockClear();
    const bridge = bridgeHole(front);
    expect(bridge).toEqual({ gameId: BACK9, holeNumber: 10 });

    await writeScore({ gameId: FRONT9, userId: ME, holeNumber: 9, strokes: 4, enteredBy: ME });
    // Hull 10 tegnes fra det som ligger på telefonen.
    const cached = await loadGameBundle(bridge!.gameId);
    expect(cached?.game.holeSegment).toBe('back9');
    await writeScore({ gameId: BACK9, userId: ME, holeNumber: 10, strokes: 5, enteredBy: ME });

    const db = await getDb();
    expect((await listScoresForGame(db, FRONT9)).map((row) => row.holeNumber)).toEqual([9]);
    expect((await listScoresForGame(db, BACK9)).map((row) => row.holeNumber)).toEqual([10]);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await listQueue(db)).toHaveLength(2);

    // Nettet er tilbake: hvert slag går til sitt eget spill.
    mockNetwork.online = true;
    supabase.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
      data: [
        {
          game_id: args.p_game_id,
          user_id: args.p_user_id,
          hole_number: args.p_hole_number,
          strokes: args.p_strokes,
          putts: null,
          entered_by: ME,
          client_updated_at: args.p_client_updated_at,
          updated_at: '2026-11-01T12:00:00.000Z',
          was_applied: true,
        },
      ],
      error: null,
    }));
    await drainQueue('tasting');

    const pushed = supabase.rpc.mock.calls.map(([, args]: [string, Record<string, unknown>]) => [
      args.p_game_id,
      args.p_hole_number,
    ]);
    expect(pushed).toEqual(
      expect.arrayContaining([
        [FRONT9, 9],
        [BACK9, 10],
      ]),
    );
    expect(await listQueue(db)).toHaveLength(0);
  });
});
