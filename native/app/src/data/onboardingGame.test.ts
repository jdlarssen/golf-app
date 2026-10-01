// native/app/src/data/onboardingGame.test.ts
// #2216: hvilket spill kortet «… venter på deg» i «Fullfør profilen» viser.
//
// Nettsiden viser spillet du kom fra (`next`). Appen har ingen `next`, så
// regelen er: det nærmeste spillet du står på. Et pågående spill går foran
// et planlagt, og blant de planlagte vinner tidligste start. Et spill du har
// trukket deg fra, eller som er ferdig, gir ikke noe kort. For en ny invitert
// er det spillet invitasjonen gjaldt.
//
// `supabase.ts` kaster uten `EXPO_PUBLIC_SUPABASE_*`, og modulen importerer den
// for hentingen; regelen under er ren og trenger ingen klient.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock-fabrikken kan ikke bruke import
jest.mock('../supabase', () => require('../test/supabaseMock'));

import { pickOnboardingGame, type OnboardingGameRow } from './onboardingGame';

function row(
  id: string,
  status: string,
  teeOffAt: string | null,
  extra: { withdrawn?: boolean; courseName?: string | null } = {},
): OnboardingGameRow {
  return {
    withdrawn_at: extra.withdrawn ? '2026-09-30T10:00:00Z' : null,
    games: {
      id,
      name: `Spill ${id}`,
      status,
      game_mode: 'stableford',
      scheduled_tee_off_at: teeOffAt,
      courses: extra.courseName === null ? null : { name: extra.courseName ?? 'Byneset' },
    },
  };
}

describe('pickOnboardingGame', () => {
  it('ingen spill → ingen kort', () => {
    expect(pickOnboardingGame([])).toBeNull();
  });

  it('gir feltene kortet viser', () => {
    expect(pickOnboardingGame([row('a', 'scheduled', '2026-10-04T07:20:00Z')])).toEqual({
      gameId: 'a',
      name: 'Spill a',
      courseName: 'Byneset',
      teeOffAt: '2026-10-04T07:20:00Z',
      gameMode: 'stableford',
    });
  });

  it('banen kan mangle', () => {
    expect(
      pickOnboardingGame([row('a', 'scheduled', null, { courseName: null })])?.courseName,
    ).toBeNull();
  });

  it('et spill du har trukket deg fra, gir ikke kort', () => {
    expect(pickOnboardingGame([row('a', 'scheduled', null, { withdrawn: true })])).toBeNull();
  });

  it.each(['finished', 'draft'])('et spill med status %s gir ikke kort', (status) => {
    expect(pickOnboardingGame([row('a', status, null)])).toBeNull();
  });

  it('et pågående spill går foran et planlagt', () => {
    expect(
      pickOnboardingGame([
        row('planlagt', 'scheduled', '2026-10-01T07:00:00Z'),
        row('pågår', 'active', '2026-10-02T07:00:00Z'),
      ])?.gameId,
    ).toBe('pågår');
  });

  it('blant de planlagte vinner tidligste start, og et spill uten tid kommer sist', () => {
    expect(
      pickOnboardingGame([
        row('uten-tid', 'scheduled', null),
        row('senere', 'scheduled', '2026-10-09T07:00:00Z'),
        row('først', 'scheduled', '2026-10-04T07:00:00Z'),
      ])?.gameId,
    ).toBe('først');
  });
});
