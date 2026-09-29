// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2200 del 2): sveipen for ett spill. Den leser rosteret og slagene,
 * spør mottakerregelen (`lib/games/deliveryReminderSweep.ts`, egen suite),
 * stempler kortene med vinn-raden-kravet og sender én påminnelse per mottaker.
 *
 * Det fila bevisst IKKE re-asserterer: hvem som er mottaker og når et kort er
 * ferdig. Her bevises koblingen: hva som leses, at kravet er atomisk, at bare
 * vunne kort teller, og hva varselet og mailen får med seg.
 */

const GAME = {
  id: 'spill-1',
  name: 'Tirsdagsrunden',
  game_mode: 'stableford' as const,
  hole_segment: 'full' as const,
  source_game_id: null,
  tournament_id: null,
  scheduled_tee_off_at: null,
  created_at: null,
};
const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const OLD = '2026-09-29T11:00:00.000Z';

let db: {
  roster: Record<string, unknown>[];
  rosterError: boolean;
  scores: Record<string, unknown>[];
  /** The ids the claim wins. `null` = every id it asks for. */
  claimable: string[] | null;
};

function member(user_id: string, overrides: Record<string, unknown> = {}) {
  return {
    user_id,
    team_number: null,
    flight_number: 1,
    submitted_at: null,
    withdrawn_at: null,
    deliver_reminder_sent_at: null,
    users: { email: `${user_id}@example.test`, name: user_id, locale: 'no', is_guest: false },
    ...overrides,
  };
}

function card(user_id: string, by: string) {
  return Array.from({ length: 18 }, (_, i) => ({
    user_id,
    hole_number: i + 1,
    strokes: 4,
    entered_by: by,
    updated_at: OLD,
  }));
}

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'game_players' && op.kind === 'update') {
    const asked = (op.filters.find((f) => f.op === 'in' && f.column === 'user_id')?.value ??
      []) as string[];
    const won = db.claimable == null ? asked : asked.filter((id) => db.claimable!.includes(id));
    return { data: won.map((user_id) => ({ user_id })) };
  }
  if (op.table === 'game_players') {
    return db.rosterError ? { error: { message: 'connection reset' } } : { data: db.roster };
  }
  if (op.table === 'scores') {
    return { data: op.range?.[0] === 0 ? db.scores : [] };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('./notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: true })),
}));
vi.mock('@/lib/mail/deliverReminderNotification', () => ({
  sendDeliverReminderNotification: vi.fn(),
}));

import { notify } from './notify';
import { sendDeliverReminderNotification } from '@/lib/mail/deliverReminderNotification';
import { runDeliveryReminderSweepForGame } from './deliveryReminder';

const notifyMock = vi.mocked(notify);
const mailMock = vi.mocked(sendDeliverReminderNotification);

const run = () =>
  runDeliveryReminderSweepForGame(
    fake.client as unknown as Parameters<typeof runDeliveryReminderSweepForGame>[0],
    GAME,
    NOW,
  );
const claims = () => fake.ops.filter((op) => op.kind === 'update');

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    roster: [
      member('kari'),
      member('ola'),
      member('gjest', { users: { email: null, name: 'Gjest', locale: 'no', is_guest: true } }),
    ],
    rosterError: false,
    scores: [...card('kari', 'kari'), ...card('ola', 'kari'), ...card('gjest', 'kari')],
    claimable: null,
  };
});

describe('runDeliveryReminderSweepForGame', () => {
  it('føreren av tre kort får én påminnelse, og alle tre kortene stemples i ett krav', async () => {
    await expect(run()).resolves.toEqual({ reminded: 1 });

    expect(notifyMock.mock.calls.map((c) => c[0])).toEqual([
      {
        userId: 'kari',
        kind: 'deliver_reminder',
        payload: { game_id: GAME.id, game_name: GAME.name, others_count: 2 },
      },
    ]);
    const [claim, ...extra] = claims();
    expect(extra).toEqual([]);
    expect(Object.keys(claim.payload ?? {})).toEqual(['deliver_reminder_sent_at']);
    expect(claim.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME.id },
      { op: 'in', column: 'user_id', value: ['kari', 'ola', 'gjest'] },
      { op: 'is', column: 'deliver_reminder_sent_at', value: null },
      { op: 'is', column: 'submitted_at', value: null },
      { op: 'is', column: 'withdrawn_at', value: null },
    ]);
    // Off-app: the mail goes too, with the kept-cards wording.
    expect(mailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'kari@example.test', gameId: GAME.id, forKeptCards: true }),
    );
  });

  it('leser bare slag som er ført, med serverens skrivetid', async () => {
    await run();

    const read = fake.ops.find((op) => op.table === 'scores');
    expect(read?.columns).toBe('user_id, hole_number, strokes, entered_by, updated_at');
    expect(read?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME.id },
        { op: 'not', column: 'strokes', value: null },
      ]),
    );
  });

  it('kjøring nr. 2: en annen kjøring vant kravet, så ingenting sendes', async () => {
    db.claimable = [];

    await expect(run()).resolves.toEqual({ reminded: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('kravet vinner bare noen av kortene: others_count teller bare de vunne', async () => {
    db.claimable = ['kari', 'ola'];

    await run();

    expect(notifyMock.mock.calls[0][0]).toMatchObject({
      payload: { others_count: 1 },
    });
  });

  it('en påminnelse om bare eget kort har ingen others_count, og vanlig mail', async () => {
    db.roster = [member('kari')];
    db.scores = card('kari', 'kari');

    await run();

    expect(notifyMock.mock.calls[0][0]).toEqual({
      userId: 'kari',
      kind: 'deliver_reminder',
      payload: { game_id: GAME.id, game_name: GAME.name },
    });
    expect(mailMock).toHaveBeenCalledWith(expect.objectContaining({ forKeptCards: false }));
  });

  it('ingen kort er ferdige: ingen krav og ingen påminnelse', async () => {
    db.scores = [];

    await expect(run()).resolves.toEqual({ reminded: 0 });
    expect(claims()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('en feilet lesing av rosteret kaster, så ruta logger spillet', async () => {
    db.rosterError = true;

    await expect(run()).rejects.toThrow();
    expect(claims()).toEqual([]);
  });
});
