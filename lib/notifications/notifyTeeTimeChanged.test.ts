// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2451): the send behind «Starttiden din er endret». Whose time
 * changed is the pure rule's (`teeTimeChanges`, `lib/games/flightTeeTimes.test.ts`);
 * here: the round is read before and after, one varsel per changed player with
 * the payload the card reads, never the one who made the change, never a
 * guest, older unread ones marked read first, nothing for a round that is not
 * scheduled, and a failure never leaves the function.
 */

const GAME_ID = '11111111-1111-1111-1111-111111111111';
const ORG = 'arrangor';
const TEE_OFF = '2026-11-21T08:00:00.000Z';

type Db = {
  game: Record<string, unknown> | null;
  roster: Record<string, unknown>[];
  rosterError: boolean;
};
let db: Db;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games') return { data: db.game };
  if (op.table === 'game_players') {
    return db.rosterError ? { error: { message: 'connection reset' } } : { data: db.roster };
  }
  if (op.table === 'notifications' && op.kind === 'update') return { data: null };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('./notify', () => ({ notify: vi.fn(async () => ({ shouldAlsoSendMail: true })) }));
vi.mock('@/lib/games/createGuestPlayer', () => ({
  findGuestIds: vi.fn(async () => new Set(['gjest'])),
}));

import { notify } from './notify';
import { notifyTeeTimeChanged, readTeeTimeSnapshot } from './notifyTeeTimeChanged';

const notifyMock = vi.mocked(notify);

const p = (user_id: string, flight_number: number | null, withdrawn_at: string | null = null) => ({
  user_id,
  flight_number,
  team_number: null,
  withdrawn_at,
});

/** Nine in three flights of three, the organiser in flight 1. */
function nine() {
  return [
    p(ORG, 1),
    p('a', 1),
    p('b', 1),
    p('c', 2),
    p('d', 2),
    p('gjest', 2),
    p('e', 3),
    p('f', 3),
    p('g', 3),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    game: {
      name: 'Lørdagsrunden',
      status: 'scheduled',
      game_mode: 'solo_strokeplay',
      mode_config: { kind: 'solo_strokeplay', team_size: 1 },
      scheduled_tee_off_at: TEE_OFF,
      tee_interval_minutes: 12,
    },
    roster: nine(),
    rosterError: false,
  };
});

async function change(mutate: () => void) {
  const before = await readTeeTimeSnapshot(GAME_ID);
  mutate();
  return notifyTeeTimeChanged({ gameId: GAME_ID, actorUserId: ORG, before });
}

describe('notifyTeeTimeChanged', () => {
  it('a player moved from flight 3 to flight 2 gets one varsel with 09:12', async () => {
    const result = await change(() => {
      db.roster = db.roster.map((r) => (r.user_id === 'g' ? { ...r, flight_number: 2 } : r));
    });
    expect(notifyMock.mock.calls.map(([c]) => c)).toEqual([
      {
        userId: 'g',
        kind: 'tee_time_changed',
        payload: { game_id: GAME_ID, game_name: 'Lørdagsrunden', tee_off_at: '2026-11-21T08:12:00.000Z' },
      },
    ]);
    expect(result.notified).toEqual(['g']);
  });

  it('a swap inside one flight sends nothing', async () => {
    await change(() => {
      db.roster = db.roster.map((r) => (r.user_id === 'c' ? { ...r, flight_number: 2 } : r));
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('12 → 10 min tells flights 2 and 3, not flight 1, not the guest and not the organiser', async () => {
    await change(() => {
      db.game = { ...db.game!, tee_interval_minutes: 10 };
    });
    expect(notifyMock.mock.calls.map(([c]) => c.userId)).toEqual(['c', 'd', 'e', 'f', 'g']);
  });

  it('never tells the one who made the change, even when their own time moved', async () => {
    await change(() => {
      db.roster = db.roster.map((r) => (r.user_id === ORG ? { ...r, flight_number: 3 } : r));
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('marks older unread changes of the same game read for the same players, before the new ones', async () => {
    const isUpdate = (op: QueryOp) => op.table === 'notifications' && op.kind === 'update';
    const updatedBeforeSend: boolean[] = [];
    notifyMock.mockImplementation(async () => {
      updatedBeforeSend.push(fake.ops.some(isUpdate));
      return { shouldAlsoSendMail: true };
    });
    await change(() => {
      db.game = { ...db.game!, tee_interval_minutes: 8 };
    });
    expect(fake.ops.find(isUpdate)?.filters).toEqual([
      { op: 'eq', column: 'kind', value: 'tee_time_changed' },
      { op: 'eq', column: 'payload->>game_id', value: GAME_ID },
      { op: 'in', column: 'user_id', value: ['c', 'd', 'e', 'f', 'g'] },
      { op: 'is', column: 'read_at', value: null },
    ]);
    expect(updatedBeforeSend.every(Boolean)).toBe(true);
  });

  it('a round that is not scheduled sends nothing', async () => {
    db.game = { ...db.game!, status: 'active' };
    await change(() => {
      db.game = { ...db.game!, tee_interval_minutes: 10 };
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('one failed varsel never stops the others, and a failed read never throws', async () => {
    notifyMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    const result = await change(() => {
      db.game = { ...db.game!, tee_interval_minutes: 10 };
    });
    expect(result.notified).toEqual(['d', 'e', 'f', 'g']);

    notifyMock.mockClear();
    const before = await readTeeTimeSnapshot(GAME_ID);
    db.rosterError = true;
    await expect(
      notifyTeeTimeChanged({ gameId: GAME_ID, actorUserId: ORG, before }),
    ).resolves.toEqual({ notified: [] });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
