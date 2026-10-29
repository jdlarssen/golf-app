// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2480): the send behind «Flytt runden». Who is told has its own
 * suite (`lib/games/gameMovedRecipients.test.ts`); here: one varsel per
 * recipient with the payload the card reads, older unread moves marked read
 * first, mail only to those who are away, and a failure never leaves the
 * function.
 */

const GAME_ID = '11111111-1111-1111-1111-111111111111';
const ORG = 'arrangor';
const TEE_OFF = '2026-10-04T07:00:00.000Z';

type Db = {
  game: Record<string, unknown> | null;
  roster: Record<string, unknown>[];
  rosterError: boolean;
  users: Record<string, unknown>[];
};
let db: Db;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games') return { data: db.game };
  if (op.table === 'game_players') {
    return db.rosterError ? { error: { message: 'connection reset' } } : { data: db.roster };
  }
  if (op.table === 'users') {
    const ids = op.filters.find((f) => f.op === 'in')?.value as string[];
    return { data: db.users.filter((u) => ids.includes(u.id as string)) };
  }
  if (op.table === 'notifications' && op.kind === 'update') return { data: null };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('./notify', () => ({ notify: vi.fn(async () => ({ shouldAlsoSendMail: false })) }));
vi.mock('@/lib/games/createGuestPlayer', () => ({
  findGuestIds: vi.fn(async () => new Set(['gjest'])),
}));
vi.mock('@/lib/users/privateUserFields', () => ({
  getPrivateUserFields: vi.fn(
    async (ids: readonly string[]) =>
      new Map(ids.map((id) => [id, { email: `${id}@example.test`, friendCode: 'x' }])),
  ),
}));
vi.mock('@/lib/mail/gameMovedNotification', () => ({ sendGameMovedNotification: vi.fn() }));

import { notify } from './notify';
import { sendGameMovedNotification } from '@/lib/mail/gameMovedNotification';
import { notifyGameMoved } from './notifyGameMoved';

const notifyMock = vi.mocked(notify);
const mailMock = vi.mocked(sendGameMovedNotification);

const player = (user_id: string, withdrawn_at: string | null = null) => ({ user_id, withdrawn_at });
const user = (id: string, name: string | null, locale: string | null = null) => ({
  id,
  name,
  nickname: null,
  email: `${id}@example.test`,
  locale,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    game: { name: 'Lørdagsrunden', created_by: ORG },
    roster: [player(ORG), player('marte'), player('jonas'), player('gjest'), player('borte', TEE_OFF)],
    rosterError: false,
    users: [user(ORG, 'Jørgen Larssen'), user('marte', 'Marte Kirkerud'), user('jonas', 'Jonas Gahr', 'en')],
  };
});

const send = (extra: Partial<Parameters<typeof notifyGameMoved>[0]> = {}) =>
  notifyGameMoved({ gameId: GAME_ID, actorUserId: ORG, teeOffAt: TEE_OFF, courseChanged: false, ...extra });

describe('notifyGameMoved', () => {
  it('sends one game_moved per active player who is not a guest or the mover, with the card payload', async () => {
    const result = await send();

    expect(notifyMock.mock.calls.map(([c]) => c)).toEqual(
      ['marte', 'jonas'].map((userId) => ({
        userId,
        kind: 'game_moved',
        payload: {
          game_id: GAME_ID,
          game_name: 'Lørdagsrunden',
          tee_off_at: TEE_OFF,
          course_changed: false,
          moved_by_name: 'Jørgen Larssen',
        },
      })),
    );
    expect(result.notified).toEqual([
      { userId: 'marte', shortName: 'Marte' },
      { userId: 'jonas', shortName: 'Jonas' },
    ]);
  });

  it('marks older unread moves of the same game read for the same players, before the new ones', async () => {
    const updatedBeforeSend: boolean[] = [];
    const isUpdate = (op: QueryOp) => op.table === 'notifications' && op.kind === 'update';
    notifyMock.mockImplementation(async () => {
      updatedBeforeSend.push(fake.ops.some(isUpdate));
      return { shouldAlsoSendMail: false };
    });

    await send();

    const update = fake.ops.find(isUpdate);
    expect(update?.filters).toEqual([
      { op: 'eq', column: 'kind', value: 'game_moved' },
      { op: 'eq', column: 'payload->>game_id', value: GAME_ID },
      { op: 'in', column: 'user_id', value: ['marte', 'jonas'] },
      { op: 'is', column: 'read_at', value: null },
    ]);
    expect(Object.keys(update?.payload ?? {})).toEqual(['read_at']);
    expect(updatedBeforeSend).toEqual([true, true]);
  });

  it('mails only the players notify says are away, in their own language', async () => {
    notifyMock.mockImplementation(async ({ userId }) => ({ shouldAlsoSendMail: userId === 'jonas' }));

    await send({ courseChanged: true });

    expect(mailMock.mock.calls.map(([c]) => c)).toEqual([
      {
        to: 'jonas@example.test',
        recipientFirstName: 'Jonas',
        gameName: 'Lørdagsrunden',
        gameId: GAME_ID,
        teeOffAt: TEE_OFF,
        courseChanged: true,
        locale: 'en',
      },
    ]);
  });

  it('one failed varsel never stops the others, and a failed read never throws', async () => {
    notifyMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    expect((await send()).notified).toEqual([{ userId: 'jonas', shortName: 'Jonas' }]);
    expect(notifyMock).toHaveBeenCalledTimes(2);

    db.rosterError = true;
    notifyMock.mockClear();
    await expect(send()).resolves.toEqual({ notified: [] });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
