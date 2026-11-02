// native/app/src/data/similarCourses.test.ts
// #2757: «Finnes banen alt?» mot supabase-mocken (Type A).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fetchSimilarCourses } from './similarCourses';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const { supabase } = require('../test/supabaseMock') as typeof import('../test/supabaseMock');

beforeEach(() => {
  supabase.rpc.mockReset();
});

describe('fetchSimilarCourses', () => {
  it('spør ikke under tre tegn', async () => {
    await expect(fetchSimilarCourses(' by ')).resolves.toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('sender det klippede navnet og gir radene i appens form', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [
        { id: 'c1', name: 'Byneset Golfklubb', slug: 'byneset', hole_count: 18, par: 72, tee_count: 2, round_count: 41 },
      ],
      error: null,
    });
    await expect(fetchSimilarCourses('  byneset ')).resolves.toEqual([
      { id: 'c1', name: 'Byneset Golfklubb', holeCount: 18, par: 72, teeCount: 2, roundCount: 41 },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('similar_courses', { p_query: 'byneset' });
  });

  it('en feil gir tom liste, ingen melding', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchSimilarCourses('byneset')).resolves.toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
