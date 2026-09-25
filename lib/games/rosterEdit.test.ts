import { describe, it, expect } from 'vitest';
import {
  formOwnsFlight,
  parseLoadedRoster,
  planRosterEdit,
  touchesCupRoster,
  type DesiredRosterRow,
  type PriorRosterRow,
  type RosterEditInput,
  type RosterEditPlan,
} from './rosterEdit';

/**
 * #2210 — an edit writes only what the form actually changed. Every row in the
 * table below is one rule of `planRosterEdit`; together they are the reason a
 * tee-off change no longer wipes paid/accepted/withdrawn/signup on the roster.
 */

const NOW = '2026-09-25T10:00:00.000Z';

function prior(
  user_id: string,
  team_number: number | null,
  flight_number: number | null,
  tee_gender: PriorRosterRow['tee_gender'] = 'mens',
): PriorRosterRow {
  return { user_id, team_number, flight_number, tee_gender };
}

function desired(
  user_id: string,
  team_number: number | null,
  flight_number: number | null,
  tee_gender: DesiredRosterRow['tee_gender'] = null,
): DesiredRosterRow {
  return { user_id, team_number, flight_number, tee_gender };
}

function input(overrides: Partial<RosterEditInput>): RosterEditInput {
  return {
    prior: [],
    desired: [],
    loaded: null,
    modeChanged: false,
    formOwnsFlight: false,
    actorUserId: 'organiser',
    guestIds: new Set(),
    nowIso: NOW,
    ...overrides,
  };
}

const EMPTY: RosterEditPlan = { updates: [], inserts: [], deletes: [] };

describe('planRosterEdit (#2210)', () => {
  it.each<[string, RosterEditInput, RosterEditPlan]>([
    [
      '1. only the tee-off changed: nothing to write',
      input({
        prior: [prior('a', null, 1), prior('b', null, 1, 'ladies')],
        desired: [desired('a', null, null, 'mens'), desired('b', null, null, 'ladies')],
        loaded: new Set(['a', 'b']),
      }),
      EMPTY,
    ],
    [
      '2. team swap: one patch with only team/flight',
      input({
        prior: [prior('a', 1, 1), prior('b', 2, 2)],
        desired: [desired('a', 2, 2), desired('b', 2, 2)],
        loaded: new Set(['a', 'b']),
      }),
      {
        updates: [{ user_id: 'a', patch: { team_number: 2, flight_number: 2 } }],
        inserts: [],
        deletes: [],
      },
    ],
    [
      '3a. tee category sent and different: patch tee_gender',
      input({
        prior: [prior('a', null, null, 'mens')],
        desired: [desired('a', null, null, 'ladies')],
        loaded: new Set(['a']),
      }),
      {
        updates: [{ user_id: 'a', patch: { tee_gender: 'ladies' } }],
        inserts: [],
        deletes: [],
      },
    ],
    [
      '3b. tee category not sent: no patch (stored category stands)',
      input({
        prior: [prior('a', null, null, 'ladies')],
        desired: [desired('a', null, null, null)],
        loaded: new Set(['a']),
      }),
      EMPTY,
    ],
    [
      '4. new players: organiser accepted now, others pending, guest accepted now',
      input({
        prior: [],
        desired: [
          desired('organiser', 1, 1, 'mens'),
          desired('friend', 1, 1, 'ladies'),
          desired('guest', 2, 2, null),
        ],
        loaded: new Set(),
        guestIds: new Set(['guest']),
      }),
      {
        updates: [],
        inserts: [
          {
            user_id: 'organiser',
            team_number: 1,
            flight_number: 1,
            tee_gender: 'mens',
            course_handicap: null,
            accepted_at: NOW,
          },
          {
            user_id: 'friend',
            team_number: 1,
            flight_number: 1,
            tee_gender: 'ladies',
            course_handicap: null,
            accepted_at: null,
          },
          {
            user_id: 'guest',
            team_number: 2,
            flight_number: 2,
            tee_gender: 'mens',
            course_handicap: null,
            accepted_at: NOW,
          },
        ],
        deletes: [],
      },
    ],
    [
      '5. removed in the form (loaded, not desired): delete',
      input({
        prior: [prior('a', null, null), prior('b', null, null)],
        desired: [desired('a', null, null)],
        loaded: new Set(['a', 'b']),
      }),
      { updates: [], inserts: [], deletes: ['b'] },
    ],
    [
      '6. signed up after the form opened (prior only): untouched',
      input({
        prior: [prior('a', null, null), prior('late', null, null)],
        desired: [desired('a', null, null)],
        loaded: new Set(['a']),
      }),
      EMPTY,
    ],
    [
      '7. left while the form was open (loaded + desired, not prior): no insert',
      input({
        prior: [prior('a', null, null)],
        desired: [desired('a', null, null), desired('gone', null, null)],
        loaded: new Set(['a', 'gone']),
      }),
      EMPTY,
    ],
    [
      '8a. solo format, flight 2 from the Flights section, form null/null, same mode: no patch',
      input({
        prior: [prior('a', null, 2)],
        desired: [desired('a', null, null)],
        loaded: new Set(['a']),
      }),
      EMPTY,
    ],
    [
      '8b. same, but the draft changed format: flight follows the form',
      input({
        prior: [prior('a', null, 2)],
        desired: [desired('a', null, null)],
        loaded: new Set(['a']),
        modeChanged: true,
      }),
      {
        updates: [{ user_id: 'a', patch: { flight_number: null } }],
        inserts: [],
        deletes: [],
      },
    ],
    [
      '9. no team before or after: no patch',
      input({
        prior: [prior('a', null, null)],
        desired: [desired('a', null, null)],
        loaded: new Set(['a']),
        formOwnsFlight: true,
      }),
      EMPTY,
    ],
    [
      '10. released from a team (3/3 → null/null)',
      input({
        prior: [prior('a', 3, 3)],
        desired: [desired('a', null, null)],
        loaded: new Set(['a']),
        formOwnsFlight: true,
      }),
      {
        updates: [{ user_id: 'a', patch: { team_number: null, flight_number: null } }],
        inserts: [],
        deletes: [],
      },
    ],
    [
      '11. loaded = null (old tab): prior − desired deleted, desired − prior inserted',
      input({
        prior: [prior('a', null, null), prior('late', null, null)],
        desired: [desired('a', null, null), desired('new', null, null)],
        loaded: null,
      }),
      {
        updates: [],
        inserts: [
          {
            user_id: 'new',
            team_number: null,
            flight_number: null,
            tee_gender: 'mens',
            course_handicap: null,
            accepted_at: null,
          },
        ],
        deletes: ['late'],
      },
    ],
    [
      '12. cup singles: cup draw put both sides in flight 1, form sends 1/2: no patch',
      input({
        prior: [prior('a', 1, 1), prior('b', 2, 1)],
        desired: [desired('a', 1, 1), desired('b', 2, 2)],
        loaded: new Set(['a', 'b']),
      }),
      EMPTY,
    ],
    [
      '13. team format (texas) with flights from the Flights section, same teams: no patch',
      input({
        prior: [prior('a', 1, 2), prior('b', 1, 2), prior('c', 2, 1), prior('d', 2, 1)],
        desired: [desired('a', 1, 1), desired('b', 1, 1), desired('c', 2, 2), desired('d', 2, 2)],
        loaded: new Set(['a', 'b', 'c', 'd']),
      }),
      EMPTY,
    ],
    [
      '14. best ball, same team, the form moves flight 1 → 2: patch only flight',
      input({
        prior: [prior('a', 1, 1)],
        desired: [desired('a', 1, 2)],
        loaded: new Set(['a']),
        formOwnsFlight: true,
      }),
      {
        updates: [{ user_id: 'a', patch: { flight_number: 2 } }],
        inserts: [],
        deletes: [],
      },
    ],
  ])('%s', (_label, planInput, expected) => {
    expect(planRosterEdit(planInput)).toEqual(expected);
  });

  it('never puts a column outside team/flight/tee in a patch', () => {
    const plan = planRosterEdit(
      input({
        prior: [prior('a', 1, 1, 'mens')],
        desired: [desired('a', 2, 2, 'juniors')],
        loaded: new Set(['a']),
      }),
    );
    expect(Object.keys(plan.updates[0]!.patch).sort()).toEqual([
      'flight_number',
      'team_number',
      'tee_gender',
    ]);
  });
});

describe('parseLoadedRoster (#2210)', () => {
  it.each<[string, Record<string, string>, string[] | null]>([
    ['field missing → null (old tab or create)', {}, null],
    ['empty string → empty set (roster was empty)', { roster_loaded_ids: '' }, []],
    ['two ids', { roster_loaded_ids: 'u1,u2' }, ['u1', 'u2']],
  ])('%s', (_label, entries, expected) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    const result = parseLoadedRoster(fd);
    expect(result === null ? null : [...result].sort()).toEqual(expected);
  });
});

describe('formOwnsFlight (#2210)', () => {
  it.each([
    ['best_ball', true],
    ['stableford', false],
    ['texas_scramble', false],
    ['singles_matchplay', false],
    ['fourball_matchplay', false],
    ['skins', false],
  ])('%s → %s', (mode, expected) => {
    expect(formOwnsFlight(mode)).toBe(expected);
  });
});

describe('touchesCupRoster (#2210)', () => {
  const row = {
    user_id: 'x',
    team_number: 1,
    flight_number: 1,
    tee_gender: 'mens' as const,
    course_handicap: null,
    accepted_at: null,
  };
  it.each<[string, RosterEditPlan, boolean]>([
    ['insert', { updates: [], inserts: [row], deletes: [] }, true],
    ['delete', { updates: [], inserts: [], deletes: ['x'] }, true],
    [
      'patch with team_number',
      { updates: [{ user_id: 'x', patch: { team_number: 2, flight_number: 2 } }], inserts: [], deletes: [] },
      true,
    ],
    [
      'patch with only flight_number',
      { updates: [{ user_id: 'x', patch: { flight_number: 2 } }], inserts: [], deletes: [] },
      false,
    ],
    [
      'patch with only tee_gender',
      { updates: [{ user_id: 'x', patch: { tee_gender: 'ladies' } }], inserts: [], deletes: [] },
      false,
    ],
    ['empty plan', EMPTY, false],
  ])('%s → %s', (_label, plan, expected) => {
    expect(touchesCupRoster(plan)).toBe(expected);
  });
});
