// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import { NO_REJECTION_REASON } from './rejectionReason';

/**
 * Type A (#2215): godkjenn-, avvis- og åpne-igjen-regelen, uten transport rundt.
 *
 * Kjernen ble trukket ut av webbens server-actions så app-ruta
 * `app/api/games/[id]/scorecards/[userId]` kan gjøre det samme uten en kopi.
 * Her testes utfallene: 0-rads-oppløsningen (#704/#1395), hvem som varsles, og
 * at cachen tømmes.
 *
 * Det fila bevisst IKKE re-asserterer: hvem som får lov (porten), som bor i
 * `lib/api/appAuth.test.ts` og i webbens `approve/actions.test.ts`.
 *
 * Klienten er et argument, så testen har to opptakere: kallerens klient
 * (webbens RLS-klient / rutas admin-klient) og admin-klienten kjernen selv
 * henter for lagkort-avvisningen (#2213).
 */

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

// #2203: «alle har levert» has its own suite; here only that an approval asks.
const notifyOrganizerIfAllDeliveredMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/notifications/organizerNotices', () => ({
  notifyOrganizerIfAllDelivered: (...args: unknown[]) =>
    notifyOrganizerIfAllDeliveredMock(...args),
}));

const GAME_ID = 'spill-1';
const PLAYER = 'spilleren';
const REVIEWER = 'attestanten';

let db: {
  /** Radene UPDATE-en traff — `.select('user_id')`-svaret. */
  updated: { user_id: string }[];
  /** Settes for å la UPDATE-en feile. */
  updateFails: boolean;
  /** Oppfølgings-lesingen etter 0 rader; `null` = raden er usynlig/borte. */
  existing: Record<string, unknown> | null;
  /** Rosteret lagkort-kaskaden leser. */
  roster: { user_id: string; team_number: number | null; withdrawn_at: string | null }[];
  reviewerName: string | null;
  /** Who delivered the card (#2200), read before a reject. */
  deliverer: string | null;
};

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'game_players' && op.kind === 'update') {
    return db.updateFails
      ? { error: { message: 'connection reset' } }
      : { data: db.updated };
  }
  if (op.table === 'game_players' && op.columns === 'user_id, team_number, withdrawn_at') {
    return { data: db.roster };
  }
  if (op.table === 'game_players' && op.columns === 'submitted_by_user_id') {
    return { data: { submitted_by_user_id: db.deliverer } };
  }
  if (op.table === 'game_players') return { data: db.existing };
  if (op.table === 'games') return { data: { name: 'Sommercup' } };
  if (op.table === 'users') {
    const id = op.filters.find((f) => f.column === 'id')?.value;
    return { data: { name: id === PLAYER ? 'Ola Spiller' : db.reviewerName } };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const caller = createAdminClientMock({ respond: (op) => respond(op) });
const admin = createAdminClientMock({ respond: (op) => respond(op) });
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => admin.client,
}));

import {
  approveScorecardCore,
  rejectScorecardCore,
  reopenScorecardCore,
} from './reviewScorecardCore';

type CoreClient = Parameters<typeof approveScorecardCore>[0]['client'];
const client = () => caller.client as unknown as CoreClient;

/** Hver UPDATE en opptaker sendte. Tom = ingenting ble skrevet. */
const updates = (fake: typeof caller) =>
  fake.ops.filter((op) => op.kind === 'update');

/** Varslene som gikk ut, som `{ userId, kind, payload }`. */
const notified = () => notifyMock.mock.calls.map(([arg]) => arg);

function expectCacheExpired() {
  expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
}

beforeEach(() => {
  vi.clearAllMocks();
  caller.reset();
  admin.reset();
  db = {
    updated: [{ user_id: PLAYER }],
    updateFails: false,
    existing: null,
    roster: [],
    reviewerName: 'Kari',
    deliverer: null,
  };
});

describe('approveScorecardCore', () => {
  const approve = (
    approverRole: 'peer' | 'organizer' = 'peer',
    delivererMayApprove = false,
  ) =>
    approveScorecardCore({
      client: client(),
      gameId: GAME_ID,
      approverUserId: REVIEWER,
      playerUserId: PLAYER,
      approverRole,
      delivererMayApprove,
    });

  it.each(['peer', 'organizer'] as const)(
    '1 rad: varsler scorecard_approved med approver_role %s og tømmer cachen',
    async (role) => {
      await expect(approve(role)).resolves.toEqual({ ok: true, alreadyDone: false });

      expect(notified()).toEqual([
        {
          userId: PLAYER,
          kind: 'scorecard_approved',
          payload: {
            game_id: GAME_ID,
            game_name: 'Sommercup',
            approver_name: 'Kari',
            approver_role: role,
          },
        },
      ]);
      expectCacheExpired();
      expect(revalidatePathMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/games/${GAME_ID}/approve`);
      // #2203: the last approval can make the round ready to finish.
      expect(notifyOrganizerIfAllDeliveredMock.mock.calls).toEqual([
        [GAME_ID, REVIEWER, 'approveScorecard'],
      ]);
    },
  );

  it('skriver bare et levert, ikke godkjent kort, og nuller en gammel avvisning', async () => {
    await approve();

    const [write, ...extra] = updates(caller);
    expect(extra).toEqual([]);
    expect(write.payload).toEqual({
      approved_at: expect.any(String),
      approved_by_user_id: REVIEWER,
      rejection_reason: null,
    });
    expect(write.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'eq', column: 'user_id', value: PLAYER },
      { op: 'not', column: 'submitted_at', value: null },
      { op: 'is', column: 'approved_at', value: null },
      // #2200: den som leverte kortet, godkjenner det ikke. I samme skriving,
      // så porten og skrivingen ikke kan komme i utakt. Ukjent leverandør
      // (kort levert før 0191) er som før.
      {
        op: 'or',
        column: '',
        value: `submitted_by_user_id.is.null,submitted_by_user_id.neq.${REVIEWER}`,
      },
    ]);
    // Godkjenning kaskaderer aldri — admin-klienten rører ingenting.
    expect(admin.ops).toEqual([]);
  });

  it('arrangør og admin er unntatt leverandør-regelen, som i vakta (0191)', async () => {
    await approve('organizer', true);

    const [write] = updates(caller);
    // Fortsatt bare et levert kort, og godkjenneren er den som gjør det.
    expect(write.payload).toMatchObject({ approved_by_user_id: REVIEWER });
    expect(write.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'eq', column: 'user_id', value: PLAYER },
      { op: 'not', column: 'submitted_at', value: null },
      { op: 'is', column: 'approved_at', value: null },
    ]);
  });

  it('0 rader og kortet er alt godkjent: alreadyDone, ingen varsel, cachen tømmes', async () => {
    db.updated = [];
    db.existing = { approved_at: '2026-09-27T10:00:00Z' };

    await expect(approve()).resolves.toEqual({ ok: true, alreadyDone: true });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
    expectCacheExpired();
  });

  it.each([
    { navn: 'kortet er ikke godkjent', existing: { approved_at: null } },
    { navn: 'raden er usynlig eller borte', existing: null },
  ])('0 rader og $navn: not_pending, ingen varsel, ingen tømming', async ({ existing }) => {
    db.updated = [];
    db.existing = existing;

    await expect(approve()).resolves.toEqual({ ok: false, reason: 'not_pending' });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('DB-feil: db, ingen oppfølgings-lesing og ingen varsel', async () => {
    db.updateFails = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(approve()).resolves.toEqual({ ok: false, reason: 'db' });
    expect(caller.ops.map((op) => op.kind)).toEqual(['update']);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('et varsel som kaster, endrer ikke utfallet', async () => {
    notifyMock.mockRejectedValueOnce(new Error('insert failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(approve()).resolves.toEqual({ ok: true, alreadyDone: false });
    expect(errorSpy).toHaveBeenCalledWith(
      '[approveScorecard] scorecard_approved notify failed',
      expect.any(Error),
    );
    expectCacheExpired();
    errorSpy.mockRestore();
  });
});

describe('rejectScorecardCore', () => {
  const reject = (rawReason: string, gameMode = 'stableford') =>
    rejectScorecardCore({
      client: client(),
      gameId: GAME_ID,
      gameMode: gameMode as Parameters<typeof rejectScorecardCore>[0]['gameMode'],
      rejecterUserId: REVIEWER,
      playerUserId: PLAYER,
      rawReason,
    });

  it('trimmer grunnen og kutter den ved 500 tegn, i raden og i varselet', async () => {
    const long = 'x'.repeat(600);

    await expect(reject(`  ${long}  `)).resolves.toEqual({ ok: true, alreadyDone: false });

    const [write] = updates(caller);
    expect(write.payload).toEqual({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
      rejection_reason: 'x'.repeat(500),
    });
    expect(write.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'eq', column: 'user_id', value: PLAYER },
      { op: 'not', column: 'submitted_at', value: null },
    ]);
    expect(notified()).toEqual([
      {
        userId: PLAYER,
        kind: 'scorecard_rejected',
        payload: {
          game_id: GAME_ID,
          game_name: 'Sommercup',
          rejecter_name: 'Kari',
          reason: 'x'.repeat(500),
        },
      },
    ]);
    expectCacheExpired();
  });

  it('kortet levert av en annen (#2200): den som leverte, varsles også, med spillerens navn', async () => {
    // A guest never receives a notice, and a flightmate's card was keyed by
    // the one who delivered it — they are the one who can put it right.
    db.deliverer = 'foereren';

    await expect(reject('Hull 7 er feil')).resolves.toEqual({ ok: true, alreadyDone: false });

    expect(notified()).toEqual([
      {
        userId: PLAYER,
        kind: 'scorecard_rejected',
        payload: {
          game_id: GAME_ID,
          game_name: 'Sommercup',
          rejecter_name: 'Kari',
          reason: 'Hull 7 er feil',
        },
      },
      {
        userId: 'foereren',
        kind: 'scorecard_rejected',
        payload: {
          game_id: GAME_ID,
          game_name: 'Sommercup',
          rejecter_name: 'Kari',
          reason: 'Hull 7 er feil',
          player_name: 'Ola Spiller',
        },
      },
    ]);
  });

  it.each([
    { navn: 'eieren leverte selv', deliverer: PLAYER },
    { navn: 'avviseren leverte kortet (arrangør)', deliverer: REVIEWER },
    { navn: 'ukjent leverandør (før 0191)', deliverer: null },
  ])('$navn: bare eieren varsles', async ({ deliverer }) => {
    db.deliverer = deliverer;

    await reject('Feil');

    expect(notified().map((n) => (n as { userId: string }).userId)).toEqual([PLAYER]);
  });

  it('tom grunn: raden får sentinelen, og varselet utelater reason', async () => {
    await reject('   ');

    expect(updates(caller)[0].payload).toMatchObject({
      rejection_reason: NO_REJECTION_REASON,
    });
    expect(notified()).toEqual([
      {
        userId: PLAYER,
        kind: 'scorecard_rejected',
        payload: { game_id: GAME_ID, game_name: 'Sommercup', rejecter_name: 'Kari' },
      },
    ]);
  });

  it('0 rader og kortet er ikke levert: alreadyDone, ingen varsel, cachen tømmes', async () => {
    db.updated = [];
    db.existing = { submitted_at: null };

    await expect(reject('Feil sum')).resolves.toEqual({ ok: true, alreadyDone: true });
    expect(notifyMock).not.toHaveBeenCalled();
    expectCacheExpired();
  });

  it('0 rader og raden mangler: not_pending, ingen varsel', async () => {
    db.updated = [];
    db.existing = null;

    await expect(reject('Feil sum')).resolves.toEqual({ ok: false, reason: 'not_pending' });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('DB-feil: db og ingen varsel', async () => {
    db.updateFails = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reject('Feil sum')).resolves.toEqual({ ok: false, reason: 'db' });
    expect(notifyMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('#2213 delt lagkort: hele laget åpnes via admin-klienten, alle unntatt avviseren varsles', async () => {
    const CAPTAIN = 'a-kaptein';
    db.roster = [
      { user_id: CAPTAIN, team_number: 1, withdrawn_at: null },
      { user_id: REVIEWER, team_number: 1, withdrawn_at: null },
      { user_id: PLAYER, team_number: 1, withdrawn_at: null },
      { user_id: 'annet-lag', team_number: 2, withdrawn_at: null },
    ];
    db.updated = [{ user_id: CAPTAIN }, { user_id: REVIEWER }, { user_id: PLAYER }];

    await expect(reject('Feil sum', 'texas_scramble')).resolves.toEqual({
      ok: true,
      alreadyDone: false,
    });

    // Kallerens klient skriver ingenting på lag-stien.
    expect(updates(caller)).toEqual([]);
    const [write, ...extra] = updates(admin);
    expect(extra).toEqual([]);
    expect(write.filters).toContainEqual({
      op: 'in',
      column: 'user_id',
      value: [CAPTAIN, REVIEWER, PLAYER],
    });
    expect(notified().map((n) => (n as { userId: string }).userId)).toEqual([
      CAPTAIN,
      PLAYER,
    ]);
  });
});

describe('reopenScorecardCore', () => {
  const reopen = (gameMode = 'stableford') =>
    reopenScorecardCore({
      client: client(),
      gameId: GAME_ID,
      gameMode: gameMode as Parameters<typeof reopenScorecardCore>[0]['gameMode'],
      gameName: 'Sommercup',
      actorName: 'Jørgen',
      playerUserId: PLAYER,
    });

  it('ekte gjenåpning: nuller kortet, varsler spilleren og tømmer cachen', async () => {
    await expect(reopen()).resolves.toEqual({
      ok: true,
      alreadyDone: false,
      reopenedUserIds: [PLAYER],
    });

    const [write, ...extra] = updates(caller);
    expect(extra).toEqual([]);
    expect(write.payload).toEqual({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
      rejection_reason: null,
    });
    expect(write.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'eq', column: 'user_id', value: PLAYER },
      { op: 'not', column: 'submitted_at', value: null },
    ]);
    expect(notified()).toEqual([
      {
        userId: PLAYER,
        kind: 'scorecard_reopened',
        payload: { game_id: GAME_ID, game_name: 'Sommercup', actor_name: 'Jørgen' },
      },
    ]);
    expectCacheExpired();
    expect(revalidatePathMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);
  });

  it('0 rader: alreadyDone, ingen varsel, cachen tømmes', async () => {
    db.updated = [];

    await expect(reopen()).resolves.toEqual({
      ok: true,
      alreadyDone: true,
      reopenedUserIds: [],
    });
    expect(notifyMock).not.toHaveBeenCalled();
    expectCacheExpired();
  });

  it('DB-feil: db, ingen varsel og ingen tømming', async () => {
    db.updateFails = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reopen()).resolves.toEqual({ ok: false, reason: 'db' });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[reopenScorecard] reopen update failed',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('#2213 delt lagkort: hele laget åpnes med kallerens klient, og hver åpnet rad varsles', async () => {
    const CAPTAIN = 'a-kaptein';
    db.roster = [
      { user_id: CAPTAIN, team_number: 1, withdrawn_at: null },
      { user_id: PLAYER, team_number: 1, withdrawn_at: null },
      { user_id: 'annet-lag', team_number: 2, withdrawn_at: null },
    ];
    db.updated = [{ user_id: CAPTAIN }, { user_id: PLAYER }];

    await expect(reopen('texas_scramble')).resolves.toEqual({
      ok: true,
      alreadyDone: false,
      reopenedUserIds: [CAPTAIN, PLAYER],
    });

    // Ingen egen service-role-skriving: kalleren har gatet og eier klienten.
    expect(admin.ops).toEqual([]);
    expect(updates(caller)[0].filters).toContainEqual({
      op: 'in',
      column: 'user_id',
      value: [CAPTAIN, PLAYER],
    });
    expect(notified().map((n) => (n as { userId: string }).userId)).toEqual([
      CAPTAIN,
      PLAYER,
    ]);
  });
});
