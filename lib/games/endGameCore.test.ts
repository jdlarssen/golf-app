import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Characterization tests for `endGameCore` — the finish pipeline (#1501).
 *
 * WHY THIS FILE EXISTS (#1856, N6c). Until now the core had no tests of its
 * own: coverage was indirect, through `app/[locale]/admin/games/[id]/
 * actions.test.ts`'s `describe('endGame')`. That suite leaves the four
 * post-flip helpers UNMOCKED — they run for real and are neutralised only by
 * accident (the `server-only` vitest alias, an empty admin-client queue, a
 * missing `ANTHROPIC_API_KEY`). So it cannot see the tail move, and
 * `buildSupabaseMock` is FIFO: reordering any DB call silently hands a canned
 * result to the wrong query.
 *
 * The tail HAS since moved into `runFinishPipeline` (#1856). This file stays
 * an end-to-end lock on the finish as the web drives it — the pipeline module
 * is deliberately NOT mocked here, so «web-avslutning er oppførselsuendret»
 * keeps a test that can actually see it. What this file locks:
 *  - every validation branch and the exact `reason` it returns;
 *  - the write ORDER (side-winners upsert strictly before the status flip);
 *  - which steps run only AFTER the flip, and never when the flip fails;
 *  - which client each step receives (injected vs. its own admin client) —
 *    the plumbing that has to survive the extraction unchanged;
 *  - that `suppressPerGameNotifications` gates exactly the two reveal signals
 *    and nothing else.
 *
 * Every collaborator is mocked EXPLICITLY, including the four post-steps, so
 * that moving them shows up here as a failing assertion instead of hiding.
 *
 * Query sequence (FIFO queue order for `buildSupabaseMock`):
 *   1. games.select(...).eq('id').single()                    — injected client
 *   2. game_players.select(...).eq('game_id').returns()        — injected client
 *   3. game_side_winners.upsert(rows, {onConflict})            — injected client
 *      (only when `sideWinners` is a non-empty array)
 *   4. games.update({status,ended_at}).eq('id').eq('status','active')
 *      .select('id')                                          — injected client
 *   5. games.update({finish_pipeline_at}) … .maybeSingle()     — ADMIN client
 *      (the pipeline's marker claim; separate mock, separate queue)
 * Post-flip steps, in order:
 *   finishDerivedGames(client, …) · persistResultSummaries(gameObject) ·
 *   persistScoreDifferentials(gameId) · notifyAchievementUnlocks(gameId) ·
 *   generateAndPersistRoundReport(gameId) · logAdminEvent(…) ·
 *   [unless suppressed] notifyPlayersGameFinished(…) →
 *   buildGameFinishedRecipients(client, …) → sendGameFinishedNotification(…) ·
 *   revalidateTag + revalidatePath ×2
 * Of those, only `finishDerivedGames` and `buildGameFinishedRecipients` take
 * the injected client; the rest reach for `getAdminClient()` themselves (which
 * is exactly why the app can never run this tail — #1856).
 */

// ─── Post-flip helpers (the tail that N6c extracts) ─────────────────────────

const finishDerivedGamesMock = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/syncDerivedGamesStatus', () => ({
  finishDerivedGames: (...args: unknown[]) => finishDerivedGamesMock(...args),
}));

const persistResultSummariesMock = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/persistResultSummaries', () => ({
  persistResultSummaries: (...args: unknown[]) =>
    persistResultSummariesMock(...args),
}));

const persistScoreDifferentialsMock = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/persistScoreDifferentials', () => ({
  persistScoreDifferentials: (...args: unknown[]) =>
    persistScoreDifferentialsMock(...args),
}));

const notifyAchievementUnlocksMock = vi.fn<(...a: unknown[]) => Promise<unknown>>();
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

// ─── Reveal signals (the two things `suppressPerGameNotifications` gates) ───

const notifyPlayersGameFinishedMock =
  vi.fn<(...a: unknown[]) => Promise<Map<string, boolean>>>();
vi.mock('@/lib/notifications/events', () => ({
  notifyPlayersGameFinished: (...args: unknown[]) =>
    notifyPlayersGameFinishedMock(...args),
}));

// Safety net only: `notify()` is unreachable once the fan-out helper above is
// mocked, but a future import-graph change must not let a real notification
// INSERT escape from a unit test.
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

// `runFinishPipeline` claims `games.finish_pipeline_at` through the SERVICE-ROLE
// client before it runs a single tail step (#1856) — the guard trigger in 0169
// rejects that write from anyone else. Mocked here so the tail assertions below
// still see the tail run; the claim-lost branch is covered in
// `runFinishPipeline.test.ts`, which owns that behaviour.
let adminClientMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminClientMock,
}));

const revalidateTagMock = vi.fn();
const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

import { endGameCore } from './endGameCore';
import type { EndGameSideWinner } from './endGameCore';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const GAME_ID = 'game-1';
const ACTOR = { id: 'admin-1', name: 'Jørgen' };

/** The `games` row shape endGameCore selects, as a queue entry. */
function gameRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: GAME_ID,
      name: 'Vinter-cup',
      status: 'active',
      require_peer_approval: false,
      course_id: 'course-1',
      game_mode: 'best_ball',
      mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      hole_segment: null,
      ...overrides,
    },
    error: null,
  };
}

/** One `game_players` row with its joined user, defaulting to submitted. */
function player(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-a',
    submitted_at: '2026-05-18T10:00:00Z',
    approved_at: null,
    withdrawn_at: null,
    users: { email: 'a@example.com', name: 'Ada Lovelace' },
    ...overrides,
  };
}

const PLAYER_A = player();
const PLAYER_B = player({
  user_id: 'user-b',
  submitted_at: '2026-05-18T10:05:00Z',
  users: { email: 'b@example.com', name: 'Bjørn' },
});

function playersRows(rows: unknown[]) {
  return { data: rows, error: null };
}

/** A resolved write with neither data nor error — how PostgREST reports a
 *  successful UPDATE/UPSERT that the code does not `.select()` back. Still the
 *  right shape for the side-winners upsert, which has no `.select()`. */
const WRITE_OK = { data: null, error: null };

/** The status flip WON its optimistic lock: `.select('id')` returns the row
 *  (#1856). An empty array here means another finisher got there first. */
const FLIP_WON = { data: [{ id: GAME_ID }], error: null };
const FLIP_LOST = { data: [] as unknown[], error: null };

/** The finish-pipeline marker claim, on the admin client. */
const CLAIM_WON = { data: { id: GAME_ID }, error: null };
/** 0 rows from the claim UPDATE: `finish_pipeline_at` was NOT null. */
const CLAIM_LOST = { data: null, error: null };

type Client = ReturnType<typeof buildSupabaseMock>;

/** `table.method` in the exact order the client saw them. */
function callSeq(client: Client): string[] {
  return client.__fromCalls.map((c) => `${c.table}.${c.method}`);
}

/** The invocation-order counter of the LAST `from()` — the status flip in a
 *  finish that reaches it. Everything in the tail must come after this. */
function flipOrder(client: Client): number {
  const orders = (client.from as unknown as { mock: { invocationCallOrder: number[] } })
    .mock.invocationCallOrder;
  return orders[orders.length - 1];
}

function firstCallOrder(mock: { mock: { invocationCallOrder: number[] } }): number {
  return mock.mock.invocationCallOrder[0];
}

/** Every collaborator that must not run when validation or a write fails. */
function expectTailUntouched() {
  expect(finishDerivedGamesMock).not.toHaveBeenCalled();
  expect(persistResultSummariesMock).not.toHaveBeenCalled();
  expect(persistScoreDifferentialsMock).not.toHaveBeenCalled();
  expect(notifyAchievementUnlocksMock).not.toHaveBeenCalled();
  expect(generateAndPersistRoundReportMock).not.toHaveBeenCalled();
  expect(logAdminEventMock).not.toHaveBeenCalled();
  expect(notifyPlayersGameFinishedMock).not.toHaveBeenCalled();
  expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
  expect(revalidateTagMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // The pipeline's marker claim wins by default — these tests are about what
  // endGameCore does once it owns the finish.
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

// ─── Validation gates (endGameCore:153-197) ─────────────────────────────────

describe('endGameCore — validation gates', () => {
  it.each(['draft', 'scheduled', 'finished'] as const)(
    'refuses with not_active when status is %s, and never reads the roster',
    async (status) => {
      const client = buildSupabaseMock([gameRow({ status })]);

      const result = await endGameCore(client as never, GAME_ID, ACTOR);

      expect(result).toEqual({ ok: false, reason: 'not_active' });
      // The roster query is never issued — the gate short-circuits before it.
      expect(callSeq(client)).not.toContain('game_players.select');
      expectTailUntouched();
    },
  );

  it('refuses with not_active when the game row is missing', async () => {
    const client = buildSupabaseMock([{ data: null, error: null }]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: false, reason: 'not_active' });
    expectTailUntouched();
  });

  it.each([
    ['an empty roster', [] as unknown[]],
    ['a failed roster query (data null)', null],
  ])('refuses with no_players on %s', async (_label, rows) => {
    const client = buildSupabaseMock([
      gameRow(),
      { data: rows, error: null },
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: false, reason: 'no_players' });
    expectTailUntouched();
  });

  it('refuses with not_all_submitted when a player has not submitted', async () => {
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, player({ user_id: 'user-b', submitted_at: null })]),
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: false, reason: 'not_all_submitted' });
    // The game is left `active`: no status flip was attempted.
    expect(callSeq(client)).not.toContain('games.update');
    expectTailUntouched();
  });

  it('allowMissing (#375): finishes past a no-show without ever writing game_players', async () => {
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, player({ user_id: 'user-b', submitted_at: null })]),
      FLIP_WON,
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR, {
      allowMissing: true,
    });

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });
    // AC3 (#375): `submitted_at` stays null — the escape never fabricates a
    // levering, so there must be no game_players write of any kind.
    const rosterWrites = client.__fromCalls.filter(
      (c) =>
        c.table === 'game_players' &&
        ['update', 'insert', 'upsert', 'delete'].includes(c.method),
    );
    expect(rosterWrites).toEqual([]);
  });

  it.each([false, true])(
    'peer-approval gate fires with allowMissing=%s — allowMissing NEVER relaxes it',
    async (allowMissing) => {
      const client = buildSupabaseMock([
        gameRow({ require_peer_approval: true }),
        playersRows([
          player({ approved_at: '2026-05-18T10:10:00Z' }),
          // Submitted but unapproved: the strictest gate before the flip.
          PLAYER_B,
        ]),
      ]);

      const result = await endGameCore(client as never, GAME_ID, ACTOR, {
        allowMissing,
      });

      expect(result).toEqual({ ok: false, reason: 'not_all_approved' });
      expect(callSeq(client)).not.toContain('games.update');
      expectTailUntouched();
    },
  );

  it('characterizes the vacuous branch: an UNSUBMITTED player under allowMissing skips the approval gate entirely', async () => {
    // `continue` on the missing-submission branch (endGameCore:192) structurally
    // jumps past the approval check for that player. Harmless today only because
    // `reopenScorecard` clears submitted_at and approved_at together, so an
    // unsubmitted-but-approved row cannot exist. Locked here so the extraction
    // preserves the shape rather than "tidying" it into a behaviour change.
    const client = buildSupabaseMock([
      gameRow({ require_peer_approval: true }),
      playersRows([
        player({ approved_at: '2026-05-18T10:10:00Z' }),
        player({ user_id: 'user-b', submitted_at: null, approved_at: null }),
      ]),
      FLIP_WON,
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR, {
      allowMissing: true,
    });

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });
  });

  it('WD (#386): a withdrawn player never blocks — not on submission, not on approval', async () => {
    // Load-bearing for cup (#1856 drift risk 10): the `continue` on
    // `withdrawn_at` must stay the FIRST thing the loop does.
    const client = buildSupabaseMock([
      gameRow({ require_peer_approval: true }),
      playersRows([
        player({ approved_at: '2026-05-18T10:10:00Z' }),
        player({
          user_id: 'user-b',
          submitted_at: null,
          approved_at: null,
          withdrawn_at: '2026-05-18T09:30:00Z',
        }),
      ]),
      FLIP_WON,
    ]);

    // No allowMissing: the withdrawal alone has to carry it.
    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });
  });
});

// ─── Write order (endGameCore:199-229) ──────────────────────────────────────

const SIDE_WINNERS: EndGameSideWinner[] = [
  { category: 'longest_drive', position: 1, winner_user_id: 'user-a' },
  // «Ingen kvalifiserte» — persisted as an explicit null, never as an omitted row.
  { category: 'closest_to_pin', position: 2, winner_user_id: null },
];

describe('endGameCore — write order', () => {
  it('upserts side winners BEFORE the status flip, with the (game_id, category, position) conflict key', async () => {
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      WRITE_OK, // game_side_winners.upsert
      FLIP_WON, // games.update
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR, {
      sideWinners: SIDE_WINNERS,
    });

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });

    const seq = callSeq(client);
    const winnersIdx = seq.indexOf('game_side_winners.upsert');
    const flipIdx = seq.indexOf('games.update');
    expect(winnersIdx).toBeGreaterThanOrEqual(0);
    expect(flipIdx).toBeGreaterThan(winnersIdx);

    const upsertCall = client.__fromCalls[winnersIdx];
    expect(upsertCall.args).toEqual([
      [
        {
          game_id: GAME_ID,
          category: 'longest_drive',
          position: 1,
          winner_user_id: 'user-a',
        },
        {
          game_id: GAME_ID,
          category: 'closest_to_pin',
          position: 2,
          winner_user_id: null,
        },
      ],
      { onConflict: 'game_id,category,position' },
    ]);
  });

  it.each([
    ['omitted', undefined],
    ['an empty array', [] as EndGameSideWinner[]],
  ])('never touches game_side_winners when sideWinners is %s', async (_label, sideWinners) => {
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      FLIP_WON,
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR, {
      sideWinners,
    });

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });
    expect(callSeq(client).some((s) => s.startsWith('game_side_winners'))).toBe(
      false,
    );
  });

  it('a failed winners upsert returns db_winners and leaves the game active', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      { data: null, error: { message: 'boom' } }, // winners upsert fails
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR, {
      sideWinners: SIDE_WINNERS,
    });

    expect(result).toEqual({ ok: false, reason: 'db_winners' });
    // Ordering is the whole point: the flip must not have happened, so the
    // organiser can simply retry (the upsert is idempotent).
    expect(callSeq(client)).not.toContain('games.update');
    expectTailUntouched();
    expect(consoleErr).toHaveBeenCalledWith(
      '[endGame] winners insert failed',
      expect.objectContaining({ message: 'boom' }),
    );
    consoleErr.mockRestore();
  });

  it('flips status and ended_at under an optimistic lock on status=active', async () => {
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      FLIP_WON,
    ]);

    await endGameCore(client as never, GAME_ID, ACTOR);

    const seq = callSeq(client);
    const flipIdx = seq.indexOf('games.update');
    const patch = client.__fromCalls[flipIdx].args[0] as {
      status: string;
      ended_at: string;
    };
    expect(patch.status).toBe('finished');
    expect(typeof patch.ended_at).toBe('string');
    // #1856: the lock IS the write. `.eq('status','active')` makes a concurrent
    // finish a no-op instead of a second flip, and `.select('id')` is the only
    // way to tell winner from loser — PostgREST reports a 0-row UPDATE as
    // `error: null` (AGENTS.md trap 2). Dropping either half silently restores
    // the double-mail bug, so both are asserted here.
    expect(client.__fromCalls.slice(flipIdx + 1, flipIdx + 4)).toEqual([
      { table: 'games', method: 'eq', args: ['id', GAME_ID] },
      { table: 'games', method: 'eq', args: ['status', 'active'] },
      { table: 'games', method: 'select', args: ['id'] },
    ]);
  });

  it('a LOST optimistic lock is idempotent success: alreadyFinished, no tail, still revalidated', async () => {
    // The race the lock exists for: someone else (another admin tab, or the
    // phone via #1856's app finish) flipped the row between our status read and
    // our UPDATE. The end state is what the caller asked for, so this is `ok`
    // and every caller still redirects to «avsluttet» — but the tail belongs to
    // whoever won it. Before the lock, this path re-stamped `ended_at` and sent
    // a second «Resultatet er klart» to everyone.
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      FLIP_LOST,
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({
      ok: true,
      gameName: 'Vinter-cup',
      alreadyFinished: true,
    });
    expect(finishDerivedGamesMock).not.toHaveBeenCalled();
    expect(persistResultSummariesMock).not.toHaveBeenCalled();
    expect(persistScoreDifferentialsMock).not.toHaveBeenCalled();
    expect(notifyAchievementUnlocksMock).not.toHaveBeenCalled();
    expect(generateAndPersistRoundReportMock).not.toHaveBeenCalled();
    expect(logAdminEventMock).not.toHaveBeenCalled();
    expect(notifyPlayersGameFinishedMock).not.toHaveBeenCalled();
    expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
    // The marker is never even claimed — the tail was not entered.
    expect(adminClientMock.__fromCalls).toEqual([]);
    // Revalidation still runs: this request's caller is about to render the
    // finished game, and a stale `game-${id}` tag would show it as active.
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });

  it('#1856: flip WON but marker claim LOST silently skips the whole tail', async () => {
    // The second, quieter half of the race, and the one that has teeth for
    // reopen: winning the `active → finished` flip does NOT entitle you to the
    // tail. `runFinishPipeline` claims `finish_pipeline_at` separately, and a
    // lost claim means every post-step is skipped — while endGameCore still
    // reports `ok: true, alreadyFinished: false`, i.e. a perfectly ordinary
    // finish to the organiser.
    //
    // This branch is the reason `reopenGame` MUST null the marker: a reopened
    // game that keeps it lands here on its re-finish and loses its result
    // summaries, differentials, achievements, audit row, mail — and its round
    // report, which reopen deleted. Nothing anywhere reports the loss.
    adminClientMock = buildSupabaseMock([CLAIM_LOST]);
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      FLIP_WON,
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({
      ok: true,
      gameName: 'Vinter-cup',
      alreadyFinished: false,
    });
    // The claim was attempted — this is a lost race, not a skipped call.
    expect(adminClientMock.__fromCalls[0]).toEqual({
      table: 'games',
      method: 'update',
      args: [{ finish_pipeline_at: expect.any(String) }],
    });
    expect(finishDerivedGamesMock).not.toHaveBeenCalled();
    expect(persistResultSummariesMock).not.toHaveBeenCalled();
    expect(persistScoreDifferentialsMock).not.toHaveBeenCalled();
    expect(notifyAchievementUnlocksMock).not.toHaveBeenCalled();
    expect(generateAndPersistRoundReportMock).not.toHaveBeenCalled();
    expect(logAdminEventMock).not.toHaveBeenCalled();
    expect(notifyPlayersGameFinishedMock).not.toHaveBeenCalled();
    expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
  });

  it('a failed status flip returns db_finish and runs none of the tail', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      { data: null, error: { message: 'update denied' } },
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: false, reason: 'db_finish' });
    expectTailUntouched();
    expect(consoleErr).toHaveBeenCalledWith(
      '[endGame] finish status update failed',
      expect.objectContaining({ message: 'update denied' }),
    );
    consoleErr.mockRestore();
  });
});

// ─── The tail (endGameCore:231-331) ─────────────────────────────────────────

describe('endGameCore — post-flip tail', () => {
  function happyClient() {
    return buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      FLIP_WON,
    ]);
  }

  it('runs every post-step, and every one of them AFTER the status flip', async () => {
    const client = happyClient();

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });

    const flip = flipOrder(client);
    for (const step of [
      finishDerivedGamesMock,
      persistResultSummariesMock,
      persistScoreDifferentialsMock,
      notifyAchievementUnlocksMock,
      generateAndPersistRoundReportMock,
      logAdminEventMock,
      notifyPlayersGameFinishedMock,
    ]) {
      expect(step).toHaveBeenCalledTimes(1);
      expect(firstCallOrder(step)).toBeGreaterThan(flip);
    }
  });

  it('claims the finish marker on the ADMIN client, after the flip and before the first tail step', async () => {
    // #1856: the marker is WON first, not written last — `notifyAchievementUnlocks`
    // is a bare INSERT with no unique index and `generateAndPersistRoundReport`
    // bills an Anthropic call, so at-most-once beats at-least-once. And it has
    // to go through the service role: `guard_games_finish_pipeline_at` (0169)
    // raises 42501 for the non-admin creator the web finish admits.
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR);

    expect(adminClientMock.__fromCalls.map((c) => `${c.table}.${c.method}`)).toEqual([
      'games.update',
      'games.eq',
      'games.eq',
      'games.is',
      'games.select',
      'games.maybeSingle',
    ]);
    expect(adminClientMock.__fromCalls[0].args[0]).toEqual({
      finish_pipeline_at: expect.any(String),
    });
    // The claim is gated on the status too, not just the null marker: the flip
    // above and this UPDATE are separate transactions, so a reopen in between
    // must make the claim find 0 rows rather than run the tail on a live round.
    expect(adminClientMock.__fromCalls[2].args).toEqual(['status', 'finished']);
    expect(adminClientMock.__fromCalls[3].args).toEqual([
      'finish_pipeline_at',
      null,
    ]);

    const claim = firstCallOrder(
      adminClientMock.from as unknown as { mock: { invocationCallOrder: number[] } },
    );
    expect(claim).toBeGreaterThan(flipOrder(client));
    expect(claim).toBeLessThan(firstCallOrder(finishDerivedGamesMock));
  });

  it('runs the tail in its documented order', async () => {
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR);

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

  it('passes the INJECTED client to the two client-taking steps and ids/objects to the admin-client ones', async () => {
    // This is the plumbing #1856 must preserve: `finishDerivedGames` and
    // `buildGameFinishedRecipients` run under the caller's RLS (creator client
    // for web endGame, service-role for the cup path); the other four reach for
    // `getAdminClient()` themselves — which is precisely why the phone cannot
    // run this tail.
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR);

    expect(finishDerivedGamesMock).toHaveBeenCalledWith(
      client,
      GAME_ID,
      expect.any(String),
    );
    expect(buildGameFinishedRecipientsMock).toHaveBeenCalledWith(
      client,
      GAME_ID,
      {
        course_id: 'course-1',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      },
    );
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

  it('stamps the same ended_at on the flip and on finishDerivedGames', async () => {
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR);

    const flipIdx = callSeq(client).indexOf('games.update');
    const { ended_at } = client.__fromCalls[flipIdx].args[0] as {
      ended_at: string;
    };
    expect(finishDerivedGamesMock).toHaveBeenCalledWith(
      client,
      GAME_ID,
      ended_at,
    );
  });

  it('logs game.finished with the game name, merging auditExtras', async () => {
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR, {
      sideWinners: undefined,
      auditExtras: { sideTournament: true },
    });

    expect(logAdminEventMock).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorName: 'Jørgen',
      eventType: 'game.finished',
      targetType: 'game',
      targetId: GAME_ID,
      payload: { gameName: 'Vinter-cup', sideTournament: true },
    });
  });

  it('threads the generated round report into every finish mail', async () => {
    // Ordering constraint with teeth: the report must be generated BEFORE the
    // mail blast, or the mail ships without it.
    generateAndPersistRoundReportMock.mockResolvedValue({
      status: 'ok',
      report: 'Ada tok den på 18.',
    });
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR);

    expect(sendGameFinishedNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendGameFinishedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        playerFirstName: 'Ada',
        gameName: 'Vinter-cup',
        gameId: GAME_ID,
        roundReport: 'Ada tok den på 18.',
      }),
    );
  });

  it('mails only the players notify flagged as off-app', async () => {
    notifyPlayersGameFinishedMock.mockResolvedValue(
      new Map([
        ['user-a', false], // in the app right now — in-app varsel is enough
        ['user-b', true], // off-app — gets the mail backup
      ]),
    );
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR);

    expect(sendGameFinishedNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendGameFinishedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'b@example.com' }),
    );
  });

  it('sends no mail at all when nobody is flagged off-app', async () => {
    notifyPlayersGameFinishedMock.mockResolvedValue(new Map());
    const client = happyClient();

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });
    expect(buildGameFinishedRecipientsMock).toHaveBeenCalledTimes(1);
    expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
  });

  it('a rejected mail is logged and never fails the finish (allSettled lives here, not in the mailer)', async () => {
    // #1856 drift 5: `sendGameFinishedNotification` THROWS. The best-effort
    // wrapper is this call site's `Promise.allSettled` — it has to travel with
    // the call if the call moves.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendGameFinishedNotificationMock.mockRejectedValue(new Error('resend down'));
    const client = happyClient();

    const result = await endGameCore(client as never, GAME_ID, ACTOR);

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });
    expect(consoleErr).toHaveBeenCalledWith(
      '[endGame] game-finished mail failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('hands notify the FULL roster, withdrawn players included', async () => {
    // endGameCore passes `players` straight through, unfiltered. Any filtering
    // introduced during the extraction would silently change who gets varslet.
    const withdrawn = player({
      user_id: 'user-c',
      submitted_at: null,
      withdrawn_at: '2026-05-18T09:30:00Z',
      users: { email: 'c@example.com', name: 'Cato' },
    });
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B, withdrawn]),
      FLIP_WON,
    ]);

    await endGameCore(client as never, GAME_ID, ACTOR);

    expect(notifyPlayersGameFinishedMock).toHaveBeenCalledWith(
      [PLAYER_A, PLAYER_B, withdrawn],
      { id: GAME_ID, name: 'Vinter-cup' },
      'endGame',
    );
  });

  it('revalidates the game tag and both game paths', async () => {
    const client = happyClient();

    await endGameCore(client as never, GAME_ID, ACTOR);

    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/games/game-1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1');
  });
});

// ─── suppressPerGameNotifications (#1501, the cup switch) ───────────────────

describe('endGameCore — suppressPerGameNotifications', () => {
  it('suppresses BOTH reveal signals while every persistence step still runs', async () => {
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A, PLAYER_B]),
      FLIP_WON,
    ]);

    const result = await endGameCore(client as never, GAME_ID, ACTOR, {
      suppressPerGameNotifications: true,
    });

    expect(result).toEqual({ ok: true, gameName: 'Vinter-cup', alreadyFinished: false });
    // The two reveal signals — in-app game_finished + «Resultatet er klart».
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
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });
});

// ─── logContext (#1488 K3) ──────────────────────────────────────────────────

describe('endGameCore — logContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to "endGame" and reaches both the log prefixes and the notify context', async () => {
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A]),
      FLIP_WON,
    ]);

    await endGameCore(client as never, GAME_ID, ACTOR);

    expect(notifyPlayersGameFinishedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'endGame',
    );
  });

  it('a custom logContext reaches the notify context and the error prefixes', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([
      gameRow(),
      playersRows([PLAYER_A]),
      { data: null, error: { message: 'nope' } }, // winners upsert fails
    ]);

    await endGameCore(client as never, GAME_ID, ACTOR, {
      sideWinners: SIDE_WINNERS,
      logContext: 'endGameWithSideWinners',
    });

    expect(consoleErr).toHaveBeenCalledWith(
      '[endGameWithSideWinners] winners insert failed',
      expect.objectContaining({ message: 'nope' }),
    );
    consoleErr.mockRestore();
  });
});
