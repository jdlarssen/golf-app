import { describe, it, expect } from 'vitest';
import {
  holesFilledByGame,
  liveRoundRows,
  needsYouRows,
  type ActiveGameInput,
  type ActivePlayerInput,
  type HolesRosterRow,
  type HolesScoreRow,
  type LiveRoundRow,
  type NeedsYouRow,
} from './actionItems';

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<ActiveGameInput> = {}): ActiveGameInput {
  return {
    id: 'g1',
    name: 'Tirsdagsrunde',
    requirePeerApproval: false,
    ...overrides,
  };
}

function makePlayer(
  gameId: string,
  overrides: Partial<Omit<ActivePlayerInput, 'gameId'>> = {},
): ActivePlayerInput {
  return {
    gameId,
    submittedAt: null,
    approvedAt: null,
    withdrawnAt: null,
    holesFilled: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('needsYouRows', () => {
  const row = (overrides: Partial<NeedsYouRow> = {}): NeedsYouRow => ({
    gameId: 'g1',
    name: 'Tirsdagsrunde',
    notDelivered: 0,
    pendingApproval: 0,
    allDelivered: false,
    ...overrides,
  });

  it('returns no rows when there are no active games', () => {
    expect(needsYouRows([], [])).toEqual([]);
  });

  it('returns no rows when a game has no players', () => {
    expect(needsYouRows([makeGame()], [])).toEqual([]);
  });

  it.each([
    ['not_started (0 holes)', 0],
    ['playing (mid-round, 9 holes)', 9],
    ['playing (17 holes)', 17],
  ])('does not count a mid-round player (%s)', (_label, holesFilled) => {
    expect(needsYouRows([makeGame()], [makePlayer('g1', { holesFilled })])).toEqual([]);
  });

  it('counts a ready_not_delivered player as a scorecard not delivered', () => {
    expect(needsYouRows([makeGame()], [makePlayer('g1', { holesFilled: 18 })])).toEqual([
      row({ notDelivered: 1 }),
    ]);
  });

  it('has no row when the only player has already submitted', () => {
    expect(
      needsYouRows(
        [makeGame()],
        [makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' })],
      ),
    ).toEqual([]);
  });

  it('counts a submitted-not-approved player when requirePeerApproval=true, and everyone has delivered', () => {
    expect(
      needsYouRows(
        [makeGame({ requirePeerApproval: true })],
        [makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' })],
      ),
    ).toEqual([row({ pendingApproval: 1, allDelivered: true })]);
  });

  it('has no row for a submitted-not-approved player when requirePeerApproval=false', () => {
    expect(
      needsYouRows(
        [makeGame({ requirePeerApproval: false })],
        [makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' })],
      ),
    ).toEqual([]);
  });

  it('a card waiting for approval while another player still plays is not «all delivered»', () => {
    expect(
      needsYouRows(
        [makeGame({ requirePeerApproval: true })],
        [
          makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' }),
          makePlayer('g1', { holesFilled: 12 }),
        ],
      ),
    ).toEqual([row({ pendingApproval: 1, allDelivered: false })]);
  });

  it('leaves withdrawn players out of every count', () => {
    expect(
      needsYouRows(
        [makeGame({ requirePeerApproval: true })],
        [makePlayer('g1', { holesFilled: 18, withdrawnAt: '2024-01-01T09:00:00Z' })],
      ),
    ).toEqual([]);
  });

  it('gives one row with both counts when different players trigger each condition', () => {
    expect(
      needsYouRows(
        [makeGame({ requirePeerApproval: true })],
        [
          // ready_not_delivered
          makePlayer('g1', { holesFilled: 18, submittedAt: null }),
          // submitted, not approved
          makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' }),
        ],
      ),
    ).toEqual([row({ notDelivered: 1, pendingApproval: 1 })]);
  });

  it('counts every player but gives the game one row', () => {
    expect(
      needsYouRows(
        [makeGame()],
        [makePlayer('g1', { holesFilled: 18 }), makePlayer('g1', { holesFilled: 18 })],
      ),
    ).toEqual([row({ notDelivered: 2 })]);
  });

  it('handles multiple games independently and puts undelivered games first', () => {
    const games: ActiveGameInput[] = [
      makeGame({ id: 'g2', name: 'Spill 2', requirePeerApproval: true }),
      makeGame({ id: 'g1', name: 'Spill 1' }),
      makeGame({ id: 'g3', name: 'Spill 3' }), // all clean
    ];
    const players: ActivePlayerInput[] = [
      makePlayer('g1', { holesFilled: 18 }), // ready_not_delivered
      makePlayer('g2', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' }), // pending_approval
      makePlayer('g3', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z', approvedAt: '2024-01-01T11:00:00Z' }), // delivered
    ];
    expect(needsYouRows(games, players)).toEqual([
      row({ gameId: 'g1', name: 'Spill 1', notDelivered: 1 }),
      row({ gameId: 'g2', name: 'Spill 2', pendingApproval: 1, allDelivered: true }),
    ]);
  });

  it('returns the actual gameId and name for the link', () => {
    const [first] = needsYouRows(
      [makeGame({ id: 'abc-123', name: 'Cupfinale' })],
      [makePlayer('abc-123', { holesFilled: 18 })],
    );
    expect(first).toMatchObject({ gameId: 'abc-123', name: 'Cupfinale' });
  });

  // #1441 (F5 polish): a segment game (front9/back9) is "ready" at 9 holes,
  // not 18 — without expectedHoles a finished split-day round never surfaced.
  it('counts a finished 9-hole segment game (expectedHoles=9) as not delivered at 9 holes', () => {
    expect(
      needsYouRows([makeGame({ expectedHoles: 9 })], [makePlayer('g1', { holesFilled: 9 })]),
    ).toEqual([row({ notDelivered: 1 })]);
  });

  it('does not count a 9-hole segment game as ready at 8 holes', () => {
    expect(
      needsYouRows([makeGame({ expectedHoles: 9 })], [makePlayer('g1', { holesFilled: 8 })]),
    ).toEqual([]);
  });

  it('defaults to 18 expected holes when expectedHoles is omitted (full-18 games unchanged)', () => {
    expect(needsYouRows([makeGame()], [makePlayer('g1', { holesFilled: 9 })])).toEqual([]);
  });
});

// ─── liveRoundRows (#2345) ────────────────────────────────────────────────

describe('liveRoundRows', () => {
  const submitted = '2026-11-13T10:00:00Z';
  const withdrawn = '2026-11-13T09:00:00Z';

  it.each<[string, Partial<ActiveGameInput>, Partial<Omit<ActivePlayerInput, 'gameId'>>[], Pick<LiveRoundRow, 'playerCount' | 'hole' | 'state'>]>([
    [
      'the tail: the lowest hole among those still playing',
      {},
      [{ holesFilled: 14 }, { holesFilled: 11 }, { holesFilled: 18 }],
      { playerCount: 3, hole: 11, state: 'playing' },
    ],
    [
      'everyone finished: delivered or ready, nobody playing',
      {},
      [{ holesFilled: 18, submittedAt: submitted }, { holesFilled: 18 }],
      { playerCount: 2, hole: null, state: 'done' },
    ],
    [
      'nobody has entered a stroke',
      {},
      [{ holesFilled: 0 }, { holesFilled: 0 }],
      { playerCount: 2, hole: null, state: 'none' },
    ],
    [
      'a withdrawn player is out of the count and the tail',
      {},
      [{ holesFilled: 3, withdrawnAt: withdrawn }, { holesFilled: 12 }],
      { playerCount: 1, hole: 12, state: 'playing' },
    ],
    [
      '9 holes: a player at 9 is finished, the tail is the one at 5',
      { expectedHoles: 9 },
      [{ holesFilled: 9 }, { holesFilled: 5 }],
      { playerCount: 2, hole: 5, state: 'playing' },
    ],
    [
      '9 holes: both at 9 are done',
      { expectedHoles: 9 },
      [{ holesFilled: 9 }, { holesFilled: 9, submittedAt: submitted }],
      { playerCount: 2, hole: null, state: 'done' },
    ],
    ['no players at all', {}, [], { playerCount: 0, hole: null, state: 'none' }],
  ])('%s', (_label, gameOverrides, playerOverrides, expected) => {
    expect(
      liveRoundRows(
        [makeGame(gameOverrides)],
        playerOverrides.map((o) => makePlayer('g1', o)),
      ),
    ).toEqual([{ gameId: 'g1', name: 'Tirsdagsrunde', ...expected }]);
  });

  it('keeps the games in the order given, one row each', () => {
    const rows = liveRoundRows(
      [makeGame({ id: 'b', name: 'B' }), makeGame({ id: 'a', name: 'A' })],
      [makePlayer('a', { holesFilled: 4 }), makePlayer('b', { holesFilled: 7 })],
    );
    expect(rows.map((r) => [r.gameId, r.hole])).toEqual([
      ['b', 7],
      ['a', 4],
    ]);
  });
});

// ─── holesFilledByGame (#2045) ────────────────────────────────────────────

/**
 * Type A: «Trenger deg» teller hull med samme hjem som purringen (#2017) —
 * `filledHolesByPlayer`, gruppert per spill med spillets modus. Eierskaps-
 * reglene har egne suiter; her bevises at limet grupperer og spør riktig.
 */
describe('holesFilledByGame', () => {
  type Roster = HolesRosterRow;
  type Score = HolesScoreRow;

  const member = (
    game_id: string,
    user_id: string,
    team_number: number | null,
    withdrawn_at: string | null = null,
  ): Roster => ({ game_id, user_id, team_number, withdrawn_at });

  const rows = (game_id: string, user_id: string, from: number, to: number): Score[] =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      game_id,
      user_id,
      hole_number: from + i,
    }));

  const asObject = (m: Map<string, number>) => Object.fromEntries(m);

  it('patsome: makkeren med 1–6 og kapteinens 7–18 er ferdig, og spillet flagges når kapteinen har levert', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'patsome' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      scores: [...rows('g1', 'a', 1, 18), ...rows('g1', 'b', 1, 6)],
    });

    expect(asObject(holes)).toEqual({ 'g1:a': 18, 'g1:b': 18 });

    const needs = needsYouRows(
      [makeGame({ id: 'g1' })],
      [
        makePlayer('g1', { holesFilled: holes.get('g1:a')!, submittedAt: '2026-09-17T10:00:00Z' }),
        makePlayer('g1', { holesFilled: holes.get('g1:b')! }),
      ],
    );
    expect(needs.map((r) => [r.gameId, r.notDelivered])).toEqual([['g1', 1]]);
  });

  it('patsome: makkerens løse rader på 7–18 og kapteinens rader på 1–6 teller ikke for makkeren', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'patsome' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      // Kapteinen har bare 4BBB-halvdelen; b har egne 1–5 og data-rester på 7–18.
      scores: [...rows('g1', 'a', 1, 6), ...rows('g1', 'b', 1, 5), ...rows('g1', 'b', 7, 18)],
    });

    expect(asObject(holes)).toEqual({ 'g1:a': 6, 'g1:b': 5 });
  });

  it('patsome: makker med 5 egne rader og ferdig lagkort er fortsatt midt i runden', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'patsome' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      scores: [...rows('g1', 'a', 1, 18), ...rows('g1', 'b', 1, 5)],
    });

    expect(holes.get('g1:b')).toBe(17);
    const needs = needsYouRows(
      [makeGame({ id: 'g1' })],
      [
        makePlayer('g1', { holesFilled: holes.get('g1:a')!, submittedAt: '2026-09-17T10:00:00Z' }),
        makePlayer('g1', { holesFilled: holes.get('g1:b')! }),
      ],
    );
    expect(needs).toEqual([]);
  });

  it('scramble: lagkameraten uten egne rader får kapteinens 18', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'texas_scramble' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      scores: rows('g1', 'a', 1, 18),
    });

    expect(asObject(holes)).toEqual({ 'g1:a': 18, 'g1:b': 18 });
  });

  // #2067: kapteinen slettet kontoen etter hull 9 (trukket, 0174). Hull 1–9
  // ligger på den trukne kapteinen, 10–18 på makkeren som nå eier kortet.
  it('scramble med trukket kaptein: makkeren står på 18/18', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'texas_scramble' }],
      players: [member('g1', 'a', 1, '2026-09-17T10:00:00Z'), member('g1', 'b', 1)],
      scores: [...rows('g1', 'a', 1, 9), ...rows('g1', 'b', 10, 18)],
    });

    expect(holes.get('g1:b')).toBe(18);
  });

  it('flere spill med ulike modi telles hver for seg, uten lekkasje mellom spill', () => {
    const holes = holesFilledByGame({
      games: [
        { id: 'g1', game_mode: 'solo_strokeplay' },
        { id: 'g2', game_mode: 'patsome' },
      ],
      players: [
        // Samme brukere i begge spill, og i g1 har de team_number satt.
        member('g1', 'a', 1),
        member('g1', 'b', 1),
        member('g2', 'a', 1),
        member('g2', 'b', 1),
      ],
      scores: [
        ...rows('g1', 'a', 1, 18),
        ...rows('g1', 'b', 1, 4),
        ...rows('g2', 'a', 1, 9),
        ...rows('g2', 'b', 1, 6),
      ],
    });

    expect(asObject(holes)).toEqual({
      // Slagspill kollapser ikke: egne rader.
      'g1:a': 18,
      'g1:b': 4,
      // Patsome: b har 6 egne + kapteinens 7–9.
      'g2:a': 9,
      'g2:b': 9,
    });
  });

  it('trukket kaptein: eierskapet går videre, og den trukne havner aldri i unsubmitted', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'texas_scramble' }],
      players: [
        member('g1', 'a', 1, '2026-09-17T09:00:00Z'),
        member('g1', 'b', 1),
        member('g1', 'c', 1),
      ],
      // a (trukket, lex-min) har bare 1–9; b er ny eier og har 18. Hadde a
      // fortsatt eid radene, ville c stått på 9.
      scores: [...rows('g1', 'a', 1, 9), ...rows('g1', 'b', 1, 18)],
    });

    expect(holes.get('g1:b')).toBe(18);
    expect(holes.get('g1:c')).toBe(18);

    const needs = needsYouRows(
      [makeGame({ id: 'g1' })],
      [
        makePlayer('g1', {
          holesFilled: holes.get('g1:a')!,
          withdrawnAt: '2026-09-17T09:00:00Z',
        }),
        makePlayer('g1', { holesFilled: holes.get('g1:b')!, submittedAt: '2026-09-17T10:00:00Z' }),
        makePlayer('g1', { holesFilled: holes.get('g1:c')!, submittedAt: '2026-09-17T10:00:00Z' }),
      ],
    );
    expect(needs).toEqual([]);
  });
});
