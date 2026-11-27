import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// System-boundary mocks — SDK, getGameWithPlayers, buildModeResultForGame,
// admin client. Everything else (fact-builder, prompt-builder, sanitizer)
// runs for real so the happy-path test exercises the full pipeline.
// ---------------------------------------------------------------------------

const messagesCreateMock = vi.fn();
const anthropicConstructorMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: messagesCreateMock };
    constructor(opts: unknown) {
      anthropicConstructorMock(opts);
    }
  },
}));

const getGameWithPlayersMock = vi.fn();
vi.mock('./getGameWithPlayers', () => ({
  getGameWithPlayers: (...args: unknown[]) => getGameWithPlayersMock(...args),
}));

const buildModeResultForGameMock = vi.fn();
vi.mock('@/lib/scoring/buildModeResultForGame', () => ({
  buildModeResultForGame: (...args: unknown[]) => buildModeResultForGameMock(...args),
}));

// Fixtures per table — overridden per test. Mirrors notifyAchievementUnlocks.test.ts.
type Fixture = { data: unknown; error: unknown };
let fixtures: Record<string, Fixture>;
const updateSpy = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => fixtures[table],
          returns: () => Promise.resolve(fixtures[table]),
        }),
      }),
      update: (payload: unknown) => {
        updateSpy(table, payload);
        return {
          eq: () => ({
            select: () => Promise.resolve(fixtures[`${table}:update`]),
          }),
        };
      },
    }),
  }),
}));

// #2561 PR B: who said yes to AI texts. Default: everyone in the fixture.
const readAiAllowedUserIdsMock = vi.fn();
vi.mock('@/lib/ai/consent', () => ({
  readAiAllowedUserIds: (...args: unknown[]) => readAiAllowedUserIdsMock(...args),
}));

// #2983: the league table, read for a league flight. Default: not read.
const getLigaSnapshotMock = vi.fn();
vi.mock('@/lib/league/getLigaSnapshot', () => ({
  getLigaSnapshot: (...args: unknown[]) => getLigaSnapshotMock(...args),
}));

import { generateAndPersistRoundReport } from './generateRoundReport';

const GAME_ID = '11111111-1111-1111-1111-111111111111';

const GAME_ROW = {
  game: {
    id: GAME_ID,
    game_mode: 'solo_strokeplay' as const,
    mode_config: { kind: 'solo_strokeplay' as const, team_size: 1 as const },
    course_id: 'course-1',
    name: 'Lørdagscup',
    // #1441: every GameForHole carries these two now — a host (the only
    // kind generateAndPersistRoundReport ever runs on) is 'full'/null.
    hole_segment: 'full' as const,
    source_game_id: null as string | null,
  },
  players: [
    {
      user_id: 'u1',
      withdrawn_at: null,
      users: { name: 'Alice', nickname: null },
    },
    {
      user_id: 'u2',
      withdrawn_at: null,
      users: { name: 'Bob', nickname: null },
    },
  ],
};

function makeHoleRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    strokeIndex: i + 1,
    perPlayer: [
      { userId: 'u1', gross: 4, net: 4, par: 4, toPar: 0 },
      { userId: 'u2', gross: 5, net: 5, par: 4, toPar: 1 },
    ],
    bestUserIds: ['u1'],
  }));
}

function makeSoloStrokeplayResult(holeCount: number) {
  return {
    kind: 'solo_strokeplay' as const,
    holes: makeHoleRows(holeCount),
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: holeCount, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: holeCount, rank: 2, tiedWith: [] },
    ],
  };
}

let originalApiKey: string | undefined;

beforeEach(() => {
  originalApiKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  vi.clearAllMocks();
  fixtures = {
    courses: { data: { name: 'Oslo GK' }, error: null },
    league_rounds: { data: { league_id: 'league-1' }, error: null },
    'games:update': { data: [{ id: GAME_ID }], error: null },
    course_holes: {
      data: makeHoleRows(18).map((h) => ({ hole_number: h.holeNumber, par_mens: h.par })),
      error: null,
    },
  };

  getGameWithPlayersMock.mockResolvedValue(GAME_ROW);
  buildModeResultForGameMock.mockResolvedValue(makeSoloStrokeplayResult(18));
  readAiAllowedUserIdsMock.mockResolvedValue(new Set(['u1', 'u2']));
  messagesCreateMock.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Alice vant Lørdagscup med solid margin foran Bob.' }],
  });
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
});

describe('generateAndPersistRoundReport', () => {
  it("#2561: returns 'skipped' without a model call when nobody said yes", async () => {
    readAiAllowedUserIdsMock.mockResolvedValue(new Set());

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'skipped', report: null });
    expect(anthropicConstructorMock).not.toHaveBeenCalled();
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("#2561: returns 'skipped' without a model call when only a player the facts cannot show said yes", async () => {
    // Only the 4th place said yes: the podium, the winner and every
    // checkpoint leader are hidden, so the facts would name nobody.
    const ids = ['u1', 'u2', 'u3', 'u4'];
    getGameWithPlayersMock.mockResolvedValue({
      ...GAME_ROW,
      players: ids.map((id, i) => ({
        user_id: id,
        withdrawn_at: null,
        users: { name: ['Alice', 'Bob', 'Carl', 'Dina'][i], nickname: null },
      })),
    });
    buildModeResultForGameMock.mockResolvedValue({
      kind: 'solo_strokeplay' as const,
      holes: Array.from({ length: 18 }, (_, h) => ({
        holeNumber: h + 1,
        par: 4,
        strokeIndex: h + 1,
        perPlayer: ids.map((userId, i) => ({ userId, gross: 4 + i, net: 4 + i, par: 4, toPar: i })),
        bestUserIds: ['u1'],
      })),
      players: ids.map((userId, i) => ({
        userId,
        totalNetStrokes: 72 + 18 * i,
        totalGrossStrokes: 72 + 18 * i,
        holesPlayed: 18,
        rank: i + 1,
        tiedWith: [],
      })),
    });
    readAiAllowedUserIdsMock.mockResolvedValue(new Set(['u4']));

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'skipped', report: null });
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('#2561: asks about the active players and leaves a player without «ja» out of the prompt', async () => {
    readAiAllowedUserIdsMock.mockResolvedValue(new Set(['u1']));

    await generateAndPersistRoundReport(GAME_ID);

    expect(readAiAllowedUserIdsMock).toHaveBeenCalledWith(expect.anything(), ['u1', 'u2']);
    const request = messagesCreateMock.mock.calls[0][0] as { messages: { content: string }[] };
    expect(request.messages[0].content).not.toContain('Bob');
  });

  it('#2561: leaves out a game name that names a player without «ja»', async () => {
    getGameWithPlayersMock.mockResolvedValue({
      ...GAME_ROW,
      game: { ...GAME_ROW.game, name: 'Bobs 50-årsdag' },
    });
    readAiAllowedUserIdsMock.mockResolvedValue(new Set(['u1']));

    await generateAndPersistRoundReport(GAME_ID);

    const request = messagesCreateMock.mock.calls[0][0] as { messages: { content: string }[] };
    expect(request.messages[0].content).not.toContain('Bobs');
    expect(request.messages[0].content).toMatch(/"gameName":\s*null/);
  });

  it('#2561: reads the answer of a withdrawn player too, so a yes keeps a game name that names them', async () => {
    getGameWithPlayersMock.mockResolvedValue({
      ...GAME_ROW,
      game: { ...GAME_ROW.game, name: 'Carls minnecup' },
      players: [
        ...GAME_ROW.players,
        { user_id: 'u3', withdrawn_at: '2026-07-01T10:00:00.000Z', users: { name: 'Carl', nickname: null } },
      ],
    });
    readAiAllowedUserIdsMock.mockResolvedValue(new Set(['u1', 'u2', 'u3']));

    await generateAndPersistRoundReport(GAME_ID);

    expect(readAiAllowedUserIdsMock).toHaveBeenCalledWith(expect.anything(), ['u1', 'u2', 'u3']);
    const request = messagesCreateMock.mock.calls[0][0] as { messages: { content: string }[] };
    expect(request.messages[0].content).toContain('Carls minnecup');
  });

  it("returns 'skipped' without constructing the SDK client when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'skipped', report: null });
    expect(anthropicConstructorMock).not.toHaveBeenCalled();
    expect(getGameWithPlayersMock).not.toHaveBeenCalled();
  });

  it("#1441: returns 'skipped' without ever calling buildModeResultForGame for a derived game", async () => {
    getGameWithPlayersMock.mockResolvedValue({
      game: { ...GAME_ROW.game, source_game_id: 'host-1' },
      players: GAME_ROW.players,
    });

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'skipped', report: null });
    expect(buildModeResultForGameMock).not.toHaveBeenCalled();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('#1441: threads hole_segment through to buildModeResultForGame', async () => {
    getGameWithPlayersMock.mockResolvedValue({
      game: { ...GAME_ROW.game, hole_segment: 'back9' },
      players: GAME_ROW.players,
    });

    await generateAndPersistRoundReport(GAME_ID);

    expect(buildModeResultForGameMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hole_segment: 'back9' }),
    );
  });

  it("returns 'skipped' when buildModeResultForGame returns null", async () => {
    buildModeResultForGameMock.mockResolvedValue(null);

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'skipped', report: null });
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns 'skipped' when fewer than 6 holes have a recorded score", async () => {
    buildModeResultForGameMock.mockResolvedValue(makeSoloStrokeplayResult(5));

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'skipped', report: null });
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it("returns 'failed' and logs, never throws, when the SDK call rejects", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock.mockRejectedValue(new Error('anthropic down'));

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'failed', report: null });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[generateRoundReport] failed',
      expect.objectContaining({ gameId: GAME_ID }),
    );
    expect(updateSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("returns 'failed' when the sanitizer rejects the model output (too long)", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'a'.repeat(1501) }],
    });

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'failed', report: null });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("returns 'failed' and persists nothing when the model stops at the token cap", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'Alice vant Lørdagscup med solid' }],
    });

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'failed', report: null });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[generateRoundReport] model stopped early',
      expect.objectContaining({ gameId: GAME_ID, stopReason: 'max_tokens' }),
    );

    consoleErrorSpy.mockRestore();
  });

  it("returns 'failed' when the update affects 0 rows (PostgREST 0-row trap)", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixtures['games:update'] = { data: [], error: null };

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(result).toEqual({ status: 'failed', report: null });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("happy path: constructs the SDK client with the documented options, calls messages.create once, persists the sanitized text, returns 'generated' + the report text", async () => {
    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(anthropicConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key', timeout: 20_000, maxRetries: 1 }),
    );
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    const callArgs = messagesCreateMock.mock.calls[0][0];
    expect(callArgs).toMatchObject({
      model: 'claude-sonnet-5',
      max_tokens: 4_000,
      output_config: { effort: 'low' },
    });
    expect(callArgs).not.toHaveProperty('temperature');
    expect(callArgs).not.toHaveProperty('thinking');
    expect(callArgs.messages).toEqual([{ role: 'user', content: expect.stringContaining('Alice') }]);

    expect(updateSpy).toHaveBeenCalledWith(
      'games',
      { round_report: 'Alice vant Lørdagscup med solid margin foran Bob.' },
    );
    expect(result).toEqual({
      status: 'generated',
      report: 'Alice vant Lørdagscup med solid margin foran Bob.',
    });
  });

  it('excludes withdrawn players from the name map (never appear as a userId leak)', async () => {
    getGameWithPlayersMock.mockResolvedValue({
      game: GAME_ROW.game,
      players: [
        ...GAME_ROW.players,
        { user_id: 'u3', withdrawn_at: '2026-06-01T00:00:00.000Z', users: { name: 'Carl', nickname: null } },
      ],
    });

    await generateAndPersistRoundReport(GAME_ID);

    const callArgs = messagesCreateMock.mock.calls[0][0];
    expect(callArgs.messages[0].content).not.toContain('Carl');
  });
});

// ---------------------------------------------------------------------------
// #2983: one more attempt for a dropped draft; a league flight knows the league
// ---------------------------------------------------------------------------
describe('generateAndPersistRoundReport: the check and one more attempt (#2983)', () => {
  const answer = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });

  it('a draft with a weekday is dropped, and the second attempt is told why and stored', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock
      .mockResolvedValueOnce(answer('Alice vant på lørdag foran Bob.'))
      .mockResolvedValueOnce(answer('Alice vant Lørdagscup foran Bob.'));

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    expect(messagesCreateMock.mock.calls[1][0].messages[0].content).toContain(
      'Et tidligere utkast ble forkastet. Utkastet nevnte en ukedag («lørdag»).',
    );
    expect(result).toEqual({ status: 'generated', report: 'Alice vant Lørdagscup foran Bob.' });
    consoleErrorSpy.mockRestore();
  });

  it('two dropped drafts store nothing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock.mockResolvedValue(answer('Alice vant på søndag.'));

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: 'failed', report: null });
    expect(updateSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('no second attempt with less than 8 seconds left of the shared deadline', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let clock = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    messagesCreateMock.mockImplementation(async () => {
      clock += 13_000;
      return answer('Alice vant på søndag.');
    });

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    // The first call gets the whole deadline as its timeout.
    expect(messagesCreateMock.mock.calls[0][1]).toEqual({ timeout: 20_000 });
    expect(result).toEqual({ status: 'failed', report: null });
    nowSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('the facts hold no date, and the date is not read', async () => {
    await generateAndPersistRoundReport(GAME_ID);
    const content = messagesCreateMock.mock.calls[0][0].messages[0].content as string;
    expect(content).not.toContain('endedAt');
    expect(content).not.toContain('2026-07-01');
  });
});

describe('generateAndPersistRoundReport: a league flight (#2983)', () => {
  const FLIGHT_GAME = {
    game: { ...GAME_ROW.game, league_round_id: 'round-2', name: 'Vinterligaen – Runde 2' },
    players: [{ user_id: 'u1', withdrawn_at: null, users: { name: 'Alice Aas', nickname: 'Ali' } }],
  };
  // The table with the flight in it (Alice 2nd) and without it (Alice 5th).
  const SNAPSHOT = {
    league: { name: 'Vinterligaen', format: 'stableford' },
    rounds: [{ id: 'round-2', sequence: 2, label: 'Runde 2' }],
    participants: [
      { userId: 'u1', name: 'Alice Aas', nickname: 'Ali' },
      { userId: 'u9', name: 'Bob Berg', nickname: null },
    ],
    standings: {
      net: {
        rows: [
          { userId: 'u9', ranked: true, rank: 1, perRound: [{ roundId: 'round-2', value: 40, penalised: false }] },
          { userId: 'u1', ranked: true, rank: 2, perRound: [{ roundId: 'round-2', value: 36, penalised: false }] },
        ],
      },
      gross: null,
    },
    baseline: {
      net: {
        rows: [
          { userId: 'u9', ranked: true, rank: 1, perRound: [] },
          { userId: 'u1', ranked: true, rank: 5, perRound: [] },
        ],
      },
      gross: null,
    },
  };

  beforeEach(() => {
    getGameWithPlayersMock.mockResolvedValue(FLIGHT_GAME);
    const solo = makeSoloStrokeplayResult(18);
    buildModeResultForGameMock.mockResolvedValue({
      ...solo,
      holes: solo.holes.map((h) => ({ ...h, perPlayer: [h.perPlayer[0]!] })),
      players: [solo.players[0]!],
    });
    readAiAllowedUserIdsMock.mockResolvedValue(new Set(['u1', 'u9']));
    getLigaSnapshotMock.mockResolvedValue(SNAPSHOT);
    messagesCreateMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Alice A. klatret foreløpig til 2. plass.' }],
    });
  });

  it('reads the table without this flight, and the facts carry the league, a flight of one and «Alice A.»', async () => {
    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(getLigaSnapshotMock).toHaveBeenCalledWith('league-1', { baseline: { withoutGameId: GAME_ID } });
    const content = messagesCreateMock.mock.calls[0][0].messages[0].content as string;
    const facts = JSON.parse(content.slice(content.indexOf('{')));
    expect(facts).toMatchObject({
      leagueFlight: true,
      soloFlight: true,
      winnerName: null,
      league: {
        leagueName: 'Vinterligaen',
        players: [{ name: 'Alice A.', roundPlace: 2, tablePlace: 2, tablePlaceBefore: 5, move: 3, passed: [] }],
      },
    });
    expect(content).not.toContain('Ali"');
    expect(result.status).toBe('generated');
  });

  it('a failed table read gives the report without the league block', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getLigaSnapshotMock.mockRejectedValue(new Error('db down'));

    const result = await generateAndPersistRoundReport(GAME_ID);

    const content = messagesCreateMock.mock.calls[0][0].messages[0].content as string;
    expect(content).not.toContain('"league"');
    expect(result.status).toBe('generated');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[generateRoundReport] league read failed, the report goes without it',
      expect.objectContaining({ gameId: GAME_ID }),
    );
    consoleErrorSpy.mockRestore();
  });

  it('a number the league facts do not hold drops the draft', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Alice A. klatret 7 plasser.' }] })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Alice A. klatret foreløpig 3 plasser.' }] });

    const result = await generateAndPersistRoundReport(GAME_ID);

    expect(messagesCreateMock.mock.calls[1][0].messages[0].content).toContain(
      'Utkastet inneholdt tall som ikke står i fakta-objektet: 7.',
    );
    expect(result).toEqual({ status: 'generated', report: 'Alice A. klatret foreløpig 3 plasser.' });
    consoleErrorSpy.mockRestore();
  });
});

