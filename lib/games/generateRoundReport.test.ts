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

import { generateAndPersistRoundReport } from './generateRoundReport';

const GAME_ID = '11111111-1111-1111-1111-111111111111';

const GAME_ROW = {
  game: {
    id: GAME_ID,
    game_mode: 'solo_strokeplay' as const,
    mode_config: { kind: 'solo_strokeplay' as const, team_size: 1 as const },
    course_id: 'course-1',
    name: 'Lørdagscup',
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
      { userId: 'u1', gross: 4, net: 4, par: 4 },
      { userId: 'u2', gross: 5, net: 5, par: 4 },
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
    games: { data: { ended_at: '2026-07-01T18:00:00.000Z' }, error: null },
    'games:update': { data: [{ id: GAME_ID }], error: null },
    course_holes: { data: makeHoleRows(18).map((h) => ({ par_mens: h.par })), error: null },
  };

  getGameWithPlayersMock.mockResolvedValue(GAME_ROW);
  buildModeResultForGameMock.mockResolvedValue(makeSoloStrokeplayResult(18));
  messagesCreateMock.mockResolvedValue({
    content: [{ type: 'text', text: 'Alice vant Lørdagscup med solid margin foran Bob.' }],
  });
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
});

describe('generateAndPersistRoundReport', () => {
  it("returns 'skipped' without constructing the SDK client when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const status = await generateAndPersistRoundReport(GAME_ID);

    expect(status).toBe('skipped');
    expect(anthropicConstructorMock).not.toHaveBeenCalled();
    expect(getGameWithPlayersMock).not.toHaveBeenCalled();
  });

  it("returns 'skipped' when buildModeResultForGame returns null", async () => {
    buildModeResultForGameMock.mockResolvedValue(null);

    const status = await generateAndPersistRoundReport(GAME_ID);

    expect(status).toBe('skipped');
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns 'skipped' when fewer than 6 holes have a recorded score", async () => {
    buildModeResultForGameMock.mockResolvedValue(makeSoloStrokeplayResult(5));

    const status = await generateAndPersistRoundReport(GAME_ID);

    expect(status).toBe('skipped');
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it("returns 'failed' and logs, never throws, when the SDK call rejects", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock.mockRejectedValue(new Error('anthropic down'));

    const status = await generateAndPersistRoundReport(GAME_ID);

    expect(status).toBe('failed');
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
      content: [{ type: 'text', text: 'a'.repeat(1501) }],
    });

    const status = await generateAndPersistRoundReport(GAME_ID);

    expect(status).toBe('failed');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("returns 'failed' when the update affects 0 rows (PostgREST 0-row trap)", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixtures['games:update'] = { data: [], error: null };

    const status = await generateAndPersistRoundReport(GAME_ID);

    expect(status).toBe('failed');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("happy path: constructs the SDK client with the documented options, calls messages.create once, persists the sanitized text, returns 'generated'", async () => {
    const status = await generateAndPersistRoundReport(GAME_ID);

    expect(anthropicConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key', timeout: 20_000, maxRetries: 1 }),
    );
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    const callArgs = messagesCreateMock.mock.calls[0][0];
    expect(callArgs).toMatchObject({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
    });
    expect(callArgs).not.toHaveProperty('temperature');
    expect(callArgs).not.toHaveProperty('thinking');
    expect(callArgs.messages).toEqual([{ role: 'user', content: expect.stringContaining('Alice') }]);

    expect(updateSpy).toHaveBeenCalledWith(
      'games',
      { round_report: 'Alice vant Lørdagscup med solid margin foran Bob.' },
    );
    expect(status).toBe('generated');
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
