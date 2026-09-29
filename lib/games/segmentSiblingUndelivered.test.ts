// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import { undeliveredBack9SiblingUserIds } from './segmentSibling';

// Type A (#1466, #2200): the split-cup sibling set the organiser's purring and
// the delivery-reminder sweep share. A failed read must throw (the callers
// catch it and retry), never read as «no undelivered siblings», which would
// remind front9 players who deliver on the back9 game.

const TEE = '2026-09-29T08:00:00.000Z';
const front9 = {
  hole_segment: 'front9' as const,
  tournament_id: 'cup-1',
  scheduled_tee_off_at: TEE,
  created_at: null,
};

let db: { hosts: QueryResponse; undelivered: QueryResponse };

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games') return db.hosts;
  if (op.table === 'game_players') return db.undelivered;
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });
const admin = () => fake.client as unknown as Parameters<typeof undeliveredBack9SiblingUserIds>[0];

function reset() {
  fake.reset();
  db = {
    hosts: { data: [{ id: 'back9-a', scheduled_tee_off_at: TEE, created_at: null }] },
    undelivered: { data: [{ user_id: 'kari' }] },
  };
}

describe('undeliveredBack9SiblingUserIds', () => {
  it('bare for en front9 cup-vert; ellers leses ingenting', async () => {
    reset();
    await expect(
      undeliveredBack9SiblingUserIds(admin(), { ...front9, hole_segment: 'full' }),
    ).resolves.toBeUndefined();
    expect(fake.ops).toEqual([]);
  });

  it('gir dem som ikke har levert back9 samme dag', async () => {
    reset();
    await expect(undeliveredBack9SiblingUserIds(admin(), front9)).resolves.toEqual(new Set(['kari']));
  });

  it('en feilet lesing av back9-vertene kaster', async () => {
    reset();
    db.hosts = { error: { message: 'connection reset' } };
    await expect(undeliveredBack9SiblingUserIds(admin(), front9)).rejects.toThrow('connection reset');
  });

  it('en feilet lesing av uleverte back9-spillere kaster', async () => {
    reset();
    db.undelivered = { error: { message: 'connection reset' } };
    await expect(undeliveredBack9SiblingUserIds(admin(), front9)).rejects.toThrow('connection reset');
  });
});
