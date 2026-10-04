// #2204: hvorfor runden ikke starter, slik appens venterom ser det (Type A
// mot supabase-mocken). Bundelen bygges om til samme input som serveren gir
// `startBlockReason`, og svaret blir det venterommet skal si.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';
import { homeBundle, homePlayer } from '../test/homeFixtures';
import type { BundleTeeRatings, GameBundle } from './gameBundle';

jest.mock('../supabase', () => require('../test/supabaseMock'));

type Mocks = typeof import('../test/supabaseMock');
type StartBlockModule = typeof import('./startBlock');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function subject(): StartBlockModule {
  return require('./startBlock') as StartBlockModule;
}

const TEE: BundleTeeRatings = {
  lengthMeters: 5800,
  slopeMens: 130,
  courseRatingMens: 72.1,
  parTotalMens: 72,
  slopeLadies: null,
  courseRatingLadies: null,
  parTotalLadies: null,
  slopeJuniors: 120,
  courseRatingJuniors: 70.2,
  parTotalJuniors: 72,
};

const TEE_OFF = '2026-09-10T08:00:00.000Z';
const WITHDREW_EARLY = '2026-09-09T20:00:00.000Z';

function scheduled(opts: Parameters<typeof homeBundle>[0], tee: BundleTeeRatings | null = TEE): GameBundle {
  return {
    ...homeBundle({
      ...opts,
      game: { status: 'scheduled', teeBoxId: 'tee-1', scheduledTeeOffAt: TEE_OFF, ...opts.game },
    }),
    teeRatings: tee,
  };
}

describe('startBlockInput', () => {
  it('gir serverens input: alle ni rating-feltene, hasUser på hver rad, ukjent cup-status', () => {
    const bundle = scheduled({
      players: [
        homePlayer({ userId: 'u1', teeGender: 'mens' }),
        homePlayer({ userId: 'u2', name: null, teeGender: 'ladies', withdrawnAt: WITHDREW_EARLY }),
      ],
    });

    expect(subject().startBlockInput(bundle, ['u1'])).toEqual({
      gameMode: 'stableford',
      modeConfig: {},
      teeBoxId: 'tee-1',
      tee: {
        slope_mens: 130,
        course_rating_mens: 72.1,
        par_total_mens: 72,
        slope_ladies: null,
        course_rating_ladies: null,
        par_total_ladies: null,
        slope_juniors: 120,
        course_rating_juniors: 70.2,
        par_total_juniors: 72,
      },
      tournamentId: null,
      tournamentStatus: null,
      scheduledTeeOffAt: TEE_OFF,
      roster: [
        { userId: 'u1', teeGender: 'mens', teamNumber: null, flightNumber: 1, withdrawnAt: null, hasUser: true },
        {
          userId: 'u2',
          teeGender: 'ladies',
          teamNumber: null,
          flightNumber: 1,
          withdrawnAt: WITHDREW_EARLY,
          hasUser: true,
        },
      ],
      pendingUserIds: ['u1'],
    });
  });

  it('uten tee-rating i bundelen er teen null', () => {
    expect(subject().startBlockInput(scheduled({ players: [] }, null), []).tee).toBeNull();
  });
});

describe('fetchStartBlock', () => {
  useFreshModules();

  it('en dame på en tee uten damerating stopper runden: oppsettet må ordnes', async () => {
    mocks().supabase.rpc.mockResolvedValue({ data: [], error: null });
    const bundle = scheduled({
      players: [homePlayer({ userId: 'u1' }), homePlayer({ userId: 'u2', teeGender: 'ladies' })],
    });

    expect(await subject().fetchStartBlock(bundle)).toBe('structural');
    expect(mocks().supabase.rpc).toHaveBeenCalledWith('incomplete_profile_ids', {
      p_user_ids: ['u1', 'u2'],
    });
  });

  it('en spiller uten ferdig profil stopper runden', async () => {
    mocks().supabase.rpc.mockResolvedValue({ data: [{ id: 'u2' }], error: null });
    const bundle = scheduled({ players: [homePlayer({ userId: 'u1' }), homePlayer({ userId: 'u2' })] });

    expect(await subject().fetchStartBlock(bundle)).toBe('structural');
  });

  it('et spill som kan starte gir ingen sperre', async () => {
    mocks().supabase.rpc.mockResolvedValue({ data: [], error: null });
    const bundle = scheduled({ players: [homePlayer({ userId: 'u1' }), homePlayer({ userId: 'u2' })] });

    expect(await subject().fetchStartBlock(bundle)).toBeNull();
  });

  it('feil fra RPC-en gir ingen sperre', async () => {
    mocks().supabase.rpc.mockResolvedValue({ data: null, error: { message: 'nede' } });
    const bundle = scheduled({ players: [homePlayer({ userId: 'u1' }), homePlayer({ userId: 'u2' })] });

    expect(await subject().fetchStartBlock(bundle)).toBeNull();
  });

  it('en cup-kamp avgjort ved trekk blir ikke spilt', async () => {
    mocks().supabase.rpc.mockResolvedValue({ data: [], error: null });
    const bundle = scheduled({
      game: {
        gameMode: 'singles_matchplay',
        modeConfig: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
        tournamentId: 'cup-1',
      },
      players: [
        homePlayer({ userId: 'a1', teamNumber: 1 }),
        homePlayer({ userId: 'b1', teamNumber: 2, withdrawnAt: WITHDREW_EARLY }),
      ],
    });

    expect(await subject().fetchStartBlock(bundle)).toBe('will_not_play');
  });

  it('en fourball der arrangøren ikke har valgt om makkeren spiller alene, venter på oppsettet', async () => {
    mocks().supabase.rpc.mockResolvedValue({ data: [], error: null });
    const bundle = scheduled({
      game: {
        gameMode: 'fourball_matchplay',
        modeConfig: { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 },
        tournamentId: 'cup-1',
      },
      players: [
        homePlayer({ userId: 'a1', teamNumber: 1 }),
        homePlayer({ userId: 'a2', teamNumber: 1, withdrawnAt: WITHDREW_EARLY }),
        homePlayer({ userId: 'b1', teamNumber: 2 }),
        homePlayer({ userId: 'b2', teamNumber: 2 }),
      ],
    });

    expect(await subject().fetchStartBlock(bundle)).toBe('structural');
  });
});
