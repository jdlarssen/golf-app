// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2268, the owner's choice B): the hole reminder's core. What it
 * reads, when it refuses (game gone or not active, row gone, guests only),
 * whom it sends to, and how it counts the stored rows back: only rows that
 * were not there before this send, so an earlier press never makes a failed
 * one look sent.
 *
 * What this file deliberately does NOT re-assert: which holes a row has and
 * who is in it (`findScoreGaps` / `missingScoreTargets`, organizerDesk.test.ts)
 * and what the sender writes (missingScoreReminder.test.ts).
 */

type PlayerRow = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  submitted_at: string | null;
  withdrawn_at: string | null;
  users: { email: string | null; name: string | null; locale: string | null; is_guest: boolean } | null;
};

const GAME_ID = 'spill-1';

let db: {
  game: Record<string, unknown> | null;
  players: PlayerRow[];
  scores: { user_id: string; hole_number: number }[];
  /** The two notifications reads: the snapshot before the send, the count after. */
  before: QueryResponse;
  after: QueryResponse;
};
let notificationReads = 0;

function player(user_id: string, overrides: Partial<Omit<PlayerRow, 'user_id'>> = {}): PlayerRow {
  return {
    user_id,
    team_number: null,
    flight_number: 1,
    submitted_at: null,
    withdrawn_at: null,
    users: { email: `${user_id}@example.test`, name: user_id, locale: 'no', is_guest: false },
    ...overrides,
  };
}

const holes = (user_id: string, ...nums: number[]) => nums.map((hole_number) => ({ user_id, hole_number }));

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games' && op.single) {
    const id = op.filters.find((f) => f.column === 'id')?.value;
    return { data: id === GAME_ID ? db.game : null };
  }
  if (op.table === 'game_players' && op.kind === 'select') return { data: db.players };
  if (op.table === 'scores') {
    const [from, to] = op.range ?? [0, db.scores.length];
    return { data: db.scores.slice(from, to + 1) };
  }
  if (op.table === 'notifications' && op.kind === 'select') {
    notificationReads += 1;
    return notificationReads === 1 ? db.before : db.after;
  }
  throw new Error(`unexpected query: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('@/lib/notifications/missingScoreReminder', () => ({
  sendMissingScoreReminder: vi.fn(async () => {}),
}));

import { sendMissingScoreReminder } from '@/lib/notifications/missingScoreReminder';
import { sendMissingScoreReminders } from './remindMissingScore';

const senderMock = vi.mocked(sendMissingScoreReminder);
const sentTo = () => senderMock.mock.calls.map((c) => c[0].player.userId);
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  notificationReads = 0;
  db = {
    game: {
      id: GAME_ID,
      name: 'Lørdagsrunden',
      status: 'active',
      game_mode: 'stableford',
      hole_segment: 'full',
      start_type: 'first_tee',
    },
    // Tore skipped hole 10; Ola is up to date.
    players: [player('tore'), player('ola')],
    scores: [...holes('tore', 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12), ...holes('ola', 1, 2, 3, 4)],
    before: { data: [] },
    after: { data: [{ id: 'n1', user_id: 'tore' }] },
  };
});

describe('sendMissingScoreReminders', () => {
  it.each([
    ['the game is gone', () => { db.game = null; }, 'not_found'],
    ['the game is not active', () => { db.game = { ...db.game!, status: 'finished' }; }, 'not_active'],
    ['the row is gone (the hole got a score)', () => { db.scores.push(...holes('tore', 10)); }, 'no_gap'],
    [
      'the row has guests only',
      () => { db.players[0] = player('tore', { users: { email: null, name: 'Tore', locale: 'no', is_guest: true } }); },
      'only_guests',
    ],
  ] as const)('%s → %s, and nothing is sent or read back', async (_label, arrange, reason) => {
    arrange();
    expect(await sendMissingScoreReminders(GAME_ID, ['tore'])).toEqual({ ok: false, reason });
    expect(senderMock).not.toHaveBeenCalled();
    expect(notificationReads).toBe(0);
  });

  it('sends to the pressed row with its holes, and counts only rows this send stored', async () => {
    // An earlier press left a row for Tore; it must not count for this one.
    db.before = { data: [{ id: 'old', user_id: 'tore' }] };
    db.after = { data: [{ id: 'old', user_id: 'tore' }, { id: 'n1', user_id: 'tore' }] };

    expect(await sendMissingScoreReminders(GAME_ID, ['tore'])).toEqual({ ok: true, reminded: 1 });
    expect(sentTo()).toEqual(['tore']);
    expect(senderMock.mock.calls[0][0]).toMatchObject({
      game: { id: GAME_ID, name: 'Lørdagsrunden' },
      holes: [10],
      player: { email: 'tore@example.test', locale: 'no' },
    });
  });

  it('a shared card reminds both teammates with one press', async () => {
    db.game = { ...db.game!, game_mode: 'texas_scramble' };
    db.players = [player('kari', { team_number: 1 }), player('per', { team_number: 1 })];
    db.scores = holes('kari', 1, 2, 4); // the captain (lex-min) owns the team's rows
    db.after = { data: [{ id: 'n1', user_id: 'kari' }, { id: 'n2', user_id: 'per' }] };

    expect(await sendMissingScoreReminders(GAME_ID, ['kari', 'per'])).toEqual({ ok: true, reminded: 2 });
    expect(sentTo()).toEqual(['kari', 'per']);
  });

  it.each<[string, QueryResponse]>([
    ['no new row (the earlier press is the only one)', { data: [{ id: 'old', user_id: 'tore' }] }],
    ['the count itself fails', { data: null, error: { message: 'timeout' } }],
  ])('%s → reminded 0, logged', async (_label, after) => {
    db.before = { data: [{ id: 'old', user_id: 'tore' }] };
    db.after = after;

    expect(await sendMissingScoreReminders(GAME_ID, ['tore'])).toEqual({ ok: true, reminded: 0 });
    expect(errorSpy).toHaveBeenCalledWith(
      '[remindMissingScore] stored 0/1 missing_score_reminder rows',
      after.error ?? null,
    );
  });

  it('a partial store is counted and logged', async () => {
    db.game = { ...db.game!, game_mode: 'texas_scramble' };
    db.players = [player('kari', { team_number: 1 }), player('per', { team_number: 1 })];
    db.scores = holes('kari', 1, 2, 4);
    db.after = { data: [{ id: 'n1', user_id: 'kari' }] };

    expect(await sendMissingScoreReminders(GAME_ID, ['kari', 'per'])).toEqual({ ok: true, reminded: 1 });
    expect(errorSpy).toHaveBeenCalledWith('[remindMissingScore] stored 1/2 missing_score_reminder rows', null);
  });

  it('never writes anything itself (the sweep guard deliver_reminder_sent_at stays untouched)', async () => {
    await sendMissingScoreReminders(GAME_ID, ['tore']);
    expect(fake.ops.filter((op) => op.kind !== 'select')).toEqual([]);
  });
});
