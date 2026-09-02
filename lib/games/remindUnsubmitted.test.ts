// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#1891): purre-kjernen — hvem den treffer, hva den melder tilbake, og
 * hva den skriver.
 *
 * Fila er den FØRSTE testdekningen purringen har hatt: logikken bodde i
 * server-action-en `remindUnsubmittedPlayers`, som aldri fikk egne tester
 * (kontrakten trodde det fantes en `actions.test.ts` — den gjør ikke det).
 *
 * Det denne fila bevisst IKKE re-asserterer: selve mål-predikatet
 * (`selectDeliveryReminderTargets`) og hull-tellingen per segment
 * (`holeCountForSegment`) har egne Type A-suiter. Her testes at kjernen KOBLER
 * dem riktig — riktig `expectedHoles` inn, riktig søsken-sett inn, riktig
 * utvalg ut — og alt som bare finnes her: `lastRemindedAt`, de to
 * blokkerings-grunnene, og stemplingen.
 */

type PlayerRow = {
  user_id: string;
  submitted_at: string | null;
  withdrawn_at: string | null;
  deliver_reminder_sent_at: string | null;
  users: {
    email: string | null;
    name: string | null;
    locale: string | null;
    is_guest: boolean;
  } | null;
};

type GameRow = {
  id: string;
  name: string;
  status: string;
  hole_segment: 'full' | 'front9' | 'back9';
  tournament_id: string | null;
  scheduled_tee_off_at: string | null;
  created_at: string | null;
};

const GAME_ID = 'spill-1';

/** Databasen kjernen ser. Hver test overstyrer de feltene den bryr seg om. */
let db: {
  game: GameRow | null;
  players: PlayerRow[];
  scores: { user_id: string }[];
  back9Hosts: {
    id: string;
    scheduled_tee_off_at: string | null;
    created_at: string | null;
  }[];
  undeliveredSiblings: { user_id: string }[];
  /** Svaret stemplingen får. Byttes av testen som beviser 0-rader-loggingen. */
  stamp: QueryResponse;
  /** Settes for å bevise at en DB-feil bobler opp som et kast, ikke som `ok`. */
  gameLookupThrows: boolean;
};

function player(
  user_id: string,
  overrides: Partial<Omit<PlayerRow, 'user_id'>> = {},
): PlayerRow {
  return {
    user_id,
    submitted_at: null,
    withdrawn_at: null,
    deliver_reminder_sent_at: null,
    users: {
      email: `${user_id}@example.test`,
      name: user_id,
      locale: 'no',
      is_guest: false,
    },
    ...overrides,
  };
}

/** `count` registrerte hull for spilleren — én rad per hull, som i `scores`. */
function holes(user_id: string, count: number) {
  return Array.from({ length: count }, () => ({ user_id }));
}

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games' && op.single) {
    if (db.gameLookupThrows) throw new Error('connection reset');
    return { data: value('id') === GAME_ID ? db.game : null };
  }
  // Eneste andre games-spørring er #1466-oppslaget etter back9-verter.
  if (op.table === 'games') return { data: db.back9Hosts };
  if (op.table === 'scores') return { data: db.scores };
  if (op.table === 'game_players' && op.kind === 'update') return db.stamp;
  // Søsken-oppslaget filtrerer på `in game_id`; spillerlista på `eq game_id`.
  if (op.filters.some((f) => f.column === 'game_id' && f.op === 'in')) {
    return { data: db.undeliveredSiblings };
  }
  if (op.table === 'game_players') return { data: db.players };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('@/lib/notifications/deliveryReminder', () => ({
  sendDeliveryReminder: vi.fn(),
}));

import { sendDeliveryReminder } from '@/lib/notifications/deliveryReminder';
import { previewReminder, sendReminders } from './remindUnsubmitted';

const reminderMock = vi.mocked(sendDeliveryReminder);

/** Brukerne som faktisk fikk en påminnelse, i rekkefølge. */
function remindedUserIds() {
  return reminderMock.mock.calls.map((c) => c[0].player.userId);
}

/** Update-spørringene kjernen sendte. Tom = ingenting ble skrevet. */
function writes() {
  return fake.ops.filter((op) => op.kind === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    game: {
      id: GAME_ID,
      name: 'Tirsdagsrunden',
      status: 'active',
      hole_segment: 'full',
      tournament_id: null,
      scheduled_tee_off_at: '2026-09-02T08:00:00+00:00',
      created_at: '2026-09-01T18:00:00+00:00',
    },
    players: [
      player('ferdig'),
      player('levert', { submitted_at: '2026-09-02T13:00:00+00:00' }),
      player('midt-i'),
      player('trukket', { withdrawn_at: '2026-09-02T09:00:00+00:00' }),
      player('gjest', {
        users: {
          email: 'gjest@example.test',
          name: 'Gjest',
          locale: 'no',
          is_guest: true,
        },
      }),
    ],
    scores: [
      ...holes('ferdig', 18),
      ...holes('levert', 18),
      ...holes('midt-i', 12),
      ...holes('trukket', 18),
      ...holes('gjest', 18),
    ],
    back9Hosts: [],
    undeliveredSiblings: [],
    stamp: { data: [] },
    gameLookupThrows: false,
  };
});

describe('previewReminder — blokkeringer', () => {
  it('ukjent spill svarer not_found, og leser ingenting mer', async () => {
    db.game = null;

    await expect(previewReminder('finnes-ikke')).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
    // Negativt bevis: spillere og scores hentes aldri for et spill som ikke finnes.
    expect(fake.ops.map((op) => op.table)).toEqual(['games']);
  });

  it.each(['finished', 'setup', 'cancelled'])(
    'status %s svarer not_active, og leser ingenting mer',
    async (status) => {
      db.game = { ...db.game!, status };

      await expect(previewReminder(GAME_ID)).resolves.toEqual({
        ok: false,
        reason: 'not_active',
      });
      expect(fake.ops.map((op) => op.table)).toEqual(['games']);
    },
  );
});

describe('previewReminder — antall', () => {
  it('teller kun de som er ferdige uten å ha levert', async () => {
    // levert / midt-i / trukket / gjest faller alle bort — én igjen.
    await expect(previewReminder(GAME_ID)).resolves.toEqual({
      ok: true,
      targets: 1,
      lastRemindedAt: null,
    });
  });

  it('et front9-spill er «ferdig» ved 9 hull, ikke 18 (#1441)', async () => {
    db.game = { ...db.game!, hole_segment: 'front9' };
    db.scores = [...holes('ferdig', 9), ...holes('midt-i', 4)];

    const result = await previewReminder(GAME_ID);

    expect(result).toMatchObject({ ok: true, targets: 1 });
  });

  it('svarer 0 uten å feile når ingen er ferdige', async () => {
    db.scores = holes('ferdig', 3);

    await expect(previewReminder(GAME_ID)).resolves.toMatchObject({
      ok: true,
      targets: 0,
    });
  });
});

describe('previewReminder — lastRemindedAt', () => {
  it('er null når ingen har fått purring', async () => {
    await expect(previewReminder(GAME_ID)).resolves.toMatchObject({
      lastRemindedAt: null,
    });
  });

  it('er det seneste stemplet — også fra en som siden leverte', async () => {
    // Den som leverte ble purret SIST. «Sist purret» handler om purringen, ikke
    // om hvem som fortsatt mangler, så det stemplet er fasiten.
    db.players = [
      player('ferdig', { deliver_reminder_sent_at: '2026-09-02T10:00:00+00:00' }),
      player('levert', {
        submitted_at: '2026-09-02T13:00:00+00:00',
        deliver_reminder_sent_at: '2026-09-02T12:30:00+00:00',
      }),
      player('midt-i'),
    ];

    await expect(previewReminder(GAME_ID)).resolves.toMatchObject({
      lastRemindedAt: '2026-09-02T12:30:00+00:00',
    });
  });

  it('sammenligner som tidspunkt, ikke som streng', async () => {
    // Postgres klipper etterfølgende nuller i sekundbrøken, så to stempler kan
    // ha ulik lengde. Her er det KORTESTE det seneste.
    db.players = [
      player('a', { deliver_reminder_sent_at: '2026-09-02T09:59:59.987654+00:00' }),
      player('b', { deliver_reminder_sent_at: '2026-09-02T10:00:00.5+00:00' }),
    ];

    await expect(previewReminder(GAME_ID)).resolves.toMatchObject({
      lastRemindedAt: '2026-09-02T10:00:00.5+00:00',
    });
  });
});

describe('sendReminders — blokkeringer', () => {
  it.each([
    ['ukjent spill', null, 'not_found'],
    ['ferdigspilt runde', 'finished', 'not_active'],
  ] as const)('%s: svarer %s uten å sende eller skrive', async (_label, status, reason) => {
    db.game = status === null ? null : { ...db.game!, status };

    await expect(sendReminders(GAME_ID)).resolves.toEqual({ ok: false, reason });
    // Negativt bevis: ingen mail, ingen stempling.
    expect(reminderMock).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
});

describe('sendReminders — sending', () => {
  it('sender kun til målene, med spillets identitet', async () => {
    const result = await sendReminders(GAME_ID);

    expect(result).toEqual({ ok: true, reminded: 1 });
    expect(remindedUserIds()).toEqual(['ferdig']);
    expect(reminderMock.mock.calls[0][0]).toMatchObject({
      player: { userId: 'ferdig', email: 'ferdig@example.test', locale: 'no' },
      game: { id: GAME_ID, name: 'Tirsdagsrunden' },
    });
  });

  it('teller alle målene selv om én påminnelse feiler', async () => {
    db.players = [player('a'), player('b'), player('c')];
    db.scores = [...holes('a', 18), ...holes('b', 18), ...holes('c', 18)];
    reminderMock.mockImplementation(async (opts) => {
      if (opts.player.userId === 'b') throw new Error('SMTP nede');
    });

    // Best-effort: én død adresse skal hverken stoppe de andre eller gjøre
    // hele purringen til en feil.
    await expect(sendReminders(GAME_ID)).resolves.toEqual({
      ok: true,
      reminded: 3,
    });
    expect(remindedUserIds()).toEqual(['a', 'b', 'c']);
  });
});

describe('sendReminders — stempling', () => {
  it('stempler deliver_reminder_sent_at på nøyaktig målene', async () => {
    db.players = [player('a'), player('b'), player('midt-i')];
    db.scores = [...holes('a', 18), ...holes('b', 18), ...holes('midt-i', 9)];
    db.stamp = { data: [{ user_id: 'a' }, { user_id: 'b' }] };

    await sendReminders(GAME_ID);

    const [stamp, ...extra] = writes();
    expect(extra).toEqual([]);
    expect(stamp.table).toBe('game_players');
    expect(Object.keys(stamp.payload ?? {})).toEqual(['deliver_reminder_sent_at']);
    expect(stamp.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'in', column: 'user_id', value: ['a', 'b'] },
    ]);
  });

  it('skriver ingenting når ingen skal purres', async () => {
    db.scores = holes('midt-i', 9);

    await expect(sendReminders(GAME_ID)).resolves.toEqual({
      ok: true,
      reminded: 0,
    });
    expect(reminderMock).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it('logger en stempling som traff færre rader enn mål — men lyver ikke', async () => {
    // AGENTS trap 2: PostgREST svarer error == null på en update som traff 0
    // rader. Vi kaster ikke: mailene er allerede ute, og en feil her ville
    // fått arrangøren til å purre en gang til.
    db.stamp = { data: [] };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendReminders(GAME_ID)).resolves.toEqual({
      ok: true,
      reminded: 1,
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[remindUnsubmittedPlayers] stamped 0/1 deliver_reminder_sent_at rows',
      null,
    );
  });
});

describe('sendReminders — split-dag (#1466)', () => {
  beforeEach(() => {
    db.game = { ...db.game!, hole_segment: 'front9', tournament_id: 'cup-1' };
    db.players = [player('begge-halvdeler'), player('kun-front9')];
    db.scores = [...holes('begge-halvdeler', 9), ...holes('kun-front9', 9)];
  });

  it('purrer ikke en spiller med ulevert back9-søsken samme dag', async () => {
    db.back9Hosts = [
      // Samme Oslo-dag som front9-verten (08:00Z → 10:00 lokal 2. september).
      { id: 'back9-samme-dag', scheduled_tee_off_at: '2026-09-02T12:00:00+00:00', created_at: null },
      // Dag 2 av samme cup — skal ikke konsulteres (#1449).
      { id: 'back9-dagen-etter', scheduled_tee_off_at: '2026-09-03T12:00:00+00:00', created_at: null },
    ];
    db.undeliveredSiblings = [{ user_id: 'begge-halvdeler' }];

    await expect(sendReminders(GAME_ID)).resolves.toEqual({
      ok: true,
      reminded: 1,
    });
    expect(remindedUserIds()).toEqual(['kun-front9']);

    // Søsken-oppslaget så KUN på dagens back9-vert.
    const siblingLookup = fake.ops.find((op) =>
      op.filters.some((f) => f.column === 'game_id' && f.op === 'in'),
    );
    expect(siblingLookup?.filters[0].value).toEqual(['back9-samme-dag']);
  });

  it('spør ikke etter søsken i det hele tatt for et vanlig 18-hulls spill', async () => {
    db.game = { ...db.game!, hole_segment: 'full', tournament_id: 'cup-1' };
    db.scores = [...holes('begge-halvdeler', 18), ...holes('kun-front9', 18)];

    await sendReminders(GAME_ID);

    // Negativt bevis: kun spill-oppslaget, spillere, scores og stemplingen.
    expect(fake.ops.map((op) => `${op.kind} ${op.table}`)).toEqual([
      'select games',
      'select game_players',
      'select scores',
      'update game_players',
    ]);
  });
});

describe('feil fra databasen', () => {
  it('bobler opp som et kast — kalleren avgjør hva brukeren ser', async () => {
    db.gameLookupThrows = true;

    await expect(previewReminder(GAME_ID)).rejects.toThrow('connection reset');
    await expect(sendReminders(GAME_ID)).rejects.toThrow('connection reset');
  });
});
