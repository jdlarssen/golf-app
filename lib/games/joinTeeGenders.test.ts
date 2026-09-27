import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

// Type A with Supabase mocked at the boundary (#2209): the tee category every
// path that adds a player after the game was created writes. The rule itself
// is covered in teeChoice.test.ts; what is covered here is reading the game's
// tee and the profiles, and that a failed read never stops a sign-up.

let respond: (op: QueryOp) => QueryResponse = () => ({ data: null });
const fake = createAdminClientMock({ respond: (op) => respond(op) });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const { joinTeeGenders } = await import('./joinTeeGenders');

const FULL_TEE = {
  slope_mens: 130,
  course_rating_mens: 71.2,
  par_total_mens: 72,
  slope_ladies: 128,
  course_rating_ladies: 73.1,
  par_total_ladies: 73,
  slope_juniors: 120,
  course_rating_juniors: 68.5,
  par_total_juniors: 72,
};
const NO_JUNIOR_TEE = {
  ...FULL_TEE,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

const USERS = [
  { id: 'dame', gender: 'ladies', level: 'normal' },
  { id: 'junior', gender: 'mens', level: 'junior' },
  { id: 'herre', gender: 'mens', level: 'normal' },
];
const IDS = ['dame', 'junior', 'herre'];

function answer(game: QueryResponse | Error, users: QueryResponse | Error) {
  respond = (op) => {
    const r = op.table === 'games' ? game : users;
    if (r instanceof Error) throw r;
    return r;
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fake.reset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('joinTeeGenders (#2209)', () => {
  it('dame, junior og herre på fullt ratet tee gir ladies, juniors og mens', async () => {
    answer({ data: { tee_boxes: FULL_TEE } }, { data: USERS });

    await expect(joinTeeGenders('g1', IDS)).resolves.toEqual({
      dame: 'ladies',
      junior: 'juniors',
      herre: 'mens',
    });
    const [gameOp, usersOp] = fake.ops;
    expect(gameOp).toMatchObject({ table: 'games', filters: [{ op: 'eq', column: 'id', value: 'g1' }] });
    expect(usersOp).toMatchObject({ table: 'users', filters: [{ op: 'in', column: 'id', value: IDS }] });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('en tee uten juniorrating gir mens for junioren', async () => {
    answer({ data: { tee_boxes: NO_JUNIOR_TEE } }, { data: USERS });

    await expect(joinTeeGenders('g1', IDS)).resolves.toEqual({
      dame: 'ladies',
      junior: 'mens',
      herre: 'mens',
    });
  });

  it('et spill uten tee gir profilstandarden', async () => {
    answer({ data: { tee_boxes: null } }, { data: USERS });

    await expect(joinTeeGenders('g1', IDS)).resolves.toEqual({
      dame: 'ladies',
      junior: 'juniors',
      herre: 'mens',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('feil ved lesing av brukerne gir mens for alle og logger', async () => {
    answer({ data: { tee_boxes: FULL_TEE } }, { data: null, error: { message: 'boom' } });

    await expect(joinTeeGenders('g1', IDS)).resolves.toEqual({
      dame: 'mens',
      junior: 'mens',
      herre: 'mens',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[joinTeeGenders]'),
      expect.anything(),
    );
  });

  it('et kast fra klienten gir samme utfall som en feil', async () => {
    answer(new Error('network'), new Error('network'));

    await expect(joinTeeGenders('g1', IDS)).resolves.toEqual({
      dame: 'mens',
      junior: 'mens',
      herre: 'mens',
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('feil ved lesing av spillet klemmer ingenting', async () => {
    answer({ data: null, error: { message: 'boom' } }, { data: USERS });

    await expect(joinTeeGenders('g1', IDS)).resolves.toEqual({
      dame: 'ladies',
      junior: 'juniors',
      herre: 'mens',
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('data med feil form regnes som feil', async () => {
    answer({ data: { tee_boxes: [FULL_TEE] } }, { data: { id: 'dame' } });

    await expect(joinTeeGenders('g1', IDS)).resolves.toEqual({
      dame: 'mens',
      junior: 'mens',
      herre: 'mens',
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('hver id får en nøkkel, også en som mangler i users', async () => {
    answer({ data: { tee_boxes: FULL_TEE } }, { data: [USERS[0]] });

    const out = await joinTeeGenders('g1', ['dame', 'ukjent']);
    expect(Object.keys(out).sort()).toEqual(['dame', 'ukjent']);
    expect(out).toEqual({ dame: 'ladies', ukjent: 'mens' });
  });
});
