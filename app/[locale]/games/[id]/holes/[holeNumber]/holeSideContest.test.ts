import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import type { HoleClaimsRead, SideClaim } from '@/lib/games/sideClaims';
import type { CupSideAward } from '@/lib/games/sideContest';
import { buildGameFirstNames, buildSideContestPlayers, canReportSideClaims, resolveSideContest } from './holeSideContest';

// #2283 (part D2) — Type A: what the hole page hands the side-contest row:
// which contests the hole has, who may report, what the server read.

const ME = 'u-me';

function player(
  user_id: string,
  opts: {
    flight?: number;
    team?: number;
    name?: string | null;
    nickname?: string | null;
    withdrawn?: boolean;
  } = {},
): PlayerForHole {
  return {
    user_id,
    team_number: opts.team ?? 1,
    flight_number: opts.flight ?? 1,
    course_handicap: 10,
    submitted_at: null,
    submitted_by_user_id: null,
    marker_user_id: null,
    approved_at: null,
    rejection_reason: null,
    withdrawn_at: opts.withdrawn ? '2026-11-15T10:00:00Z' : null,
    withdrawn_by_user_id: null,
    accepted_at: null,
    paid_at: null,
    users: {
      name: opts.name === undefined ? `Spiller ${user_id}` : opts.name,
      nickname: opts.nickname ?? null,
      is_guest: false,
    },
    tee_gender: 'mens',
  };
}

function game(patch: Partial<GameForHole> = {}): GameForHole {
  return {
    id: 'g1',
    status: 'active',
    game_mode: 'stableford',
    tournament_id: null,
    source_game_id: null,
    side_ld_count: 1,
    side_ctp_count: 1,
    side_ld_holes: [9],
    side_ctp_holes: [7],
    ...patch,
  } as GameForHole;
}

/** Three players in one flight: a small game is one flight (`isSingleFlightGame`). */
const SMALL = [player(ME, { name: 'Marte Hansen' }), player('u-tore', { name: 'Tore Berg' }), player('u-per', { name: 'Per Olsen' })];

/** Six players in two flights of three: now the flight number counts. */
const BIG = [
  player(ME, { flight: 1, name: 'Marte Hansen' }),
  player('u-tore', { flight: 1, name: 'Tore Berg' }),
  player('u-per', { flight: 1, name: 'Per Olsen' }),
  player('u-x1', { flight: 2, name: 'Xenia Aas' }),
  player('u-x2', { flight: 2, name: 'Yngve Aas' }),
  player('u-x3', { flight: 2, name: 'Zoe Aas' }),
  player('u-x4', { flight: 2, name: 'Ola Aas' }),
];

const CLAIM: SideClaim = {
  category: 'closest_to_pin',
  holeNumber: 7,
  winnerUserId: 'u-tore',
  distanceM: 2.4,
  enteredBy: 'u-per',
  updatedAt: '2026-11-15T10:00:00Z',
};
const OK_CLAIMS: HoleClaimsRead = { ok: true, side: [CLAIM], gir: [] };

const GIR_AWARD: CupSideAward = { kind: 'gir', holeNumber: 5, points: 1, girMaxPerTeam: 2 };
const CTP_AWARD: CupSideAward = { kind: 'ctp', holeNumber: 7, points: 2, girMaxPerTeam: null };

function resolve(patch: Partial<Parameters<typeof resolveSideContest>[0]> = {}) {
  return resolveSideContest({
    game: game(),
    allPlayers: SMALL,
    userId: ME,
    holeNumber: 7,
    awardsRes: null,
    claimsRes: OK_CLAIMS,
    unknownPlayer: 'Ukjent',
    ...patch,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('canReportSideClaims', () => {
  it('is true for an active player in an active round', () => {
    expect(canReportSideClaims({ game: game(), allPlayers: SMALL, userId: ME })).toBe(true);
  });

  it('is false when the round is not running', () => {
    expect(canReportSideClaims({ game: game({ status: 'finished' }), allPlayers: SMALL, userId: ME })).toBe(false);
  });

  it('is false for a withdrawn player, as the rpc answers not_player', () => {
    const players = [player(ME, { withdrawn: true }), player('u-tore'), player('u-per')];
    expect(canReportSideClaims({ game: game(), allPlayers: players, userId: ME })).toBe(false);
  });

  it('is false for someone who is not in the game', () => {
    expect(canReportSideClaims({ game: game(), allPlayers: SMALL, userId: 'u-stranger' })).toBe(false);
  });
});

describe('resolveSideContest', () => {
  it('gives the hole its contests, the server snapshot and the right to report', () => {
    expect(resolve()).toMatchObject({
      contests: [{ category: 'closest_to_pin', source: 'game' }],
      canReport: true,
      claims: { failed: false, side: [CLAIM], gir: undefined },
    });
  });

  it('is null on a hole without a contest, and on a game without side holes', () => {
    expect(resolve({ holeNumber: 3 })).toBeNull();
    expect(resolve({ game: game({ side_ld_holes: null, side_ctp_holes: null }) })).toBeNull();
  });

  it('is null on a derived game, which keeps no contests', () => {
    expect(resolve({ game: game({ source_game_id: 'host-1' }) })).toBeNull();
  });

  it('orders the contests closest to pin, longest drive, GIR, and hands over both tables', () => {
    const result = resolve({
      game: game({ tournament_id: 't1', side_ld_holes: [5], side_ctp_holes: [5] }),
      holeNumber: 5,
      awardsRes: { ok: true, awards: [GIR_AWARD] },
      claimsRes: { ok: true, side: [], gir: [{ holeNumber: 5, userId: 'u-tore', hit: true, enteredBy: ME, updatedAt: 'x' }] },
    });
    expect(result?.contests.map((c) => c.category)).toEqual(['closest_to_pin', 'longest_drive', 'gir']);
    expect(result?.claims).toMatchObject({ failed: false, side: [], gir: [{ userId: 'u-tore', hit: true }] });
  });

  it('shows a cup hole from the awards, with the cup points', () => {
    const result = resolve({
      game: game({ tournament_id: 't1', side_ld_holes: null, side_ctp_holes: null }),
      awardsRes: { ok: true, awards: [CTP_AWARD] },
    });
    expect(result?.contests).toEqual([{ category: 'closest_to_pin', source: 'cup', points: 2 }]);
  });

  it('hands over only the tables the hole reports into, though the wave read both', () => {
    const result = resolve({
      game: game({ tournament_id: 't1', side_ld_holes: null, side_ctp_holes: null }),
      awardsRes: { ok: true, awards: [CTP_AWARD] },
      claimsRes: { ok: true, side: [CLAIM], gir: [{ holeNumber: 7, userId: 'u-tore', hit: true, enteredBy: ME, updatedAt: 'x' }] },
    });
    expect(result?.claims).toEqual({ failed: false, side: [CLAIM], gir: undefined });
  });

  // «Fikk ikke hentet. Prøver igjen.» is a value, not a crash and not «ingen har meldt inn».
  it('marks the claims failed when the read failed, and does not throw', () => {
    const result = resolve({ claimsRes: { ok: false, error: new Error('timeout') } });
    expect(result).toMatchObject({
      contests: [{ category: 'closest_to_pin' }],
      canReport: true,
      claims: { failed: true, side: undefined, gir: undefined },
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('marks the claims failed when a needed table is missing from the read', () => {
    expect(resolve({ claimsRes: { ok: true, side: undefined, gir: undefined } })?.claims).toMatchObject({
      failed: true,
    });
    expect(resolve({ claimsRes: null })?.claims).toMatchObject({ failed: true });
  });

  it('falls back to the game\'s own slots, and logs, when the cup awards could not be read', () => {
    const result = resolve({
      game: game({ tournament_id: 't1' }),
      awardsRes: { ok: false, error: new Error('timeout') },
    });
    expect(result?.contests).toEqual([{ category: 'closest_to_pin', source: 'game' }]);
    expect(console.error).toHaveBeenCalled();
  });

  it('skips the claims and the players for someone who cannot report, but still has the contests', () => {
    const players = [player(ME, { withdrawn: true }), player('u-tore'), player('u-per')];
    expect(resolve({ allPlayers: players, claimsRes: null })).toEqual({
      contests: [{ category: 'closest_to_pin', source: 'game' }],
      canReport: false,
      claims: null,
      players: [],
      names: {},
    });
  });

  it('names everyone in the game, also the other flights, so «Lagret av» finds a saver who has moved (#2891)', () => {
    const result = resolve({ allPlayers: BIG });
    // My flight is Marte, Tore and Per; Xenia, Yngve, Zoe and Ola are in flight 2.
    expect(result?.players.map((p) => p.userId)).toEqual([ME, 'u-tore', 'u-per']);
    expect(result?.names).toEqual({
      [ME]: 'Marte',
      'u-tore': 'Tore',
      'u-per': 'Per',
      'u-x1': 'Xenia',
      'u-x2': 'Yngve',
      'u-x3': 'Zoe',
      'u-x4': 'Ola',
    });
  });
});

describe('buildGameFirstNames', () => {
  const build = (allPlayers: PlayerForHole[]) => buildGameFirstNames({ allPlayers, unknownPlayer: 'Ukjent' });

  it('is the plain first name, withdrawn players included', () => {
    expect(build([player(ME, { name: 'Marte Hansen' }), player('u-per', { name: 'Per Olsen', withdrawn: true })])).toEqual({
      [ME]: 'Marte',
      'u-per': 'Per',
    });
  });

  it('keeps the first name when two share it, as the app does: the row is the flight, this is the whole game', () => {
    expect(build([player(ME, { name: 'Marte Hansen' }), player('u-m2', { name: 'Marte Berg' })])).toEqual({
      [ME]: 'Marte',
      'u-m2': 'Marte',
    });
  });

  it('falls back to the nickname, then to the unknown-player text', () => {
    expect(build([player('u-nick', { name: null, nickname: 'Kalle' }), player('u-none', { name: null })])).toEqual({
      'u-nick': 'Kalle',
      'u-none': 'Ukjent',
    });
  });
});

describe('buildSideContestPlayers', () => {
  const build = (allPlayers: PlayerForHole[], g: Pick<GameForHole, 'game_mode'> = game()) =>
    buildSideContestPlayers({ game: g, allPlayers, userId: ME, unknownPlayer: 'Ukjent' });

  it('lists everyone in a small game, with full name, short name, initials and side', () => {
    expect(build(SMALL)).toEqual([
      { userId: ME, name: 'Marte Hansen', shortName: 'Marte', initial: 'MH', teamNumber: 1, withdrawn: false },
      { userId: 'u-tore', name: 'Tore Berg', shortName: 'Tore', initial: 'TB', teamNumber: 1, withdrawn: false },
      { userId: 'u-per', name: 'Per Olsen', shortName: 'Per', initial: 'PO', teamNumber: 1, withdrawn: false },
    ]);
  });

  it('lists only my flight in a bigger game', () => {
    expect(build(BIG).map((p) => p.userId)).toEqual([ME, 'u-tore', 'u-per']);
  });

  it('keeps a withdrawn flight-mate, flagged, so a report naming them still has a name', () => {
    const players = [...BIG.slice(0, 2), player('u-per', { flight: 1, name: 'Per Olsen', withdrawn: true }), ...BIG.slice(3)];
    expect(build(players).find((p) => p.userId === 'u-per')).toMatchObject({ name: 'Per Olsen', withdrawn: true });
  });

  it('uses the full name in the row when two share a first name (#2286)', () => {
    const players = [player(ME, { name: 'Marte Hansen' }), player('u-m2', { name: 'Marte Berg' }), player('u-per', { name: 'Per Olsen' })];
    expect(build(players).map((p) => p.shortName)).toEqual(['Marte Hansen', 'Marte Berg', 'Per']);
  });

  it('falls back to the nickname, then to the unknown-player text', () => {
    const players = [player(ME, { name: 'Marte Hansen' }), player('u-nick', { name: null, nickname: 'Kalle' }), player('u-none', { name: null })];
    expect(build(players).slice(1)).toMatchObject([
      { name: 'Kalle', shortName: 'Kalle' },
      { name: 'Ukjent', shortName: 'Ukjent' },
    ]);
  });

  it('is empty when I am withdrawn or not in the game', () => {
    expect(build([player(ME, { withdrawn: true }), player('u-tore')])).toEqual([]);
    expect(build([player('u-tore')])).toEqual([]);
  });
});
