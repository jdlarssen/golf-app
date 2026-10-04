import { describe, it, expect } from 'vitest';
import {
  deliveryCounts,
  endGameReadiness,
  findScoreGaps,
  flightProgress,
  gapLocation,
  missingScoreTargets,
  pultInitialTab,
  elapsedParts,
  type DeskPlayer,
  type DeliveryCounts,
} from './organizerDesk';
import { splitFinishRoster, stampsFromRow } from './finishGate';
import type { GameMode, HoleSegment } from '@/lib/scoring';
import type { StartType } from './startType';

/**
 * #2268: the organiser's desk (arrangørpulten) reads its counts, gaps and
 * progress from this module, and #2269 reuses the counts. Type A: the rules,
 * not the rendering.
 */

const SUBMITTED = '2026-09-01T09:00:00.000Z';
const APPROVED = '2026-09-01T09:30:00.000Z';
const WITHDRAWN = '2026-09-01T10:00:00.000Z';

type Row = DeskPlayer & { approved_at: string | null };

const player = (user_id: string, over: Partial<Row> = {}): Row => ({
  user_id,
  team_number: null,
  flight_number: null,
  submitted_at: null,
  approved_at: null,
  withdrawn_at: null,
  ...over,
});

/** Score rows for `user_id` on the given hole numbers (strokes already filtered). */
const holes = (user_id: string, ...nums: number[]) =>
  nums.map((hole_number) => ({ user_id, hole_number }));

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('deliveryCounts', () => {
  const roster = [
    player('a', { submitted_at: SUBMITTED, approved_at: APPROVED }),
    player('b', { submitted_at: SUBMITTED }),
    player('c'),
    player('d', { withdrawn_at: WITHDRAWN }),
    player('e', { submitted_at: SUBMITTED, withdrawn_at: WITHDRAWN }),
  ];

  it.each([
    ['uten peer: ventende teller ikke', false, { total: 3, submitted: 2, notSubmitted: 1, pendingApproval: 0 }],
    ['med peer: levert uten godkjenning venter', true, { total: 3, submitted: 2, notSubmitted: 1, pendingApproval: 1 }],
  ] as const)('%s, trukne er ute', (_label, peer, expected) => {
    expect(deliveryCounts(roster, peer)).toEqual(expected);
  });

  // Contract test (#2269 reads these counts): they are the finish gate's own
  // lists, so a rewrite of deliveryCounts cannot drift from what endGame blocks on.
  it.each([false, true])('kontrakt: samme tall som sperrens lister (peer=%s)', (peer) => {
    const lists = splitFinishRoster(roster, stampsFromRow, peer);
    const counts = deliveryCounts(roster, peer);
    expect(counts.total).toBe(lists.active.length);
    expect(counts.notSubmitted).toBe(lists.missing.length);
    expect(counts.pendingApproval).toBe(lists.unapproved.length);
    expect(counts.submitted).toBe(lists.active.length - lists.missing.length);
  });

  it('tomt roster gir bare nuller', () => {
    expect(deliveryCounts([], true)).toEqual({
      total: 0,
      submitted: 0,
      notSubmitted: 0,
      pendingApproval: 0,
    });
  });
});

describe('endGameReadiness', () => {
  const c = (total: number, notSubmitted: number, pendingApproval: number): DeliveryCounts => ({
    total,
    submitted: total - notSubmitted,
    notSubmitted,
    pendingApproval,
  });

  it.each([
    ['alle trukket', c(0, 0, 0), 'no_active'],
    ['alle levert og godkjent', c(12, 0, 0), 'ready'],
    ['bare manglende levering', c(12, 3, 0), 'only_missing'],
    ['ventende godkjenning', c(12, 0, 2), 'blocked'],
    ['både manglende og ventende', c(12, 3, 2), 'blocked'],
  ] as const)('%s → %s', (_label, counts, expected) => {
    expect(endGameReadiness(counts)).toBe(expected);
  });
});

describe('findScoreGaps', () => {
  type Case = {
    name: string;
    mode?: GameMode;
    segment?: HoleSegment;
    startType?: StartType;
    players: Row[];
    scores: { user_id: string; hole_number: number }[];
    expected: { userIds: string[]; holes: number[]; lastHole: number }[];
  };

  const cases: Case[] = [
    {
      name: 'hull midt i runden',
      players: [player('tore', { flight_number: 2 })],
      scores: holes('tore', ...range(1, 9), 11, 12),
      expected: [{ userIds: ['tore'], holes: [10], lastHole: 12 }],
    },
    {
      name: 'flere hull i samme rad',
      players: [player('tore')],
      scores: holes('tore', 1, 2, 5),
      expected: [{ userIds: ['tore'], holes: [3, 4], lastHole: 5 }],
    },
    {
      name: 'ingen rad etter siste førte hull',
      players: [player('kari')],
      scores: holes('kari', ...range(1, 7)),
      expected: [],
    },
    {
      name: 'ingen rader i det hele tatt',
      players: [player('kari')],
      scores: [],
      expected: [],
    },
    {
      name: 'back9: ekte hullnummer',
      mode: 'singles_matchplay',
      segment: 'back9',
      players: [player('ola', { team_number: 1, flight_number: 1 })],
      scores: holes('ola', 11, 12),
      expected: [{ userIds: ['ola'], holes: [10], lastHole: 12 }],
    },
    {
      name: 'back9: rader utenfor segmentet ignoreres',
      mode: 'singles_matchplay',
      segment: 'back9',
      players: [player('ola', { team_number: 1, flight_number: 1 })],
      scores: holes('ola', 3, 10, 12),
      expected: [{ userIds: ['ola'], holes: [11], lastHole: 12 }],
    },
    {
      name: 'trukket og levert hoppes over',
      players: [
        player('wd', { withdrawn_at: WITHDRAWN }),
        player('done', { submitted_at: SUBMITTED }),
        player('play'),
      ],
      scores: [...holes('wd', 1, 3), ...holes('done', 1, 3), ...holes('play', 1, 3)],
      expected: [{ userIds: ['play'], holes: [2], lastHole: 3 }],
    },
    {
      name: 'lagsammenslåing: felles kort gir én rad',
      mode: 'texas_scramble',
      players: [
        player('kari', { team_number: 1, flight_number: 1 }),
        player('ola', { team_number: 1, flight_number: 1 }),
      ],
      // The captain (lex-min, «kari») owns the team's rows.
      scores: holes('kari', 1, 2, 4),
      expected: [{ userIds: ['kari', 'ola'], holes: [3], lastHole: 4 }],
    },
    {
      name: 'lag med ulike hull gir to rader',
      mode: 'best_ball',
      players: [
        player('kari', { team_number: 1, flight_number: 1 }),
        player('ola', { team_number: 1, flight_number: 1 }),
      ],
      scores: [...holes('kari', 1, 3), ...holes('ola', 1, 2, 4)],
      expected: [
        { userIds: ['kari'], holes: [2], lastHole: 3 },
        { userIds: ['ola'], holes: [3], lastHole: 4 },
      ],
    },
    {
      name: 'kapteinsbytte: radene til den trukne kapteinen foldes inn',
      mode: 'texas_scramble',
      players: [
        player('a', { team_number: 1, flight_number: 1, withdrawn_at: WITHDRAWN }),
        player('b', { team_number: 1, flight_number: 1 }),
      ],
      // «a» entered 1-5, then left; «b» owns the team's rows from then on.
      scores: [...holes('a', 1, 2, 3, 4, 5), ...holes('b', 6, 8)],
      expected: [{ userIds: ['b'], holes: [7], lastHole: 8 }],
    },
    {
      name: 'shotgun: flighter på ulike starthull gir ingen rader',
      startType: 'shotgun',
      players: [
        player('f1', { flight_number: 1 }),
        player('f2', { flight_number: 2 }),
      ],
      scores: [...holes('f1', 10, 11, 12), ...holes('f2', 15, 16, 17, 18, 1)],
      expected: [],
    },
    {
      name: 'rosterrekkefølge',
      players: [player('z'), player('a')],
      scores: [...holes('z', 1, 3), ...holes('a', 1, 4)],
      expected: [
        { userIds: ['z'], holes: [2], lastHole: 3 },
        { userIds: ['a'], holes: [2, 3], lastHole: 4 },
      ],
    },
  ];

  it.each(cases)('$name', (c) => {
    expect(
      findScoreGaps({
        players: c.players,
        scores: c.scores,
        mode: c.mode ?? 'stableford',
        holeSegment: c.segment ?? 'full',
        startType: c.startType ?? 'first_tee',
      }),
    ).toEqual(c.expected);
  });
});

describe('flightProgress', () => {
  type Case = {
    name: string;
    mode?: GameMode;
    segment?: HoleSegment;
    startType?: StartType;
    players: Row[];
    scores: { user_id: string; hole_number: number }[];
    expected: Array<Partial<ReturnType<typeof flightProgress>[number]>>;
  };

  const cases: Case[] = [
    {
      name: 'singles matchplay, begge sider i flight 1 (cup-oppsett) → én flight-gruppe',
      mode: 'singles_matchplay',
      segment: 'front9',
      players: [
        player('a', { team_number: 1, flight_number: 1 }),
        player('b', { team_number: 2, flight_number: 1 }),
      ],
      scores: [...holes('a', ...range(1, 9)), ...holes('b', ...range(1, 9))],
      expected: [
        { label: { kind: 'flight', n: 1 }, maxHole: 9, position: 9, played: 9, holeCount: 9, userIds: ['a', 'b'] },
      ],
    },
    {
      name: 'singles matchplay, flight = side (veiviser-oppsett) → sider',
      mode: 'singles_matchplay',
      players: [
        player('a', { team_number: 1, flight_number: 1 }),
        player('b', { team_number: 2, flight_number: 2 }),
      ],
      scores: [...holes('a', 1, 2, 3), ...holes('b', 1, 2)],
      expected: [
        { label: { kind: 'side', n: 1 }, maxHole: 3, position: 3, holeCount: 18 },
        { label: { kind: 'side', n: 2 }, maxHole: 2, position: 2, holeCount: 18 },
      ],
    },
    {
      name: 'ingen flighter → «Alle spillere»',
      mode: 'solo_strokeplay',
      players: [player('a'), player('b')],
      scores: [...holes('a', 1, 2), ...holes('b', 1)],
      expected: [{ label: { kind: 'all' }, maxHole: 2, position: 2, userIds: ['a', 'b'] }],
    },
    {
      name: 'noen uten flight → «Uten flight» sist',
      players: [
        player('x'),
        player('b', { flight_number: 2 }),
        player('a', { flight_number: 1 }),
      ],
      scores: holes('a', 1),
      expected: [
        { label: { kind: 'flight', n: 1 }, maxHole: 1, position: 1 },
        { label: { kind: 'flight', n: 2 }, maxHole: null, position: 0 },
        { label: { kind: 'none' }, userIds: ['x'] },
      ],
    },
    {
      name: 'back9: hull 12 er posisjon 3 av 9',
      mode: 'singles_matchplay',
      segment: 'back9',
      players: [
        player('a', { team_number: 1, flight_number: 1 }),
        player('b', { team_number: 2, flight_number: 1 }),
      ],
      scores: [...holes('a', 10, 11, 12), ...holes('b', 10, 11)],
      expected: [{ maxHole: 12, position: 3, played: 3, holeCount: 9 }],
    },
    {
      name: 'felles kort: laget når 18',
      mode: 'texas_scramble',
      players: [
        player('kari', { team_number: 1, flight_number: 1 }),
        player('ola', { team_number: 1, flight_number: 1 }),
      ],
      scores: holes('kari', ...range(1, 18)),
      expected: [{ maxHole: 18, position: 18, holeCount: 18 }],
    },
    {
      name: 'shotgun: 15–18 og 1 er fem førte hull, ikke 18 av 18',
      startType: 'shotgun',
      players: [player('a', { flight_number: 1 })],
      scores: holes('a', 15, 16, 17, 18, 1),
      expected: [{ maxHole: null, played: 5, position: 5, holeCount: 18, startType: 'shotgun' }],
    },
    {
      name: 'shotgun: 7–12 er seks førte hull',
      startType: 'shotgun',
      players: [player('a', { flight_number: 3 })],
      scores: holes('a', ...range(7, 12)),
      expected: [{ maxHole: null, played: 6, position: 6 }],
    },
    {
      name: 'alle aktive har levert, trukket teller ikke',
      players: [
        player('a', { flight_number: 1, submitted_at: SUBMITTED }),
        player('wd', { flight_number: 1, withdrawn_at: WITHDRAWN }),
      ],
      scores: holes('a', ...range(1, 18)),
      expected: [{ allSubmitted: true, userIds: ['a'] }],
    },
    {
      name: 'én har ikke levert',
      players: [
        player('a', { flight_number: 1, submitted_at: SUBMITTED }),
        player('b', { flight_number: 1 }),
      ],
      scores: holes('a', 1),
      expected: [{ allSubmitted: false, startType: 'first_tee' }],
    },
    {
      name: 'alle trukket → ingen grupper',
      players: [player('wd', { withdrawn_at: WITHDRAWN })],
      scores: [],
      expected: [],
    },
  ];

  it.each(cases)('$name', (c) => {
    const result = flightProgress({
      players: c.players,
      scores: c.scores,
      mode: c.mode ?? 'stableford',
      holeSegment: c.segment ?? 'full',
      startType: c.startType ?? 'first_tee',
    });
    expect(result).toHaveLength(c.expected.length);
    c.expected.forEach((expected, i) => {
      expect(result[i]).toMatchObject(expected);
    });
  });
});

describe('gapLocation', () => {
  type Case = {
    name: string;
    mode?: GameMode;
    segment?: HoleSegment;
    players: Row[];
    scores: { user_id: string; hole_number: number }[];
    expected: ReturnType<typeof gapLocation>;
  };

  const cases: Case[] = [
    {
      name: 'flight: gruppas hull, ikke spillerens',
      players: [
        player('kari', { flight_number: 1 }),
        player('tore', { flight_number: 2 }),
        player('ola', { flight_number: 2 }),
      ],
      scores: [...holes('kari', 1, 2), ...holes('tore', ...range(1, 9), 11), ...holes('ola', ...range(1, 12))],
      expected: { label: { kind: 'flight', n: 2 }, hole: 12 },
    },
    {
      name: 'side: singles matchplay med flight = lag',
      mode: 'singles_matchplay',
      players: [
        player('a', { team_number: 1, flight_number: 1 }),
        player('b', { team_number: 2, flight_number: 2 }),
      ],
      scores: [...holes('a', 1, 2, 4, 5, 6), ...holes('b', 1, 2, 3)],
      expected: { label: { kind: 'side', n: 1 }, hole: 6 },
    },
    {
      name: 'alle spillere: spillerens eget siste hull',
      mode: 'solo_strokeplay',
      players: [player('sigrid'), player('berit')],
      scores: [...holes('sigrid', 1, 2, 3, 4, 6, 7, 8), ...holes('berit', ...range(1, 10))],
      expected: { label: { kind: 'all' }, hole: 8 },
    },
    {
      name: 'uten flight: spillerens eget siste hull',
      players: [player('a', { flight_number: 1 }), player('x')],
      scores: [...holes('a', ...range(1, 15)), ...holes('x', 1, 3)],
      expected: { label: { kind: 'none' }, hole: 3 },
    },
    {
      name: 'bakre ni: ekte hullnummer 12',
      mode: 'best_ball',
      segment: 'back9',
      players: [
        player('lars', { team_number: 1, flight_number: 1 }),
        player('ola', { team_number: 1, flight_number: 1 }),
      ],
      scores: [...holes('lars', 10, 12), ...holes('ola', 10, 11, 12)],
      expected: { label: { kind: 'flight', n: 1 }, hole: 12 },
    },
  ];

  it.each(cases)('$name', (c) => {
    const input = {
      players: c.players,
      scores: c.scores,
      mode: c.mode ?? 'stableford',
      holeSegment: c.segment ?? 'full',
      startType: 'first_tee' as const,
    };
    const [gap] = findScoreGaps(input);
    expect(gapLocation(gap, flightProgress(input))).toEqual(c.expected);
  });
});

describe('missingScoreTargets', () => {
  type Guest = Row & { is_guest?: boolean };
  type Case = {
    name: string;
    mode?: GameMode;
    players: Guest[];
    scores: { user_id: string; hole_number: number }[];
    pressed: string[];
    expected: ReturnType<typeof missingScoreTargets>;
  };

  const cases: Case[] = [
    {
      name: 'én spiller: hans egne hull',
      players: [player('tore', { flight_number: 2 }), player('ola', { flight_number: 2 })],
      scores: [...holes('tore', ...range(1, 9), 11, 12), ...holes('ola', ...range(1, 12))],
      pressed: ['tore'],
      expected: { userIds: ['tore'], holes: [10] },
    },
    {
      name: 'felles kort: begge lagkameratene',
      mode: 'texas_scramble',
      players: [
        player('kari', { team_number: 1, flight_number: 1 }),
        player('per', { team_number: 1, flight_number: 1 }),
      ],
      scores: holes('kari', 1, 2, 4, 5),
      pressed: ['kari', 'per'],
      expected: { userIds: ['kari', 'per'], holes: [3] },
    },
    {
      name: 'gjest i raden purres ikke',
      mode: 'texas_scramble',
      players: [
        player('kari', { team_number: 1, flight_number: 1 }),
        { ...player('gjest', { team_number: 1, flight_number: 1 }), is_guest: true },
      ],
      scores: holes('gjest', 1, 3),
      pressed: ['gjest', 'kari'],
      expected: { userIds: ['kari'], holes: [2] },
    },
    {
      name: 'hullet er ført siden: ingen rad, ingen mål',
      players: [player('tore')],
      scores: holes('tore', ...range(1, 12)),
      pressed: ['tore'],
      expected: null,
    },
    {
      name: 'levert siden: ingen mål',
      players: [player('tore', { submitted_at: SUBMITTED })],
      scores: holes('tore', 1, 3),
      pressed: ['tore'],
      expected: null,
    },
    {
      name: 'en spiller som ikke er i raden, sendes ikke med',
      players: [player('tore'), player('ola')],
      scores: [...holes('tore', 1, 3), ...holes('ola', 1, 4)],
      pressed: ['tore', 'ola'],
      expected: { userIds: ['tore'], holes: [2] },
    },
    {
      name: 'bare gjester i raden: ingen mål',
      players: [{ ...player('gjest'), is_guest: true }],
      scores: holes('gjest', 1, 3),
      pressed: ['gjest'],
      expected: null,
    },
  ];

  it.each(cases)('$name', (c) => {
    const input = {
      players: c.players,
      scores: c.scores,
      mode: c.mode ?? 'stableford',
      holeSegment: 'full' as const,
      startType: 'first_tee' as const,
    };
    expect(missingScoreTargets(findScoreGaps(input), c.players, c.pressed)).toEqual(c.expected);
  });
});

describe('pultInitialTab', () => {
  it.each([
    [{ status: 'player_withdrawn' }, 'players'],
    [{ status: 'player_reinstated' }, 'players'],
    [{ error: 'withdraw_stale' }, 'players'],
    [{ error: 'reinstate_stale' }, 'players'],
    [{ status: 'flight_suggested' }, 'setup'],
    [{ status: 'flight_updated' }, 'setup'],
    [{ status: 'team_suggested' }, 'setup'],
    [{ status: 'team_updated' }, 'setup'],
    [{ error: 'bad_flight' }, 'setup'],
    [{ error: 'flight_full' }, 'setup'],
    [{ error: 'bad_team' }, 'setup'],
    [{ error: 'team_full' }, 'setup'],
    [{ error: 'db_roster' }, 'setup'],
    [{ status: 'admin_approved' }, 'live'],
    [{ error: 'db_players' }, 'live'],
    [{ error: 'not_active' }, 'live'],
    [{}, 'live'],
  ] as const)('%o → %s', (sp, expected) => {
    expect(pultInitialTab(sp)).toBe(expected);
  });
});

describe('elapsedParts', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    ['ikke startet', null, null],
    ['under én time', ago(14 * 60_000 + 59_000), { hours: 0, minutes: 14 }],
    ['over én time', ago((2 * 60 + 14) * 60_000), { hours: 2, minutes: 14 }],
    ['start i framtida gir aldri negativ tid', ago(-5 * 60_000), { hours: 0, minutes: 0 }],
    ['ugyldig tidsstempel', 'ikke-en-dato', null],
  ] as const)('%s', (_label, startedAt, expected) => {
    expect(elapsedParts(startedAt, now)).toEqual(expected);
  });
});
