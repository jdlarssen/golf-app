import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWeeklyRepeatInsert,
  canRepeatWeekly,
  nextWeeklyLocal,
  nextWeeklyTeeOff,
  type WeeklyRepeatPlayer,
  type WeeklyRepeatSource,
} from './weeklyRepeat';

// #2460 «Gjenta hver uke». Type A: the rule, the date math and the row the
// finish tail inserts. Absolute dates are fine here: `now` is always passed in.

describe('canRepeatWeekly', () => {
  const standalone = {
    tournamentId: null,
    leagueRoundId: null,
    sourceGameId: null,
    groupId: null,
    teeOffNow: false,
  };

  it('allows a standalone round (Kompis and Solo)', () => {
    expect(canRepeatWeekly(standalone)).toBe(true);
  });

  it.each([
    ['a cup match', { tournamentId: 'cup-1' }],
    ['a league round', { leagueRoundId: 'lr-1' }],
    ['a derived game', { sourceGameId: 'g-0' }],
    ['a club tournament', { groupId: 'club-1' }],
    ['a club cup match', { groupId: 'club-1', tournamentId: 'cup-1' }],
    ['a round with tee-off «Nå»', { teeOffNow: true }],
  ])('refuses %s', (_label, overrides) => {
    expect(canRepeatWeekly({ ...standalone, ...overrides })).toBe(false);
  });

  it('treats empty strings as no link (raw form values)', () => {
    expect(
      canRepeatWeekly({ ...standalone, tournamentId: '', groupId: '', sourceGameId: '' }),
    ).toBe(true);
  });
});

/**
 * AGENTS.md trap #4: the CHECK `games_repeat_weekly_standalone` (0240) and
 * `canRepeatWeekly` must agree on every combination the CHECK covers. The
 * columns the CHECK requires to be null are read from the migration, so a
 * column added to one side only turns this red.
 */
describe('canRepeatWeekly agrees with games_repeat_weekly_standalone', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', 'supabase', 'migrations', '0240_games_repeat_weekly.sql'),
    'utf8',
  );
  const check = /games_repeat_weekly_standalone check \(([\s\S]*?)\);/i.exec(sql)?.[1] ?? '';
  const nullColumns = [...check.matchAll(/(\w+) is null/g)].map((m) => m[1]);

  it('the CHECK requires tournament_id, league_round_id and source_game_id to be null', () => {
    expect(check).toMatch(/not repeat_weekly\s+or/);
    expect(nullColumns).toEqual(['tournament_id', 'league_round_id', 'source_game_id']);
  });

  const toInput: Record<string, 'tournamentId' | 'leagueRoundId' | 'sourceGameId'> = {
    tournament_id: 'tournamentId',
    league_round_id: 'leagueRoundId',
    source_game_id: 'sourceGameId',
  };

  for (let mask = 0; mask < 1 << 3; mask++) {
    const set = ['tournament_id', 'league_round_id', 'source_game_id'].filter(
      (_, i) => mask & (1 << i),
    );
    it(`agrees with ${set.length ? set.join(' + ') : 'no link'} set`, () => {
      const row = Object.fromEntries(nullColumns.map((c) => [c, set.includes(c) ? 'x' : null]));
      const checkAllows = nullColumns.every((c) => row[c] === null);
      const input = {
        tournamentId: null,
        leagueRoundId: null,
        sourceGameId: null,
        groupId: null,
        teeOffNow: false,
      };
      for (const c of set) input[toInput[c]] = 'x' as never;

      expect(canRepeatWeekly(input)).toBe(checkAllows);
    });
  }
});

describe('nextWeeklyLocal', () => {
  it('adds seven calendar days to the wall clock', () => {
    expect(nextWeeklyLocal('2026-10-03T09:00')).toBe('2026-10-10T09:00');
  });

  it('crosses a month and a year', () => {
    expect(nextWeeklyLocal('2026-12-28T18:30')).toBe('2027-01-04T18:30');
  });

  it('keeps midnight', () => {
    expect(nextWeeklyLocal('2026-11-21T00:00')).toBe('2026-11-28T00:00');
  });

  it.each(['', '2026-11-21', 'nonsense', '2026-13-01T09:00'])('is null for %j', (value) => {
    expect(nextWeeklyLocal(value)).toBeNull();
  });
});

describe('nextWeeklyTeeOff', () => {
  it('is one week later at the same Oslo time', () => {
    // Saturday 21.11.2026 09:00 Oslo (CET, UTC+1).
    expect(nextWeeklyTeeOff('2026-11-21T08:00:00.000Z', '2026-11-21T12:00:00.000Z')).toBe(
      '2026-11-28T08:00:00.000Z',
    );
  });

  it('keeps 09:00 Oslo when summer time ends in between', () => {
    // Saturday 24.10.2026 09:00 CEST (07:00Z) → Saturday 31.10.2026 09:00 CET (08:00Z).
    expect(nextWeeklyTeeOff('2026-10-24T07:00:00.000Z', '2026-10-24T11:00:00.000Z')).toBe(
      '2026-10-31T08:00:00.000Z',
    );
  });

  it('keeps 09:00 Oslo when summer time starts in between', () => {
    // Saturday 27.03.2027 09:00 CET (08:00Z) → Saturday 03.04.2027 09:00 CEST (07:00Z).
    expect(nextWeeklyTeeOff('2027-03-27T08:00:00.000Z', '2027-03-27T12:00:00.000Z')).toBe(
      '2027-04-03T07:00:00.000Z',
    );
  });

  it('never lands in the past when the round is finished late', () => {
    // Tee-off Saturday 07.11, finished Sunday 22.11: the 14th has passed, so
    // the next round is Saturday 28.11.
    expect(nextWeeklyTeeOff('2026-11-07T08:00:00.000Z', '2026-11-22T10:00:00.000Z')).toBe(
      '2026-11-28T08:00:00.000Z',
    );
  });

  it('skips a week that starts exactly now', () => {
    expect(nextWeeklyTeeOff('2026-11-14T08:00:00.000Z', '2026-11-21T08:00:00.000Z')).toBe(
      '2026-11-28T08:00:00.000Z',
    );
  });

  it('keeps midnight Oslo on the same weekday', () => {
    // Friday 20.11.2026 00:00 Oslo is Thursday 19.11 23:00Z.
    expect(nextWeeklyTeeOff('2026-11-19T23:00:00.000Z', '2026-11-20T05:00:00.000Z')).toBe(
      '2026-11-26T23:00:00.000Z',
    );
  });

  it('keeps 23:30 Oslo on the same weekday', () => {
    expect(nextWeeklyTeeOff('2026-11-20T22:30:00.000Z', '2026-11-21T01:00:00.000Z')).toBe(
      '2026-11-27T22:30:00.000Z',
    );
  });

  it.each([null, '', 'not a date'])('is null without a usable tee-off (%j)', (prev) => {
    expect(nextWeeklyTeeOff(prev, '2026-11-21T12:00:00.000Z')).toBeNull();
  });
});

function source(overrides: Partial<WeeklyRepeatSource> = {}): WeeklyRepeatSource {
  return {
    id: 'g-1',
    name: 'Lørdagsrunden',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: 90,
    require_peer_approval: true,
    score_visibility: 'reveal',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1, ranking: 'points' },
    registration_mode: 'invite_only',
    registration_type: 'solo',
    let_friends_skip_gate: false,
    entry_fee_kr: 100,
    payment_link: '12345',
    prizes: [{ slot: 'place_1', text: 'Kake' }],
    side_tournament_enabled: true,
    side_ld_count: 1,
    side_ctp_count: 2,
    side_ld_holes: [7],
    side_ctp_holes: [3, 11],
    side_disabled_categories: ['clean_front_9'],
    start_type: 'first_tee',
    created_by: 'org',
    group_id: null,
    tournament_id: null,
    tournament_match_label: null,
    hole_segment: 'full',
    scheduled_tee_off_at: '2026-11-21T08:00:00.000Z',
    ...overrides,
  };
}

function player(overrides: Partial<WeeklyRepeatPlayer> = {}): WeeklyRepeatPlayer {
  return {
    user_id: 'u-1',
    team_number: null,
    flight_number: 1,
    tee_gender: 'mens',
    withdrawn_at: null,
    ...overrides,
  };
}

const NOW = '2026-11-21T13:00:00.000Z';
const NEXT = '2026-11-28T08:00:00.000Z';

describe('buildWeeklyRepeatInsert', () => {
  const opts = { newGameId: 'g-2', guestIds: new Set<string>(), nowIso: NOW };

  it('copies the round and schedules it at the next tee-off', () => {
    const { game } = buildWeeklyRepeatInsert(source(), [], NEXT, 'Bogstad', opts);

    expect(game).toEqual({
      id: 'g-2',
      name: 'Lørdagsrunden',
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      hcp_allowance_pct: 90,
      require_peer_approval: true,
      score_visibility: 'reveal',
      game_mode: 'stableford',
      mode_config: { kind: 'stableford', team_size: 1, ranking: 'points' },
      registration_mode: 'invite_only',
      registration_type: 'solo',
      let_friends_skip_gate: false,
      entry_fee_kr: 100,
      payment_link: '12345',
      prizes: [{ slot: 'place_1', text: 'Kake' }],
      side_tournament_enabled: true,
      side_ld_count: 1,
      side_ctp_count: 2,
      side_ld_holes: [7],
      side_ctp_holes: [3, 11],
      side_disabled_categories: ['clean_front_9'],
      status: 'scheduled',
      scheduled_tee_off_at: NEXT,
      start_type: 'first_tee',
      created_by: 'org',
      started_at: null,
      ended_at: null,
      finish_pipeline_at: null,
      round_report: null,
      group_id: null,
      tournament_id: null,
      tournament_match_label: null,
      hole_segment: 'full',
      repeat_weekly: true,
      repeated_from_game_id: 'g-1',
    });
  });

  it('keeps mode_config as it is (no new stamping)', () => {
    const modeConfig = { kind: 'solo_strokeplay', ranking: 'gross' };
    const { game } = buildWeeklyRepeatInsert(
      source({ game_mode: 'solo_strokeplay', mode_config: modeConfig }),
      [],
      NEXT,
      'Bogstad',
      opts,
    );

    expect(game.mode_config).toBe(modeConfig);
  });

  it('gives an auto-made name the new date', () => {
    const { game } = buildWeeklyRepeatInsert(
      source({ name: 'Bogstad 21. november' }),
      [],
      NEXT,
      'Bogstad',
      opts,
    );

    expect(game.name).toBe('Bogstad 28. november');
  });

  it('gives a course-only name the new date', () => {
    const { game } = buildWeeklyRepeatInsert(source({ name: 'Bogstad' }), [], NEXT, 'Bogstad', opts);

    expect(game.name).toBe('Bogstad 28. november');
  });

  it('keeps an English auto-made name in English', () => {
    const { game } = buildWeeklyRepeatInsert(
      source({ name: 'Bogstad 21 November' }),
      [],
      NEXT,
      'Bogstad',
      opts,
    );

    expect(game.name).toBe('Bogstad 28 November');
  });

  it('dates the name in Oslo time, not UTC (a late-evening tee-off)', () => {
    // Saturday 28.11 00:30 Oslo is still Friday 27.11 23:30Z.
    const { game } = buildWeeklyRepeatInsert(
      source({ name: 'Bogstad 21. november' }),
      [],
      '2026-11-27T23:30:00.000Z',
      'Bogstad',
      opts,
    );

    expect(game.name).toBe('Bogstad 28. november');
  });

  it('keeps the organiser’s own name', () => {
    const { game } = buildWeeklyRepeatInsert(
      source({ name: 'Bogstad Open' }),
      [],
      NEXT,
      'Bogstad',
      opts,
    );

    expect(game.name).toBe('Bogstad Open');
  });

  it('brings the active players, not the withdrawn ones', () => {
    const { players } = buildWeeklyRepeatInsert(
      source(),
      [
        player({ user_id: 'org', tee_gender: 'mens' }),
        player({ user_id: 'u-2', tee_gender: 'ladies', flight_number: 2 }),
        player({ user_id: 'u-3', withdrawn_at: '2026-11-20T10:00:00.000Z' }),
      ],
      NEXT,
      'Bogstad',
      opts,
    );

    expect(players).toEqual([
      {
        game_id: 'g-2',
        user_id: 'org',
        team_number: null,
        flight_number: 1,
        tee_gender: 'mens',
        course_handicap: null,
        accepted_at: NOW,
      },
      {
        game_id: 'g-2',
        user_id: 'u-2',
        team_number: null,
        flight_number: 2,
        tee_gender: 'ladies',
        course_handicap: null,
        accepted_at: null,
      },
    ]);
  });

  it('confirms a guest at once (a guest cannot confirm)', () => {
    const { players } = buildWeeklyRepeatInsert(
      source(),
      [player({ user_id: 'guest-1' })],
      NEXT,
      'Bogstad',
      { ...opts, guestIds: new Set(['guest-1']) },
    );

    expect(players[0].accepted_at).toBe(NOW);
  });

  it('keeps teams in a team format', () => {
    const { players } = buildWeeklyRepeatInsert(
      source({ game_mode: 'best_ball' }),
      [player({ team_number: 2, flight_number: 1 })],
      NEXT,
      'Bogstad',
      opts,
    );

    expect(players[0]).toMatchObject({ team_number: 2, flight_number: 1 });
  });

  it.each(['wolf', 'round_robin'])('clears the rotation slots in %s (drawn at start)', (mode) => {
    const { players } = buildWeeklyRepeatInsert(
      source({ game_mode: mode }),
      [player({ team_number: 3, flight_number: 3 })],
      NEXT,
      'Bogstad',
      opts,
    );

    expect(players[0]).toMatchObject({ team_number: null, flight_number: null });
  });
});

/**
 * AGENTS.md trap #4: the successor copies every column the wizard's insert
 * writes (`createGameInternal`). A column added there and not here would start
 * every weekly round with its default. The insert is read from the action's
 * source, the same way `editGameInitialValues.test.ts` reads the edit update.
 */
describe('buildWeeklyRepeatInsert copies every column the wizard inserts', () => {
  const actions = readFileSync(
    join(__dirname, '..', '..', 'app', '[locale]', 'admin', 'games', 'new', 'actions.ts'),
    'utf8',
  );
  const insert = /\.from\('games'\)\s*\.insert\(\{([\s\S]*?)\n\s{4}\}\)/.exec(actions);
  const written = [...(insert?.[1] ?? '').matchAll(/^\s{6}([a-z_]+)(?::|,)/gm)].map((m) => m[1]);

  it('finds the insert (the guard is not reading an empty list)', () => {
    expect(written).toEqual(expect.arrayContaining(['name', 'mode_config', 'repeat_weekly', 'created_by']));
    expect(written.length).toBeGreaterThan(20);
  });

  it('has every one of them', () => {
    const { game } = buildWeeklyRepeatInsert(source(), [], NEXT, 'Bogstad', {
      newGameId: 'g-2',
      guestIds: new Set(),
      nowIso: NOW,
    });
    expect(written.filter((column) => !(column in game))).toEqual([]);
  });
});
