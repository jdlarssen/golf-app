import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEE_INTERVAL_MINUTES,
  TEE_INTERVAL_CHOICES,
  isTeeInterval,
  playerTeeOff,
  startGroupFor,
  startGroupTeeOffAt,
  startGroupsOf,
  teeTimeChanges,
  type TeeTimePlayer,
  type TeeTimeRound,
} from './flightTeeTimes';
import { FLIGHT_TEE_OFF_STAGGER_MINUTES, resolveScheduledTeeOffAt } from '@/lib/cup/splitDayLineup';
import type { GameMode } from '@/lib/scoring/modes/types';

// 2026-11-21 09:00 Oslo (CET, UTC+1).
const NINE = '2026-11-21T08:00:00.000Z';

function player(
  id: string,
  flight: number | null,
  team: number | null = null,
  withdrawn = false,
): TeeTimePlayer {
  return {
    user_id: id,
    flight_number: flight,
    team_number: team,
    withdrawn_at: withdrawn ? '2026-11-20T10:00:00.000Z' : null,
  };
}

function round(
  game_mode: GameMode,
  players: TeeTimePlayer[],
  opts: Partial<Omit<TeeTimeRound, 'players' | 'game_mode'>> = {},
): TeeTimeRound {
  return {
    game_mode,
    team_size: 1,
    scheduled_tee_off_at: NINE,
    tee_interval_minutes: 10,
    players,
    ...opts,
  };
}

/** Twelve best-ball players: six pairs, two pairs per flight. */
function bestBallTwelve(): TeeTimePlayer[] {
  return Array.from({ length: 12 }, (_, i) => {
    const team = Math.floor(i / 2) + 1;
    return player(`p${i + 1}`, Math.ceil(team / 2), team);
  });
}

describe('the interval choices', () => {
  it('are 8, 10 and 12 minutes, with 10 as the default', () => {
    expect([...TEE_INTERVAL_CHOICES]).toEqual([8, 10, 12]);
    expect(DEFAULT_TEE_INTERVAL_MINUTES).toBe(10);
  });

  it('isTeeInterval accepts only the choices', () => {
    for (const v of TEE_INTERVAL_CHOICES) expect(isTeeInterval(v)).toBe(true);
    for (const v of [0, 9, 11, 15, -10, 10.5, '10', null, undefined]) {
      expect(isTeeInterval(v)).toBe(false);
    }
  });

  // AGENTS.md trap #4: the CHECK in 0243 and TEE_INTERVAL_CHOICES are the
  // same list, read from the migration so a change to one fails here.
  it('agree with the CHECK games_tee_interval_minutes_choices', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', 'supabase', 'migrations', '0243_tee_interval_and_tee_time_notice.sql'),
      'utf8',
    );
    const m = sql.match(
      /games_tee_interval_minutes_choices\s+check\s*\(\s*tee_interval_minutes\s+in\s*\(([^)]*)\)/i,
    );
    expect(m, 'the CHECK is in 0243').not.toBeNull();
    const sqlChoices = m![1].split(',').map((s) => Number(s.trim()));
    expect(sqlChoices).toEqual([...TEE_INTERVAL_CHOICES]);
  });

  it('the cup keeps its 10 minutes, now read from the default', () => {
    expect(FLIGHT_TEE_OFF_STAGGER_MINUTES).toBe(DEFAULT_TEE_INTERVAL_MINUTES);
  });
});

describe('startGroupFor', () => {
  it('free grouping and best ball: the group is the flight', () => {
    const free: [GameMode, number][] = [
      ['solo_strokeplay', 1],
      ['stableford', 1],
      ['modified_stableford', 1],
      ['nassau', 1],
      ['skins', 1],
      ['bingo_bango_bongo', 1],
      ['best_ball', 2],
    ];
    for (const [gameMode, teamSize] of free) {
      expect(startGroupFor({ gameMode, teamSize, flightNumber: 3, teamNumber: 5 })).toBe(3);
      expect(startGroupFor({ gameMode, teamSize, flightNumber: null, teamNumber: 5 })).toBeNull();
    }
  });

  it('teams of 3 or 4 go out one team per group', () => {
    const big: [GameMode, number][] = [
      ['texas_scramble', 3],
      ['texas_scramble', 4],
      ['ambrose', 3],
      ['ambrose', 4],
      ['florida_scramble', 3],
      ['florida_scramble', 4],
      ['shamble', 3],
      ['shamble', 4],
    ];
    for (const [gameMode, teamSize] of big) {
      // The flight is the team in these formats; the group is read from the team.
      expect(startGroupFor({ gameMode, teamSize, flightNumber: 3, teamNumber: 3 })).toBe(3);
      expect(startGroupFor({ gameMode, teamSize, flightNumber: null, teamNumber: 1 })).toBe(1);
      expect(startGroupFor({ gameMode, teamSize, flightNumber: null, teamNumber: null })).toBeNull();
    }
  });

  it('pairs go out two pairs per group', () => {
    const pairs: GameMode[] = ['patsome', 'stableford', 'modified_stableford', 'texas_scramble', 'ambrose'];
    for (const gameMode of pairs) {
      const group = (teamNumber: number) =>
        startGroupFor({ gameMode, teamSize: 2, flightNumber: teamNumber, teamNumber });
      expect([1, 2, 3, 4, 5, 6].map(group)).toEqual([1, 1, 2, 2, 3, 3]);
    }
  });

  it('matchplay, wolf, round robin, acey deucey and nines are always one group', () => {
    const one: [GameMode, number][] = [
      ['singles_matchplay', 1],
      ['fourball_matchplay', 2],
      ['foursomes_matchplay', 2],
      ['greensome_matchplay', 2],
      ['chapman_matchplay', 2],
      ['gruesome_matchplay', 2],
      ['wolf', 1],
      ['round_robin', 1],
      ['acey_deucey', 1],
      ['nines', 1],
    ];
    for (const [gameMode, teamSize] of one) {
      expect(startGroupFor({ gameMode, teamSize, flightNumber: 2, teamNumber: 2 })).toBe(1);
    }
  });
});

describe('startGroupTeeOffAt', () => {
  it('group 1 is the first tee-off, unchanged', () => {
    expect(startGroupTeeOffAt(NINE, 1, 10)).toBe(NINE);
    // The cup passes Supabase's own format; it must come back as it went in.
    expect(startGroupTeeOffAt('2026-11-21T08:00:00+00:00', 1, 10)).toBe('2026-11-21T08:00:00+00:00');
  });

  it('group N goes out (N − 1) × the interval later, for each choice', () => {
    expect(startGroupTeeOffAt(NINE, 2, 8)).toBe('2026-11-21T08:08:00.000Z');
    expect(startGroupTeeOffAt(NINE, 3, 8)).toBe('2026-11-21T08:16:00.000Z');
    expect(startGroupTeeOffAt(NINE, 2, 10)).toBe('2026-11-21T08:10:00.000Z');
    expect(startGroupTeeOffAt(NINE, 3, 10)).toBe('2026-11-21T08:20:00.000Z');
    expect(startGroupTeeOffAt(NINE, 2, 12)).toBe('2026-11-21T08:12:00.000Z');
    expect(startGroupTeeOffAt(NINE, 3, 12)).toBe('2026-11-21T08:24:00.000Z');
  });

  it('crosses midnight: 23:55 Oslo + 10 min is 00:05 the next day', () => {
    // 23:55 Oslo on 21 Nov is 22:55 UTC.
    expect(startGroupTeeOffAt('2026-11-21T22:55:00.000Z', 2, 10)).toBe('2026-11-21T23:05:00.000Z');
  });

  it('counts real minutes across the change to summer time', () => {
    // 29 Mar 2026, 01:55 CET (00:55 UTC). Ten minutes later the clocks have
    // jumped: 03:05 CEST, which is 01:05 UTC.
    expect(startGroupTeeOffAt('2026-03-29T00:55:00.000Z', 2, 10)).toBe('2026-03-29T01:05:00.000Z');
  });

  it('is the cup rule: resolveScheduledTeeOffAt goes through it', () => {
    expect(resolveScheduledTeeOffAt(NINE, 3)).toBe(startGroupTeeOffAt(NINE, 3, 10));
  });
});

describe('playerTeeOff', () => {
  it('best ball, 12 players: 09:00, 09:10 and 09:20', () => {
    const players = bestBallTwelve();
    const r = round('best_ball', players, { team_size: 2 });
    expect(playerTeeOff(r, players[0])).toEqual({ teeOffAt: NINE, group: 1 });
    expect(playerTeeOff(r, players[4])).toEqual({ teeOffAt: '2026-11-21T08:10:00.000Z', group: 2 });
    expect(playerTeeOff(r, players[11])).toEqual({ teeOffAt: '2026-11-21T08:20:00.000Z', group: 3 });
  });

  it('patsome, 12 players: teams 1 and 2 go out together', () => {
    const players = Array.from({ length: 12 }, (_, i) => {
      const team = Math.floor(i / 2) + 1;
      return player(`p${i + 1}`, team, team);
    });
    const r = round('patsome', players, { team_size: 2 });
    expect(playerTeeOff(r, players[0])?.group).toBe(1);
    expect(playerTeeOff(r, players[3])?.group).toBe(1); // team 2
    expect(playerTeeOff(r, players[4])?.teeOffAt).toBe('2026-11-21T08:10:00.000Z'); // team 3
  });

  it('null without a tee-off, without an interval, or for a withdrawn player', () => {
    const players = bestBallTwelve();
    expect(playerTeeOff(round('best_ball', players, { scheduled_tee_off_at: null }), players[4])).toBeNull();
    expect(playerTeeOff(round('best_ball', players, { tee_interval_minutes: null }), players[4])).toBeNull();
    const gone = player('gone', 2, 3, true);
    expect(playerTeeOff(round('best_ball', [...players, gone]), gone)).toBeNull();
  });

  it('null for a player without a group', () => {
    const players = [...bestBallTwelve().slice(0, 8), player('loose', null)];
    expect(playerTeeOff(round('solo_strokeplay', players), players[8])).toBeNull();
  });

  it('null with one group: four or fewer active, everyone in one flight, or wolf', () => {
    const four = [player('a', 1), player('b', 1), player('c', 2), player('d', 2)];
    expect(playerTeeOff(round('solo_strokeplay', four), four[2])).toBeNull();

    const allInOne = Array.from({ length: 6 }, (_, i) => player(`p${i}`, 1));
    expect(playerTeeOff(round('solo_strokeplay', allInOne), allInOne[0])).toBeNull();

    // Withdrawn players do not count: 5 on the list, 4 still playing.
    const withdrawn = [...four, player('gone', 2, null, true)];
    expect(playerTeeOff(round('solo_strokeplay', withdrawn), four[2])).toBeNull();

    const wolf = Array.from({ length: 5 }, (_, i) => player(`w${i}`, i + 1, i + 1));
    expect(playerTeeOff(round('wolf', wolf), wolf[4])).toBeNull();
  });
});

describe('startGroupsOf', () => {
  it('lists each group with its time, offset and players, in group order', () => {
    const players = bestBallTwelve().reverse();
    const groups = startGroupsOf(round('best_ball', players, { team_size: 2, tee_interval_minutes: 8 }));
    expect(groups.map((g) => [g.group, g.offsetMinutes, g.teeOffAt, g.players.length])).toEqual([
      [1, 0, NINE, 4],
      [2, 8, '2026-11-21T08:08:00.000Z', 4],
      [3, 16, '2026-11-21T08:16:00.000Z', 4],
    ]);
  });

  it('gives offsets but no clock when the round has no tee-off yet', () => {
    const groups = startGroupsOf(round('best_ball', bestBallTwelve(), { scheduled_tee_off_at: null }));
    expect(groups.map((g) => [g.offsetMinutes, g.teeOffAt])).toEqual([
      [0, null],
      [10, null],
      [20, null],
    ]);
  });

  it('is empty with one group, and leaves out withdrawn players and players without a group', () => {
    const four = [player('a', 1), player('b', 1), player('c', 2), player('d', 2)];
    expect(startGroupsOf(round('solo_strokeplay', four))).toEqual([]);

    const players = [...bestBallTwelve(), player('loose', null), player('gone', 1, 1, true)];
    const groups = startGroupsOf(round('solo_strokeplay', players));
    expect(groups.flatMap((g) => g.players.map((p) => p.user_id))).not.toContain('loose');
    expect(groups.flatMap((g) => g.players.map((p) => p.user_id))).not.toContain('gone');
  });

  it('with no interval every group goes out at the tee-off', () => {
    const groups = startGroupsOf(round('best_ball', bestBallTwelve(), { tee_interval_minutes: null }));
    expect(groups.map((g) => g.teeOffAt)).toEqual([NINE, NINE, NINE]);
  });
});

describe('teeTimeChanges', () => {
  it('a player moved from flight 3 to flight 2 gets the new time', () => {
    const before = bestBallTwelve();
    const after = before.map((p) => (p.user_id === 'p12' ? { ...p, flight_number: 2 } : p));
    // flight 2 now has five; the rule only reads the group, not the size.
    expect(teeTimeChanges(round('solo_strokeplay', before), round('solo_strokeplay', after))).toEqual([
      { userId: 'p12', teeOffAt: '2026-11-21T08:10:00.000Z' },
    ]);
  });

  it('is empty when the time is the same: a swap inside a group, or a move to a group with the same time', () => {
    const before = bestBallTwelve();
    const swapped = before.map((p) =>
      p.user_id === 'p1' ? { ...p, team_number: 2 } : p.user_id === 'p3' ? { ...p, team_number: 1 } : p,
    );
    expect(teeTimeChanges(round('best_ball', before), round('best_ball', swapped))).toEqual([]);

    // No interval: every flight goes out at 09:00, so a move changes nothing.
    const moved = before.map((p) => (p.user_id === 'p12' ? { ...p, flight_number: 1 } : p));
    expect(
      teeTimeChanges(
        round('solo_strokeplay', before, { tee_interval_minutes: null }),
        round('solo_strokeplay', moved, { tee_interval_minutes: null }),
      ),
    ).toEqual([]);
  });

  it('a new interval moves flights 2 and 3, not flight 1', () => {
    const players = bestBallTwelve();
    const changes = teeTimeChanges(
      round('best_ball', players, { tee_interval_minutes: 12 }),
      round('best_ball', players, { tee_interval_minutes: 10 }),
    );
    expect(changes.map((c) => c.userId)).toEqual(['p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']);
    expect(changes.find((c) => c.userId === 'p12')?.teeOffAt).toBe('2026-11-21T08:20:00.000Z');
  });

  it('turning the times on or off counts as a change for the later flights', () => {
    const players = bestBallTwelve();
    const on = teeTimeChanges(
      round('best_ball', players, { tee_interval_minutes: null }),
      round('best_ball', players, { tee_interval_minutes: 10 }),
    );
    expect(on.map((c) => c.userId)).toEqual(['p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']);
  });

  it('leaves out withdrawn players and players who were not on the list before', () => {
    const before = bestBallTwelve();
    const after = [
      ...before.map((p) => (p.user_id === 'p12' ? { ...p, withdrawn_at: '2026-11-20T12:00:00.000Z' } : p)),
      player('new', 3, 6),
    ];
    const changes = teeTimeChanges(
      round('best_ball', before, { tee_interval_minutes: 12 }),
      round('best_ball', after, { tee_interval_minutes: 10 }),
    );
    expect(changes.map((c) => c.userId)).not.toContain('p12');
    expect(changes.map((c) => c.userId)).not.toContain('new');
  });

  it('compares instants, not strings', () => {
    const players = bestBallTwelve();
    expect(
      teeTimeChanges(
        round('best_ball', players, { scheduled_tee_off_at: '2026-11-21T08:00:00+00:00' }),
        round('best_ball', players, { scheduled_tee_off_at: NINE }),
      ),
    ).toEqual([]);
  });

  it('a round that drops to one group sends the later flights back to the tee-off', () => {
    const five = [player('a', 1), player('b', 1), player('c', 1), player('d', 1), player('e', 2)];
    const after = five.map((p) => (p.user_id === 'd' ? { ...p, withdrawn_at: '2026-11-20T12:00:00.000Z' } : p));
    expect(teeTimeChanges(round('solo_strokeplay', five), round('solo_strokeplay', after))).toEqual([
      { userId: 'e', teeOffAt: NINE },
    ]);
  });
});
