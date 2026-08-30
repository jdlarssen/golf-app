// Native N3 (#1825): spill-bundelen — hent, lagre, les tilbake.
//
// Det som må holde er cache-kontrakten: en feilet refetch skal ALDRI etterlate
// spilleren uten bane midt i en runde. Derfor er «feil rører ikke forrige
// oppføring» like viktig som selve rundturen.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const GAME = 'game-1';
const ME = 'user-me';

type Mocks = typeof import('../test/supabaseMock');
type Bundle = typeof import('./gameBundle');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function bundleModule(): Bundle {
  return require('./gameBundle') as Bundle;
}

const GAME_ROW = {
  id: GAME,
  name: 'Torsdagsrunden',
  status: 'active',
  game_mode: 'stroke_play',
  mode_config: { foo: 1 },
  course_id: 'course-1',
  tee_box_id: 'tee-1',
  require_peer_approval: true,
  scheduled_tee_off_at: '2026-08-30T14:00:00.000Z',
  hole_segment: 'full',
  source_game_id: null,
  created_by: 'user-admin',
  courses: {
    name: 'Losby',
    // Med vilje i feil rekkefølge: bundelen skal sortere hullene.
    course_holes: [
      {
        hole_number: 2,
        par_mens: 3,
        par_ladies: 3,
        par_juniors: 3,
        stroke_index: 17,
      },
      {
        hole_number: 1,
        par_mens: 4,
        par_ladies: 5,
        par_juniors: 4,
        stroke_index: 9,
      },
    ],
  },
  tee_boxes: { name: 'Gul' },
};

const PLAYER_ROWS = [
  {
    user_id: ME,
    team_number: null,
    flight_number: 1,
    course_handicap: 12,
    tee_gender: 'mens',
    submitted_at: null,
    approved_at: null,
    rejection_reason: null,
    withdrawn_at: null,
    users: { name: 'Jørgen', nickname: 'Jøgge' },
  },
];

function riggFetch(): void {
  const { queryStub, routeFrom } = mocks();
  routeFrom({
    games: [queryStub({ data: GAME_ROW, error: null })],
    game_players: [queryStub({ data: PLAYER_ROWS, error: null })],
  });
}

describe('gameBundle', () => {
  useFreshModules();

  it('henter, lagrer og leser tilbake den samme bundelen', async () => {
    riggFetch();
    const { loadGameBundle, refreshGameBundle } = bundleModule();

    const fetched = await refreshGameBundle(GAME);

    expect(fetched.game).toEqual({
      id: GAME,
      name: 'Torsdagsrunden',
      status: 'active',
      gameMode: 'stroke_play',
      modeConfig: { foo: 1 },
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: true,
      scheduledTeeOffAt: '2026-08-30T14:00:00.000Z',
      holeSegment: 'full',
      sourceGameId: null,
      createdBy: 'user-admin',
    });
    expect(fetched.courseName).toBe('Losby');
    expect(fetched.teeBoxName).toBe('Gul');
    expect(fetched.holes.map((h) => h.holeNumber)).toEqual([1, 2]);
    expect(fetched.players).toEqual([
      {
        userId: ME,
        name: 'Jørgen',
        nickname: 'Jøgge',
        teamNumber: null,
        flightNumber: 1,
        // Frossen kolonne — aldri regnet om i appen.
        courseHandicap: 12,
        teeGender: 'mens',
        submittedAt: null,
        approvedAt: null,
        rejectionReason: null,
        withdrawnAt: null,
      },
    ]);

    // Rundturen: det som ligger på enheten er det samme som ble hentet.
    expect(await loadGameBundle(GAME)).toEqual(fetched);
  });

  it('spør med FK-hintet på users — et bart users(...) er tvetydig og feiler', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const players = queryStub({ data: PLAYER_ROWS, error: null });
    routeFrom({
      games: [queryStub({ data: GAME_ROW, error: null })],
      game_players: [players],
    });

    await bundleModule().fetchGameBundle(GAME);

    expect(String(stepArgs(players, 'select')[0]![0])).toContain(
      'users!game_players_user_id_fkey(name, nickname)',
    );
  });

  it('lar den forrige bundelen stå når en refetch feiler', async () => {
    riggFetch();
    const { loadGameBundle, refreshGameBundle } = bundleModule();
    const first = await refreshGameBundle(GAME);

    // Nettet falt: spilleren står på hull 8 og skal IKKE miste banen sin.
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      games: [queryStub({ data: null, error: { message: 'Network request failed' } })],
      game_players: [queryStub({ data: null, error: null })],
    });

    await expect(refreshGameBundle(GAME)).rejects.toThrow('Network request failed');
    expect(await loadGameBundle(GAME)).toEqual(first);
  });

  it('gir undefined når spillet aldri er hentet', async () => {
    expect(await bundleModule().loadGameBundle('ukjent')).toBeUndefined();
  });

  it('kaster når spillet ikke er synlig for spilleren', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      games: [queryStub({ data: null, error: null })],
      game_players: [queryStub({ data: [], error: null })],
    });

    await expect(bundleModule().fetchGameBundle(GAME)).rejects.toThrow(
      /Fant ikke spillet/,
    );
  });
});
