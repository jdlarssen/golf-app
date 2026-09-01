import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit tests for `runFinishPipeline` — the server-owned finish tail (#1856).
 *
 * Three things here have teeth, and each of them is a bug that already cost
 * this repo something:
 *
 *  1. THE MARKER IS CLAIMED FIRST. Win the row, then work. `notifyAchievementUnlocks`
 *     is a bare INSERT with no unique index and `generateAndPersistRoundReport`
 *     bills an Anthropic call, so a second pass is duplicate varsler and a
 *     duplicate invoice. A claim that loses must run NOTHING.
 *  2. THE CLAIM GOES THROUGH THE SERVICE ROLE. `guard_games_finish_pipeline_at`
 *     (migration 0169) raises 42501 for any non-admin authenticated writer, and
 *     the web finish admits a non-admin creator — so the claim must never ride
 *     on the caller's client.
 *  3. THE CLIENT SPLIT SURVIVES. `finishDerivedGames` and
 *     `buildGameFinishedRecipients` take the CALLER's client (creator RLS on
 *     web, service-role from cup); the other four open their own admin client.
 *
 * Everything is mocked at the import boundary, so a step that moves or changes
 * client shows up as a failing assertion rather than a real write.
 */

const finishDerivedGamesMock = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/syncDerivedGamesStatus', () => ({
  finishDerivedGames: (...args: unknown[]) => finishDerivedGamesMock(...args),
}));

const persistResultSummariesMock = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/persistResultSummaries', () => ({
  persistResultSummaries: (...args: unknown[]) =>
    persistResultSummariesMock(...args),
}));

const persistScoreDifferentialsMock =
  vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/persistScoreDifferentials', () => ({
  persistScoreDifferentials: (...args: unknown[]) =>
    persistScoreDifferentialsMock(...args),
}));

const notifyAchievementUnlocksMock =
  vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/notifyAchievementUnlocks', () => ({
  notifyAchievementUnlocks: (...args: unknown[]) =>
    notifyAchievementUnlocksMock(...args),
}));

const generateAndPersistRoundReportMock =
  vi.fn<(...a: unknown[]) => Promise<{ status: string; report: string | null }>>();
vi.mock('@/lib/games/generateRoundReport', () => ({
  generateAndPersistRoundReport: (...args: unknown[]) =>
    generateAndPersistRoundReportMock(...args),
}));

const logAdminEventMock = vi.fn<(...a: unknown[]) => Promise<void>>();
vi.mock('@/lib/admin/auditLog', () => ({
  logAdminEvent: (...args: unknown[]) => logAdminEventMock(...args),
}));

const notifyPlayersGameFinishedMock =
  vi.fn<(...a: unknown[]) => Promise<Map<string, boolean>>>();
vi.mock('@/lib/notifications/events', () => ({
  notifyPlayersGameFinished: (...args: unknown[]) =>
    notifyPlayersGameFinishedMock(...args),
}));

// Safety net: unreachable while the fan-out helper above is mocked, but a
// future import-graph change must not let a real notification INSERT escape.
const notifyMock = vi.fn<(...a: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>>(
  async () => ({ shouldAlsoSendMail: true }),
);
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const buildGameFinishedRecipientsMock =
  vi.fn<(...a: unknown[]) => Promise<unknown[]>>();
vi.mock('@/lib/mail/gameFinishedRecipients', () => ({
  buildGameFinishedRecipients: (...args: unknown[]) =>
    buildGameFinishedRecipientsMock(...args),
}));

const sendGameFinishedNotificationMock =
  vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/mail/gameFinishedNotification', () => ({
  sendGameFinishedNotification: (...args: unknown[]) =>
    sendGameFinishedNotificationMock(...args),
}));

/** The service-role client the marker claim runs on. `null` = getAdminClient throws. */
let adminClientMock: ReturnType<typeof buildSupabaseMock> | null;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    if (!adminClientMock) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return adminClientMock;
  },
}));

import {
  runFinishPipeline,
  runFinishPipelineForGame,
  type RunFinishPipelineInput,
} from './runFinishPipeline';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const GAME_ID = 'game-1';
const ENDED_AT = '2026-09-01T17:30:00.000Z';

const GAME = {
  id: GAME_ID,
  name: 'Vinter-cup',
  course_id: 'course-1',
  game_mode: 'best_ball',
  mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
  hole_segment: null,
} as unknown as RunFinishPipelineInput['game'];

const PLAYERS = [{ user_id: 'user-a' }, { user_id: 'user-b' }];
const ACTOR = { id: 'admin-1', name: 'Jørgen' };

function input(
  overrides: Partial<RunFinishPipelineInput> = {},
): RunFinishPipelineInput {
  return {
    game: GAME,
    players: PLAYERS,
    endedAt: ENDED_AT,
    actor: ACTOR,
    ...overrides,
  };
}

/** The claim UPDATE returned a row — this caller owns the run. */
const CLAIM_WON = { data: { id: GAME_ID }, error: null };
/** 0 rows: `finish_pipeline_at` was already set by someone else. */
const CLAIM_LOST = { data: null, error: null };

type Client = ReturnType<typeof buildSupabaseMock>;

function callSeq(client: Client): string[] {
  return client.__fromCalls.map((c) => `${c.table}.${c.method}`);
}

function firstCallOrder(mock: { mock: { invocationCallOrder: number[] } }): number {
  return mock.mock.invocationCallOrder[0];
}

/** Every collaborator that must stay untouched when the claim does not win. */
function expectNothingRan() {
  expect(finishDerivedGamesMock).not.toHaveBeenCalled();
  expect(persistResultSummariesMock).not.toHaveBeenCalled();
  expect(persistScoreDifferentialsMock).not.toHaveBeenCalled();
  expect(notifyAchievementUnlocksMock).not.toHaveBeenCalled();
  expect(generateAndPersistRoundReportMock).not.toHaveBeenCalled();
  expect(logAdminEventMock).not.toHaveBeenCalled();
  expect(notifyPlayersGameFinishedMock).not.toHaveBeenCalled();
  expect(buildGameFinishedRecipientsMock).not.toHaveBeenCalled();
  expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  adminClientMock = buildSupabaseMock([CLAIM_WON]);
  finishDerivedGamesMock.mockReset().mockResolvedValue({ count: 0 });
  persistResultSummariesMock.mockReset().mockResolvedValue(0);
  persistScoreDifferentialsMock.mockReset().mockResolvedValue(0);
  notifyAchievementUnlocksMock.mockReset().mockResolvedValue(0);
  generateAndPersistRoundReportMock
    .mockReset()
    .mockResolvedValue({ status: 'skipped', report: null });
  logAdminEventMock.mockReset().mockResolvedValue(undefined);
  notifyPlayersGameFinishedMock
    .mockReset()
    .mockImplementation(async (players) =>
      new Map(
        (players as Array<{ user_id: string }>).map((p) => [p.user_id, true]),
      ),
    );
  buildGameFinishedRecipientsMock.mockReset().mockResolvedValue([
    { userId: 'user-a', email: 'a@example.com', name: 'Ada Lovelace', locale: 'no' },
    { userId: 'user-b', email: 'b@example.com', name: 'Bjørn', locale: 'no' },
  ]);
  sendGameFinishedNotificationMock.mockReset().mockResolvedValue({ ok: true });
});

// ─── The marker claim ───────────────────────────────────────────────────────

describe('runFinishPipeline — the finish-pipeline claim', () => {
  it('wins the row on the ADMIN client before any tail step runs', async () => {
    const client = buildSupabaseMock([]);

    const result = await runFinishPipeline(client as never, input());

    expect(result).toEqual({ ran: true });
    // Exact shape: win-the-row UPDATE gated on IS NULL, `.select('id')` to see
    // who won, `.maybeSingle()` because 0 rows is an ordinary outcome. Same
    // shape as `maybeNotifyAutoStartBlocked`.
    expect(callSeq(adminClientMock!)).toEqual([
      'games.update',
      'games.eq',
      'games.is',
      'games.select',
      'games.maybeSingle',
    ]);
    expect(adminClientMock!.__fromCalls[0].args[0]).toEqual({
      finish_pipeline_at: expect.any(String),
    });
    expect(adminClientMock!.__fromCalls[1].args).toEqual(['id', GAME_ID]);
    expect(adminClientMock!.__fromCalls[2].args).toEqual([
      'finish_pipeline_at',
      null,
    ]);
    expect(adminClientMock!.__fromCalls[3].args).toEqual(['id']);

    // Claim FIRST, work SECOND — the whole point.
    const claim = firstCallOrder(
      adminClientMock!.from as unknown as { mock: { invocationCallOrder: number[] } },
    );
    expect(claim).toBeLessThan(firstCallOrder(finishDerivedGamesMock));
  });

  it('never claims on the caller-supplied client (guard trigger 0169 would reject it)', async () => {
    // The web finish passes a non-admin CREATOR's client. Claiming on it raises
    // SQLSTATE 42501 and finishing a round starts throwing for every creator.
    const client = buildSupabaseMock([]);

    await runFinishPipeline(client as never, input());

    expect(client.__fromCalls).toEqual([]);
  });

  it('a LOST claim runs nothing at all and reports ran: false', async () => {
    adminClientMock = buildSupabaseMock([CLAIM_LOST]);
    const client = buildSupabaseMock([]);

    const result = await runFinishPipeline(client as never, input());

    expect(result).toEqual({ ran: false });
    expectNothingRan();
  });

  it('a FAILED claim is logged and runs nothing — never optimistically continues', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminClientMock = buildSupabaseMock([
      { data: null, error: { message: 'deadlock detected' } },
    ]);
    const client = buildSupabaseMock([]);

    const result = await runFinishPipeline(client as never, input());

    expect(result).toEqual({ ran: false });
    expectNothingRan();
    expect(consoleErr).toHaveBeenCalledWith(
      '[finishPipeline] finish-pipeline claim failed',
      expect.objectContaining({ message: 'deadlock detected' }),
    );
    consoleErr.mockRestore();
  });

  it('a missing service-role key skips the tail instead of throwing out of the finish', async () => {
    // Every step below the claim opens its own admin client anyway, so a broken
    // environment cannot complete the tail — it must not take the finish (or
    // the cron sweep's other games) down with it either.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminClientMock = null;
    const client = buildSupabaseMock([]);

    const result = await runFinishPipeline(client as never, input());

    expect(result).toEqual({ ran: false });
    expectNothingRan();
    expect(consoleErr).toHaveBeenCalledWith(
      '[finishPipeline] finish-pipeline claim threw',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });
});

// ─── The tail itself ────────────────────────────────────────────────────────

describe('runFinishPipeline — the tail', () => {
  it('runs the nine steps in their documented order', async () => {
    const client = buildSupabaseMock([]);

    await runFinishPipeline(client as never, input());

    const order = [
      finishDerivedGamesMock,
      persistResultSummariesMock,
      persistScoreDifferentialsMock,
      notifyAchievementUnlocksMock,
      generateAndPersistRoundReportMock,
      logAdminEventMock,
      notifyPlayersGameFinishedMock,
      buildGameFinishedRecipientsMock,
      sendGameFinishedNotificationMock,
    ].map(firstCallOrder);

    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('hands the INJECTED client to the two client-taking steps and ids/objects to the rest', async () => {
    const client = buildSupabaseMock([]);

    await runFinishPipeline(client as never, input());

    expect(finishDerivedGamesMock).toHaveBeenCalledWith(client, GAME_ID, ENDED_AT);
    expect(buildGameFinishedRecipientsMock).toHaveBeenCalledWith(client, GAME_ID, {
      course_id: 'course-1',
      game_mode: 'best_ball',
      mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
    });
    expect(persistResultSummariesMock).toHaveBeenCalledWith({
      id: GAME_ID,
      game_mode: 'best_ball',
      mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      course_id: 'course-1',
      hole_segment: null,
    });
    expect(persistScoreDifferentialsMock).toHaveBeenCalledWith(GAME_ID);
    expect(notifyAchievementUnlocksMock).toHaveBeenCalledWith(GAME_ID);
    expect(generateAndPersistRoundReportMock).toHaveBeenCalledWith(GAME_ID);
  });

  it('logs game.finished with the game name, merging auditExtras', async () => {
    const client = buildSupabaseMock([]);

    await runFinishPipeline(
      client as never,
      input({ auditExtras: { sideTournament: true } }),
    );

    expect(logAdminEventMock).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorName: 'Jørgen',
      eventType: 'game.finished',
      targetType: 'game',
      targetId: GAME_ID,
      payload: { gameName: 'Vinter-cup', sideTournament: true },
    });
  });

  it('threads the round report into the mail and only mails the off-app players', async () => {
    generateAndPersistRoundReportMock.mockResolvedValue({
      status: 'ok',
      report: 'Ada tok den på 18.',
    });
    notifyPlayersGameFinishedMock.mockResolvedValue(
      new Map([
        ['user-a', false], // in the app right now — in-app varsel is enough
        ['user-b', true],
      ]),
    );
    const client = buildSupabaseMock([]);

    await runFinishPipeline(client as never, input());

    expect(sendGameFinishedNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendGameFinishedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'b@example.com',
        playerFirstName: 'Bjørn',
        gameName: 'Vinter-cup',
        gameId: GAME_ID,
        roundReport: 'Ada tok den på 18.',
      }),
    );
  });

  it('a rejected mail is logged and still reports ran: true (allSettled lives here)', async () => {
    // `sendGameFinishedNotification` THROWS. The best-effort wrapper is this
    // call site's `Promise.allSettled` — it travelled with the call out of
    // endGameCore, and must never be dropped.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendGameFinishedNotificationMock.mockRejectedValue(new Error('resend down'));
    const client = buildSupabaseMock([]);

    const result = await runFinishPipeline(client as never, input());

    expect(result).toEqual({ ran: true });
    expect(consoleErr).toHaveBeenCalledWith(
      '[finishPipeline] game-finished mail failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('passes the roster through unfiltered, withdrawn players included', async () => {
    const roster = [...PLAYERS, { user_id: 'user-c' }];
    const client = buildSupabaseMock([]);

    await runFinishPipeline(client as never, input({ players: roster }));

    expect(notifyPlayersGameFinishedMock).toHaveBeenCalledWith(
      roster,
      { id: GAME_ID, name: 'Vinter-cup' },
      'finishPipeline',
    );
  });

  it('suppressPerGameNotifications gates exactly the two reveal signals (#1501, cup)', async () => {
    const client = buildSupabaseMock([]);

    const result = await runFinishPipeline(
      client as never,
      input({ suppressPerGameNotifications: true }),
    );

    expect(result).toEqual({ ran: true });
    expect(notifyPlayersGameFinishedMock).not.toHaveBeenCalled();
    expect(buildGameFinishedRecipientsMock).not.toHaveBeenCalled();
    expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
    // Everything else is untouched by the switch.
    expect(finishDerivedGamesMock).toHaveBeenCalledTimes(1);
    expect(persistResultSummariesMock).toHaveBeenCalledTimes(1);
    expect(persistScoreDifferentialsMock).toHaveBeenCalledTimes(1);
    expect(notifyAchievementUnlocksMock).toHaveBeenCalledTimes(1);
    expect(generateAndPersistRoundReportMock).toHaveBeenCalledTimes(1);
    expect(logAdminEventMock).toHaveBeenCalledTimes(1);
  });

  it('logContext defaults to finishPipeline and is overridable for the web callers', async () => {
    const client = buildSupabaseMock([]);

    await runFinishPipeline(client as never, input({ logContext: 'endGame' }));

    expect(notifyPlayersGameFinishedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'endGame',
    );
  });
});

// ─── The sweep's entry point ────────────────────────────────────────────────

describe('runFinishPipelineForGame', () => {
  function gameRow(overrides: Record<string, unknown> = {}) {
    return {
      data: {
        id: GAME_ID,
        name: 'Vinter-cup',
        status: 'finished',
        ended_at: ENDED_AT,
        created_by: 'creator-1',
        course_id: 'course-1',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
        hole_segment: null,
        users: { name: 'Kari Nordmann' },
        ...overrides,
      },
      error: null,
    };
  }

  it('loads game + roster and runs the tail, attributing it to the creator', async () => {
    const client = buildSupabaseMock([
      gameRow(),
      { data: [{ user_id: 'user-a' }, { user_id: 'user-b' }], error: null },
    ]);

    const result = await runFinishPipelineForGame(client as never, GAME_ID);

    expect(result).toEqual({ ran: true });
    expect(finishDerivedGamesMock).toHaveBeenCalledWith(client, GAME_ID, ENDED_AT);
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'creator-1', actorName: 'Kari Nordmann' }),
    );
    expect(notifyPlayersGameFinishedMock).toHaveBeenCalledWith(
      [{ user_id: 'user-a' }, { user_id: 'user-b' }],
      { id: GAME_ID, name: 'Vinter-cup' },
      'finishPipeline',
    );
  });

  it('refuses a game that is no longer finished — a reopened game must not get the tail', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const client = buildSupabaseMock([gameRow({ status: 'active' })]);

    const result = await runFinishPipelineForGame(client as never, GAME_ID);

    expect(result).toEqual({ ran: false });
    expectNothingRan();
    // Not even claimed: the marker stays null, so the next sweep re-evaluates.
    expect(adminClientMock!.__fromCalls).toEqual([]);
    consoleLog.mockRestore();
  });

  it.each([
    ['the row is unreadable', { data: null, error: { message: 'gone' } }],
    ['there is no creator to attribute it to', undefined],
  ])('refuses when %s', async (_label, rowOverride) => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([
      rowOverride ?? gameRow({ created_by: null }),
    ]);

    const result = await runFinishPipelineForGame(client as never, GAME_ID);

    expect(result).toEqual({ ran: false });
    expectNothingRan();
    consoleErr.mockRestore();
  });

  it('falls back to «Arrangør» when the creator has no name', async () => {
    const client = buildSupabaseMock([
      gameRow({ users: { name: '  ' } }),
      { data: [], error: null },
    ]);

    await runFinishPipelineForGame(client as never, GAME_ID);

    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorName: 'Arrangør' }),
    );
  });
});
