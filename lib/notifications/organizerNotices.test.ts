// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2203): the organiser's two finish messages. The rules (who, when,
 * what counts as stale) have their own suite in
 * `lib/games/organizerNoticeRules.test.ts`. Here: what is read, that the claim
 * is atomic and decides, who gets the varsel, when the mail goes, and that a
 * failure never leaves the function.
 */

const GAME_ID = 'spill-1';
const ORG = 'arrangor';
const PER = 'per';
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const LONG_AGO = '2026-10-03T08:00:00.000Z';

type Db = {
  game: Record<string, unknown> | null;
  gameError: boolean;
  roster: Record<string, unknown>[];
  /** Does the claim win its row? */
  claimWins: boolean;
  claimError: boolean;
  organiser: Record<string, unknown> | null;
  lastScore: Record<string, unknown>[];
};
let db: Db;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games' && op.kind === 'update') {
    if (db.claimError) return { error: { message: 'boom' } };
    return { data: db.claimWins ? [{ id: GAME_ID }] : [] };
  }
  if (op.table === 'games') {
    return db.gameError ? { error: { message: 'connection reset' } } : { data: db.game };
  }
  if (op.table === 'game_players') return { data: db.roster };
  if (op.table === 'users') return { data: db.organiser };
  if (op.table === 'scores') return { data: db.lastScore };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('./notify', () => ({ notify: vi.fn(async () => ({ shouldAlsoSendMail: false })) }));
vi.mock('@/lib/users/privateUserFields', () => ({
  getPrivateUserFields: vi.fn(
    async (ids: readonly string[]) =>
      new Map(ids.map((id) => [id, { email: `${id}@example.test`, friendCode: 'x' }])),
  ),
}));
vi.mock('@/lib/mail/organizerGameNotice', () => ({ sendOrganizerGameNotice: vi.fn() }));

import { notify } from './notify';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';
import { sendOrganizerGameNotice } from '@/lib/mail/organizerGameNotice';
import { notifyOrganizerIfAllDelivered, runStaleGameReminderForGame } from './organizerNotices';

const notifyMock = vi.mocked(notify);
const privateMock = vi.mocked(getPrivateUserFields);
const mailMock = vi.mocked(sendOrganizerGameNotice);

const claims = () => fake.ops.filter((op) => op.kind === 'update');
const delivered = (extra: Record<string, unknown> = {}) => ({
  submitted_at: LONG_AGO,
  approved_at: null,
  withdrawn_at: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    game: {
      name: 'Søndagsrunden',
      status: 'active',
      created_by: ORG,
      tournament_id: null,
      source_game_id: null,
      require_peer_approval: false,
    },
    gameError: false,
    roster: [delivered(), delivered()],
    claimWins: true,
    claimError: false,
    organiser: { name: 'Kari Arrangør', locale: 'no' },
    lastScore: [],
  };
});

describe('notifyOrganizerIfAllDelivered', () => {
  it('everyone is in: claims the stamp once and tells the organiser', async () => {
    await notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test');

    expect(claims()).toHaveLength(1);
    const claim = claims()[0]!;
    expect(Object.keys(claim.payload!)).toEqual(['organizer_all_delivered_notified_at']);
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'id', value: GAME_ID },
        { op: 'is', column: 'organizer_all_delivered_notified_at', value: null },
        { op: 'eq', column: 'status', value: 'active' },
      ]),
    );
    expect(notifyMock.mock.calls.map((c) => c[0])).toEqual([
      {
        userId: ORG,
        kind: 'all_scorecards_delivered',
        payload: { game_id: GAME_ID, game_name: 'Søndagsrunden' },
      },
    ]);
  });

  it('the claim wins no row (sent before, or a second caller won): nothing is sent', async () => {
    db.claimWins = false;
    await notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test');
    expect(claims()).toHaveLength(1);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(mailMock).not.toHaveBeenCalled();
  });

  it.each([
    ['one card missing', () => { db.roster = [delivered(), delivered({ submitted_at: null })]; }],
    ['peer approval: a card still waits', () => {
      db.game = { ...db.game, require_peer_approval: true };
      db.roster = [delivered({ approved_at: LONG_AGO }), delivered()];
    }],
    ['everyone withdrew', () => { db.roster = [delivered({ submitted_at: null, withdrawn_at: LONG_AGO })]; }],
    ['the game is finished', () => { db.game = { ...db.game, status: 'finished' }; }],
    ['a cup match', () => { db.game = { ...db.game, tournament_id: 'cup-1' }; }],
    ['a derived game', () => { db.game = { ...db.game, source_game_id: 'kilde' }; }],
    ['no organiser', () => { db.game = { ...db.game, created_by: null }; }],
    ['the game is gone', () => { db.game = null; }],
  ])('not ready (%s): no claim, nothing sent', async (_label, arrange) => {
    arrange();
    await notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test');
    expect(claims()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('the organiser made it ready: the stamp is taken, nothing is sent (O10)', async () => {
    await notifyOrganizerIfAllDelivered(GAME_ID, ORG, 'test');
    expect(claims()).toHaveLength(1);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('off-app organiser: one mail, to the finish page, in their locale', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    db.organiser = { name: 'Kari Arrangør', locale: 'en' };
    await notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test');
    expect(privateMock).toHaveBeenCalledWith([ORG]);
    expect(mailMock.mock.calls.map((c) => c[0])).toEqual([
      {
        to: `${ORG}@example.test`,
        recipientFirstName: 'Kari',
        gameName: 'Søndagsrunden',
        gameId: GAME_ID,
        locale: 'en',
        variant: 'all_delivered',
      },
    ]);
  });

  it('in the app: no mail, and no address is read', async () => {
    await notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test');
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(privateMock).not.toHaveBeenCalled();
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('the organiser’s users row is missing: the varsel still goes', async () => {
    db.organiser = null;
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    await notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test');
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(mailMock.mock.calls[0]?.[0]).toMatchObject({ recipientFirstName: null, locale: null });
  });

  it('never throws: a failed read, a failed claim, a failed notify and a failed mail are logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.gameError = true;
    await expect(notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test')).resolves.toBeUndefined();
    db.gameError = false;
    db.claimError = true;
    await expect(notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test')).resolves.toBeUndefined();
    db.claimError = false;
    notifyMock.mockRejectedValueOnce(new Error('insert failed'));
    await expect(notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test')).resolves.toBeUndefined();
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    mailMock.mockRejectedValueOnce(new Error('resend down'));
    await expect(notifyOrganizerIfAllDelivered(GAME_ID, PER, 'test')).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('runStaleGameReminderForGame', () => {
  const GAME = {
    id: GAME_ID,
    name: 'Søndagsrunden',
    created_by: ORG,
    started_at: '2026-10-03T08:00:00.000Z',
  };
  const run = () =>
    runStaleGameReminderForGame(
      fake.client as unknown as Parameters<typeof runStaleGameReminderForGame>[0],
      GAME,
      NOW,
    );

  it('nothing for a day: claims the stamp and sends one reminder', async () => {
    db.lastScore = [{ updated_at: '2026-10-04T09:00:00.000Z' }];
    db.roster = [delivered({ submitted_at: null }), delivered({ submitted_at: '2026-10-04T10:00:00.000Z' })];
    await expect(run()).resolves.toEqual({ reminded: true });

    const scoreRead = fake.ops.find((op) => op.table === 'scores')!;
    expect(scoreRead.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME_ID },
        { op: 'not', column: 'strokes', value: null },
      ]),
    );
    const claim = claims()[0]!;
    expect(Object.keys(claim.payload!)).toEqual(['organizer_stale_reminder_sent_at']);
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        { op: 'is', column: 'organizer_stale_reminder_sent_at', value: null },
        { op: 'eq', column: 'status', value: 'active' },
      ]),
    );
    expect(notifyMock.mock.calls.map((c) => c[0])).toEqual([
      {
        userId: ORG,
        kind: 'game_stale_reminder',
        payload: { game_id: GAME_ID, game_name: 'Søndagsrunden' },
      },
    ]);
  });

  it.each([
    ['a score in the last day', () => { db.lastScore = [{ updated_at: '2026-10-05T01:00:00.000Z' }]; }],
    ['an approval in the last day', () => { db.roster = [delivered({ approved_at: '2026-10-05T01:00:00.000Z' })]; }],
    ['a withdrawal in the last day', () => { db.roster = [delivered({ withdrawn_at: '2026-10-05T01:00:00.000Z' })]; }],
  ])('%s: still alive, no claim, nothing sent', async (_label, arrange) => {
    arrange();
    await expect(run()).resolves.toEqual({ reminded: false });
    expect(claims()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('the claim wins no row (a second run): nothing is sent', async () => {
    db.claimWins = false;
    await expect(run()).resolves.toEqual({ reminded: false });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('off-app organiser: the stale mail', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    await run();
    expect(mailMock.mock.calls[0]?.[0]).toMatchObject({ variant: 'stale', gameId: GAME_ID });
  });

  it('a failed read throws, so the route can count it per game', async () => {
    const failing = createAdminClientMock({
      respond: (op) => (op.table === 'scores' ? { error: { message: 'timeout' } } : respond(op)),
    });
    await expect(
      runStaleGameReminderForGame(
        failing.client as unknown as Parameters<typeof runStaleGameReminderForGame>[0],
        GAME,
        NOW,
      ),
    ).rejects.toThrow(/timeout/);
  });
});
