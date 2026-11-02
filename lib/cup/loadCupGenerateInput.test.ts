import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { loadCupGenerateInput } from './loadCupGenerateInput';

/**
 * Type A (#2752): det «Fordel & generer» bygger på. En plan som mangler og en lesing
 * som feiler er to ting: den første gir en forklaring, den andre en feil.
 */

type Answer = { data: unknown; error: { message: string } | null };

function client(answers: Record<string, Answer>) {
  const chain = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve(answers[table]),
      maybeSingle: () => Promise.resolve(answers[table]),
    };
    return builder;
  };
  return { from: chain } as unknown as SupabaseClient<Database>;
}

const PLAN = {
  course_id: 'bane',
  tee_box_id: 'gul',
  preset_id: 'singler',
  custom_sessions: null,
  strategy: 'random',
};
const TEE = { id: 'gul', name: 'Gul', archived_at: null, slope_mens: 128 };
const COURSE = { id: 'bane', name: 'Stiklestad', tee_boxes: [TEE] };
const ok = (data: unknown): Answer => ({ data, error: null });
const failed: Answer = { data: null, error: { message: 'nede' } };
const PARTICIPANTS = [
  { user_id: 'a', users: { id: 'a', name: 'Ola Kompis', nickname: null, hcp_index: '12.4', gender: 'mens' } },
  { user_id: 'b', users: { id: 'b', name: 'Kari', nickname: ' Kaja ', hcp_index: -3, gender: 'ladies' } },
  { user_id: 'c', users: null },
];

const load = (plan: Answer, course: Answer, participants: Answer = ok(PARTICIPANTS)) =>
  loadCupGenerateInput(
    client({ tournament_plans: plan, courses: course }),
    client({ tournament_participants: participants }),
    'cup',
    'Ukjent spiller',
  );

describe('loadCupGenerateInput', () => {
  it('gir planen og de påmeldte', async () => {
    const input = await load(ok(PLAN), ok(COURSE));
    expect(input.planCourseName).toBe('Stiklestad');
    expect(input.planTeeName).toBe('Gul');
    expect(input.selectedTee?.id).toBe('gul');
    expect(input.presetId).toBe('singler');
    expect(input.strategy).toBe('random');
    expect(input.participants).toEqual([
      { id: 'a', displayName: 'Ola Kompis', hcpIndex: 12.4, gender: 'mens' },
      { id: 'b', displayName: 'Kaja', hcpIndex: -3, gender: 'ladies' },
      { id: 'c', displayName: 'Ukjent spiller', hcpIndex: 0, gender: null },
    ]);
  });

  it('ingen plan: ingen tee, og standardverdiene', async () => {
    const input = await load(ok(null), ok(null));
    expect(input.selectedTee).toBeUndefined();
    expect(input.presetId).toBe('klassisk');
    expect(input.strategy).toBe('handicap');
  });

  it('en arkivert tee teller ikke', async () => {
    const archived = { ...COURSE, tee_boxes: [{ ...TEE, archived_at: '2026-01-01' }] };
    expect((await load(ok(PLAN), ok(archived))).selectedTee).toBeUndefined();
  });

  it.each([
    ['planen', failed, ok(COURSE), ok(PARTICIPANTS)],
    ['banen', ok(PLAN), failed, ok(PARTICIPANTS)],
    ['de påmeldte', ok(PLAN), ok(COURSE), failed],
  ])('en lesing av %s som feiler, kaster', async (_name, plan, course, participants) => {
    await expect(load(plan, course, participants)).rejects.toEqual({ message: 'nede' });
  });
});
