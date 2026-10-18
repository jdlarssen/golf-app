import { describe, it, expect } from 'vitest';
import {
  startBlockReason,
  type StartBlock,
  type StartBlockInput,
  type StartBlockRosterRow,
} from './startBlockReason';
import type { TeeBoxRatings } from './teeRating';

/**
 * #2204: why a scheduled game cannot start, without starting it. The start
 * (`startScheduledGameCore`) and every page that explains a stuck round read
 * this one function, so the order below is the start's order.
 */

const TEE: TeeBoxRatings = {
  slope_mens: 130,
  course_rating_mens: 72.1,
  par_total_mens: 72,
  slope_ladies: 125,
  course_rating_ladies: 73.4,
  par_total_ladies: 72,
  slope_juniors: 120,
  course_rating_juniors: 70.2,
  par_total_juniors: 72,
};

const NO_LADIES: TeeBoxRatings = {
  ...TEE,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
};

const TEE_OFF = '2026-09-10T08:00:00.000Z';
const WITHDREW_EARLY = '2026-09-09T20:00:00.000Z';

function row(userId: string, over: Partial<StartBlockRosterRow> = {}): StartBlockRosterRow {
  return {
    userId,
    teeGender: 'mens',
    teamNumber: null,
    flightNumber: null,
    withdrawnAt: null,
    hasUser: true,
    ...over,
  };
}

function input(over: Partial<StartBlockInput> = {}): StartBlockInput {
  return {
    gameMode: 'stableford',
    modeConfig: { kind: 'stableford', team_size: 1 },
    teeBoxId: 'tee-1',
    tee: TEE,
    tournamentId: null,
    tournamentStatus: null,
    scheduledTeeOffAt: TEE_OFF,
    roster: [row('u1'), row('u2')],
    pendingUserIds: [],
    ...over,
  };
}

const singlesCup = (over: Partial<StartBlockInput> = {}): StartBlockInput =>
  input({
    gameMode: 'singles_matchplay',
    modeConfig: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
    tournamentId: 'cup-1',
    tournamentStatus: 'active',
    roster: [row('a1', { teamNumber: 1 }), row('b1', { teamNumber: 2 })],
    ...over,
  });

describe('startBlockReason — one row per reason', () => {
  it.each<[string, StartBlockInput, StartBlock]>([
    [
      'a match in a finished cup',
      singlesCup({ tournamentStatus: 'finished' }),
      { reason: 'cup_finished' },
    ],
    ['no tee on the game', input({ tee: null }), { reason: 'tee_missing' }],
    ['a tee embed without a tee id', input({ teeBoxId: null }), { reason: 'tee_missing' }],
    ['nobody on the roster', input({ roster: [] }), { reason: 'no_players' }],
    [
      'a cup match decided by a withdrawal',
      singlesCup({
        roster: [
          row('a1', { teamNumber: 1 }),
          row('b1', { teamNumber: 2, withdrawnAt: WITHDREW_EARLY }),
        ],
      }),
      { reason: 'decided_by_withdrawal' },
    ],
    [
      'a matchplay side short of players',
      input({
        gameMode: 'singles_matchplay',
        modeConfig: { kind: 'singles_matchplay', team_size: 1 },
        roster: [row('a1', { teamNumber: 1 })],
      }),
      { reason: 'incomplete_sides' },
    ],
    [
      'a team format with players without a team',
      input({
        gameMode: 'best_ball',
        modeConfig: { kind: 'best_ball', team_size: 2 },
        roster: [row('u1'), row('u2'), row('u3'), row('u4')],
      }),
      { reason: 'unassigned_teams' },
    ],
    [
      'more than one flight of solo players without flights',
      input({
        gameMode: 'skins',
        modeConfig: { kind: 'skins', team_size: 1 },
        roster: ['u1', 'u2', 'u3', 'u4', 'u5'].map((id) => row(id)),
      }),
      { reason: 'unassigned_flights' },
    ],
    [
      'Wolf with two players',
      input({
        gameMode: 'wolf',
        modeConfig: { kind: 'wolf', team_size: 1 },
        roster: [row('u1'), row('u2')],
      }),
      { reason: 'rotation_player_count', rotationMode: 'wolf', rotationActiveCount: 2 },
    ],
    [
      'a player who has not finished the profile',
      input({ pendingUserIds: ['u2'] }),
      { reason: 'pending_players', pendingUserIds: ['u2'] },
    ],
    [
      'a ladies player on a tee without a ladies rating',
      input({ tee: NO_LADIES, roster: [row('u1'), row('u2', { teeGender: 'ladies' })] }),
      { reason: 'tee_missing_rating' },
    ],
  ])('%s', (_label, given, expected) => {
    expect(startBlockReason(given)).toEqual(expected);
  });

  it('a game that can start gives null', () => {
    expect(startBlockReason(input())).toBeNull();
  });
});

describe('startBlockReason — the start order', () => {
  it.each<[string, StartBlockInput, StartBlock['reason']]>([
    [
      'cup_finished beats tee_missing',
      singlesCup({ tournamentStatus: 'finished', tee: null, teeBoxId: null }),
      'cup_finished',
    ],
    [
      'cup_finished beats no_players',
      singlesCup({ tournamentStatus: 'finished', roster: [] }),
      'cup_finished',
    ],
    ['tee_missing beats no_players', input({ tee: null, roster: [] }), 'tee_missing'],
    [
      'decided_by_withdrawal beats incomplete_sides',
      singlesCup({
        roster: [
          row('a1', { teamNumber: 1 }),
          row('b1', { teamNumber: 2, withdrawnAt: WITHDREW_EARLY }),
        ],
      }),
      'decided_by_withdrawal',
    ],
    [
      'unassigned_teams beats unassigned_flights',
      input({
        gameMode: 'best_ball',
        modeConfig: { kind: 'best_ball', team_size: 2 },
        roster: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((id) => row(id)),
      }),
      'unassigned_teams',
    ],
    [
      'rotation_player_count beats pending_players',
      input({
        gameMode: 'wolf',
        modeConfig: { kind: 'wolf', team_size: 1 },
        roster: [row('u1'), row('u2')],
        pendingUserIds: ['u2'],
      }),
      'rotation_player_count',
    ],
    [
      'pending_players beats tee_missing_rating',
      input({
        tee: NO_LADIES,
        roster: [row('u1'), row('u2', { teeGender: 'ladies' })],
        pendingUserIds: ['u1'],
      }),
      'pending_players',
    ],
  ])('%s', (_label, given, expected) => {
    expect(startBlockReason(given)?.reason).toBe(expected);
  });
});

describe('startBlockReason — edges', () => {
  it('a withdrawn player does not count toward the Wolf limit', () => {
    expect(
      startBlockReason(
        input({
          gameMode: 'wolf',
          modeConfig: { kind: 'wolf', team_size: 1 },
          roster: [row('u1'), row('u2'), row('u3', { withdrawnAt: WITHDREW_EARLY })],
        }),
      ),
    ).toEqual({ reason: 'rotation_player_count', rotationMode: 'wolf', rotationActiveCount: 2 });
  });

  it('Wolf with three players can start', () => {
    expect(
      startBlockReason(
        input({
          gameMode: 'wolf',
          modeConfig: { kind: 'wolf', team_size: 1 },
          roster: [row('u1'), row('u2'), row('u3')],
        }),
      ),
    ).toBeNull();
  });

  it('a cup fourball where the partner plays alone can start (#1814)', () => {
    expect(
      startBlockReason(
        singlesCup({
          gameMode: 'fourball_matchplay',
          modeConfig: {
            kind: 'fourball_matchplay',
            team_size: 2,
            teams_count: 2,
            withdrawal_play_on: true,
          },
          roster: [
            row('a1', { teamNumber: 1 }),
            row('a2', { teamNumber: 1, withdrawnAt: WITHDREW_EARLY }),
            row('b1', { teamNumber: 2 }),
            row('b2', { teamNumber: 2 }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('an unreadable cup (null status) is not a finished cup', () => {
    expect(startBlockReason(singlesCup({ tournamentStatus: null }))).toBeNull();
  });

  it('an unknown tee gender is a missing rating, not a NaN handicap (#1678)', () => {
    expect(
      startBlockReason(
        input({ roster: [row('u1', { teeGender: 'other' as never })] }),
      ),
    ).toEqual({ reason: 'tee_missing_rating' });
  });

  it('a row without a user row is skipped by the rating check, as the freeze skips it', () => {
    expect(
      startBlockReason(
        input({
          tee: NO_LADIES,
          roster: [row('u1'), row('u2', { teeGender: 'ladies', hasUser: false })],
        }),
      ),
    ).toBeNull();
  });
});

// #2569: a team may have team_size or one fewer where the format has that
// size (`allowedTeamSizes`). «Fjern spiller», self-withdrawal, «bytt lag» and
// the app's direct writes all bypass the publish validator, and no DB rule
// counts team sizes, so the guard is the real gate.
describe('startBlockReason — uneven teams (#2569)', () => {
  function teams(...counts: number[]): StartBlockRosterRow[] {
    return counts.flatMap((count, t) =>
      Array.from({ length: count }, (_, m) =>
        row(`t${t + 1}-${m}`, { teamNumber: t + 1, flightNumber: t + 1 }),
      ),
    );
  }
  const TEXAS_AT_4 = { kind: 'texas_scramble', team_size: 4, teams_count: 3, team_handicap_pct: 20 };

  it.each<[string, StartBlockInput, StartBlock | null]>([
    [
      'Texas à 4 with 4/4/3 can start',
      input({ gameMode: 'texas_scramble', modeConfig: TEXAS_AT_4, roster: teams(4, 4, 3) }),
      null,
    ],
    [
      'Texas à 4 with 4/4/2 gives uneven_teams',
      input({ gameMode: 'texas_scramble', modeConfig: TEXAS_AT_4, roster: teams(4, 4, 2) }),
      { reason: 'uneven_teams' },
    ],
    [
      'Texas à 4 with 3/3/3 after withdrawals can start: every team gets the same percent of its average',
      input({ gameMode: 'texas_scramble', modeConfig: TEXAS_AT_4, roster: teams(3, 3, 3) }),
      null,
    ],
    [
      'Texas à 4 with a team of 5 gives uneven_teams',
      input({ gameMode: 'texas_scramble', modeConfig: TEXAS_AT_4, roster: teams(4, 5) }),
      { reason: 'uneven_teams' },
    ],
    [
      'best ball 2/2/1 gives uneven_teams (a pair left with one player)',
      input({
        gameMode: 'best_ball',
        modeConfig: { kind: 'best_ball', team_size: 2, teams_count: 3 },
        roster: teams(2, 2, 1),
      }),
      { reason: 'uneven_teams' },
    ],
    [
      'patsome 2/1 gives uneven_teams',
      input({
        gameMode: 'patsome',
        modeConfig: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net' },
        roster: teams(2, 1),
      }),
      { reason: 'uneven_teams' },
    ],
    [
      'par-stableford 2/1 gives uneven_teams',
      input({
        gameMode: 'stableford',
        modeConfig: { kind: 'stableford', team_size: 2, points_table: 'standard' },
        roster: teams(2, 1),
      }),
      { reason: 'uneven_teams' },
    ],
    [
      'Florida à 3 with 3/2 gives uneven_teams (no team of 2 in Florida)',
      input({
        gameMode: 'florida_scramble',
        modeConfig: { kind: 'florida_scramble', team_size: 3, teams_count: 2, team_handicap_pct: 15 },
        roster: teams(3, 2),
      }),
      { reason: 'uneven_teams' },
    ],
    [
      'champagne «3 beste» à 4 with 4/3 can start: the team of 3 counts all three',
      input({
        gameMode: 'shamble',
        modeConfig: {
          kind: 'shamble',
          team_size: 4,
          teams_count: 2,
          shamble_variant: 'champagne',
          shamble_count: 3,
          shamble_scoring: 'net',
        },
        roster: teams(4, 3),
      }),
      null,
    ],
  ])('%s', (_label, given, expected) => {
    expect(startBlockReason(given)).toEqual(expected);
  });

  it('counts active players only: two withdrawn on a team of 4 leave it at 2', () => {
    const roster = teams(4, 4, 4).map((r) =>
      r.userId === 't3-0' || r.userId === 't3-1' ? { ...r, withdrawnAt: WITHDREW_EARLY } : r,
    );
    expect(
      startBlockReason(input({ gameMode: 'texas_scramble', modeConfig: TEXAS_AT_4, roster })),
    ).toEqual({ reason: 'uneven_teams' });
  });

  it('unassigned_teams comes first, then uneven_teams, then unassigned_flights', () => {
    const roster = [...teams(4, 2), row('loose')];
    expect(
      startBlockReason(input({ gameMode: 'texas_scramble', modeConfig: TEXAS_AT_4, roster })),
    ).toEqual({ reason: 'unassigned_teams' });
  });

  it('Wolf uses team_number as a rotation slot, not a team: never uneven_teams', () => {
    const roster = ['u1', 'u2', 'u3'].map((id, i) => row(id, { teamNumber: i + 1 }));
    expect(
      startBlockReason(
        input({ gameMode: 'wolf', modeConfig: { kind: 'wolf', team_size: 1 }, roster }),
      ),
    ).toBeNull();
  });
});
