// native/app/src/data/profile.test.ts
// Native #1906: egen profilrad, lest med anon-klienten.
//
// To ting må holde, og bare de to: at kolonnene faktisk blir bedt om (PR B
// redigerer `gender` og `level`, så en select som stille mister dem ville gitt
// et redigeringsskjema uten verdier), og at en feil fra PostgREST slipper UT som
// et kast i stedet for å bli til en tom profil spilleren prøver å fylle ut.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const ME = 'user-me';

type Mocks = typeof import('../test/supabaseMock');
type Profile = typeof import('./profile');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function profile(): Profile {
  return require('./profile') as Profile;
}

const ROW = {
  name: 'Jørgen Larssen',
  nickname: 'Jøggi',
  hcp_index: 14.2,
  handicap_updated_at: '2026-08-30T10:00:00.000Z',
  gender: 'male',
  level: 'intermediate',
};

describe('fetchOwnProfile', () => {
  useFreshModules();

  it('mapper raden til camelCase og ber om alle seks kolonnene', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const stub = queryStub({ data: ROW, error: null });
    routeFrom({ users: [stub] });

    expect(await profile().fetchOwnProfile(ME)).toEqual({
      name: 'Jørgen Larssen',
      nickname: 'Jøggi',
      hcpIndex: 14.2,
      handicapUpdatedAt: '2026-08-30T10:00:00.000Z',
      gender: 'male',
      level: 'intermediate',
    });

    expect(stepArgs(stub, 'select')[0]![0]).toBe(
      'name, nickname, hcp_index, handicap_updated_at, gender, level',
    );
    // Egen rad, ingen andres: id-filteret ER hele avgrensningen.
    expect(stepArgs(stub, 'eq')).toEqual([['id', ME]]);
    expect(stepArgs(stub, 'single')).toHaveLength(1);
  });

  it('lar tomme felt være tomme i stedet for å finne på en verdi', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [
        queryStub({
          data: { ...ROW, name: null, nickname: null, hcp_index: null },
          error: null,
        }),
      ],
    });

    expect(await profile().fetchOwnProfile(ME)).toMatchObject({
      name: null,
      nickname: null,
      hcpIndex: null,
    });
  });

  it('kaster når PostgREST svarer med feil', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [
        queryStub({
          data: null,
          // Formen `single()` gir når raden ikke finnes — for oss er det ikke
          // en tom profil, det er noe galt, og skjermen skal si fra.
          error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
        }),
      ],
    });

    await expect(profile().fetchOwnProfile(ME)).rejects.toThrow(
      'JSON object requested, multiple (or no) rows returned',
    );
  });
});
