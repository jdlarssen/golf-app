// native/app/src/data/createCourse.test.ts
// #2757: lagringen av en ny bane mot supabase-mocken (Type A). RPC-argumentene er
// kontrakten mot 0224, og fasongen er den nettets serveraksjon sender.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { emptyTee } from '../../../../lib/courses/teeChips';
import { emptyCourseDraft, parseCourseDraft, setHoleIndex } from '../lib/courseDraft';
import { createCourse } from './createCourse';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const { supabase } = require('../test/supabaseMock') as typeof import('../test/supabaseMock');

function parsed(length = '') {
  const draft = emptyCourseDraft('Testbane 2757').holes.reduce(
    (d, _hole, i) => setHoleIndex(d, i, String(i + 1)),
    emptyCourseDraft('Testbane 2757'),
  );
  return parseCourseDraft({
    ...draft,
    tees: [{ ...emptyTee('Gul', 'yellow'), slope_mens: '125', course_rating_mens: '70,5', length_meters: length }],
  });
}

beforeEach(() => {
  supabase.rpc.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createCourse', () => {
  it('sender nettets fasong, uten tee-id, og gir bane-id-en tilbake', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'course-1', error: null });
    await expect(createCourse(parsed())).resolves.toEqual({ ok: true, courseId: 'course-1' });

    const [name, args] = supabase.rpc.mock.calls[0]!;
    expect(name).toBe('create_course_with_layout');
    expect(args.p_name).toBe('Testbane 2757');
    expect(args.p_nine_holes).toBe(false);
    expect(args.p_holes).toHaveLength(18);
    expect(args.p_tees).toEqual([
      {
        name: 'Gul',
        color: 'yellow',
        length_meters: null,
        slope_mens: 125,
        course_rating_mens: 70.5,
        par_total_mens: 72,
        slope_ladies: null,
        course_rating_ladies: null,
        par_total_ladies: null,
        slope_juniors: null,
        course_rating_juniors: null,
        par_total_juniors: null,
      },
    ]);
  });

  it('lengden går som tall', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'course-1', error: null });
    await createCourse(parsed('5800'));
    expect(supabase.rpc.mock.calls[0]![1].p_tees[0].length_meters).toBe(5800);
  });

  it.each([null, ''])('tom data (%j) er en feil, ikke en lagret bane', async (data) => {
    supabase.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(createCourse(parsed())).resolves.toEqual({ ok: false, code: 'no_row' });
  });

  it.each([
    ['TypeError: Network request failed', 'network'],
    ['Network request failed (timeout)', 'network'],
    ['not_authenticated', 'not_authenticated'],
    ['new row violates check constraint', 'db'],
  ])('%s → %s', async (message, code) => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message } });
    await expect(createCourse(parsed())).resolves.toEqual({ ok: false, code });
  });
});
