// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2638 Del 3): one round's messages. When a message is due and who
 * has played have their own suite (`lib/league/roundNotices.test.ts`). Here:
 * what is read, that the claim decides and runs once per message, who gets
 * the varsel with which payload, and that a failure is thrown or logged as it
 * should be.
 */

const ROUND_ID = 'runde-3';
const LEAGUE_ID = 'liga-1';
const NOW = Date.parse('2026-11-05T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const DEVICE_TABLES = ['push_subscriptions', 'apns_tokens', 'fcm_tokens'] as const;
type DeviceTable = (typeof DEVICE_TABLES)[number];

type Db = {
  players: string[];
  flights: Array<{ status: string; game_players: Array<{ user_id: string; withdrawn_at: string | null }> }>;
  readError: 'players' | 'flights' | null;
  /** Which stamps the claim wins. */
  wins: Set<string>;
  claimError: boolean;
  /** #2974: who has a device to push to, per table. */
  devices: Record<DeviceTable, string[]>;
  deviceReadError: DeviceTable | null;
  users: Array<{ id: string; email: string | null; name: string | null; locale: string | null }>;
  usersReadError: boolean;
};
let db: Db;

const asked = (op: QueryOp, column: string) =>
  (op.filters.find((f) => f.op === 'in' && f.column === column)?.value ?? []) as string[];

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'league_rounds' && op.kind === 'update') {
    if (db.claimError) return { error: { message: 'boom' } };
    const stamp = Object.keys(op.payload ?? {})[0]!;
    return { data: db.wins.has(stamp) ? [{ id: ROUND_ID }] : [] };
  }
  if (op.table === 'league_players') {
    return db.readError === 'players'
      ? { error: { message: 'connection reset' } }
      : { data: db.players.map((user_id) => ({ user_id })) };
  }
  if (op.table === 'games') {
    return db.readError === 'flights' ? { error: { message: 'connection reset' } } : { data: db.flights };
  }
  if ((DEVICE_TABLES as readonly string[]).includes(op.table)) {
    if (db.deviceReadError === op.table) return { error: { message: 'connection reset' } };
    const ids = asked(op, 'user_id');
    return { data: db.devices[op.table as DeviceTable].filter((id) => ids.includes(id)).map((user_id) => ({ user_id })) };
  }
  if (op.table === 'users') {
    if (db.usersReadError) return { error: { message: 'connection reset' } };
    const ids = asked(op, 'id');
    return { data: db.users.filter((u) => ids.includes(u.id)) };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('./notify', () => ({ notify: vi.fn(async () => ({ shouldAlsoSendMail: false })) }));
vi.mock('@/lib/mail/leagueRoundNotification', () => ({
  sendLeagueRoundNotification: vi.fn(async () => {}),
}));
// #2979: the round before. No summary unless a test says so.
vi.mock('@/lib/league/getLigaSnapshot', () => ({ getLigaSnapshot: vi.fn(async () => null) }));
vi.mock('@/lib/league/roundSummary', () => ({ buildRoundSummary: vi.fn(() => null) }));
vi.mock('@/lib/league/roundNews', () => ({ generateRoundNews: vi.fn(async () => null) }));

import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { generateRoundNews } from '@/lib/league/roundNews';
import { buildRoundSummary, type RoundSummary } from '@/lib/league/roundSummary';
import { sendLeagueRoundNotification } from '@/lib/mail/leagueRoundNotification';
import { notify } from './notify';
import { runLeagueRoundNotices, type LeagueRoundSweepRound } from './leagueRoundNotices';

const notifyMock = vi.mocked(notify);
const mailMock = vi.mocked(sendLeagueRoundNotification);
const snapshotMock = vi.mocked(getLigaSnapshot);
const summaryMock = vi.mocked(buildRoundSummary);
const newsMock = vi.mocked(generateRoundNews);
const claims = () => fake.ops.filter((op) => op.kind === 'update');
const deviceReads = () => fake.ops.filter((op) => (DEVICE_TABLES as readonly string[]).includes(op.table));

const NONE = { league_round_open: 0, league_round_closing: 0 };
/** What a run answers: the varsler that landed, and the mails that went (#2974). */
const result = (sent: typeof NONE, mailed: Partial<typeof NONE> = {}) => ({ sent, mailed: { ...NONE, ...mailed } });

function round(over: Partial<LeagueRoundSweepRound> = {}): LeagueRoundSweepRound {
  return {
    id: ROUND_ID,
    league_id: LEAGUE_ID,
    label: 'Runde 3',
    opens_at: new Date(NOW - 2 * HOUR).toISOString(),
    closes_at: new Date(NOW + 10 * 24 * HOUR).toISOString(),
    opening_notice_sent_at: null,
    closing_reminder_sent_at: null,
    leagues: { name: 'Vinterligaen', is_simulator: false },
    courses: { name: 'St Andrews' },
    tee_boxes: { name: 'Gul' },
    ...over,
  };
}
const run = (r: LeagueRoundSweepRound) =>
  runLeagueRoundNotices(fake.client as unknown as Parameters<typeof runLeagueRoundNotices>[0], r, NOW);

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    players: ['kari', 'per', 'ola', 'lise'],
    flights: [
      { status: 'finished', game_players: [{ user_id: 'per', withdrawn_at: null }] },
      { status: 'active', game_players: [{ user_id: 'ola', withdrawn_at: null }] },
      { status: 'active', game_players: [{ user_id: 'lise', withdrawn_at: '2026-11-05T09:00:00Z' }] },
    ],
    readError: null,
    wins: new Set(['opening_notice_sent_at', 'closing_reminder_sent_at']),
    claimError: false,
    devices: { push_subscriptions: [], apns_tokens: [], fcm_tokens: [] },
    deviceReadError: null,
    users: [
      { id: 'kari', email: 'kari@example.test', name: 'Kari Nordmann', locale: null },
      { id: 'lise', email: 'lise@example.test', name: 'Lise Li', locale: 'en' },
    ],
    usersReadError: false,
  };
});

describe('runLeagueRoundNotices', () => {
  it('a round that just opened: claims the opening stamp and tells everyone who has not played', async () => {
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 2, league_round_closing: 0 }));

    expect(fake.ops.find((op) => op.table === 'league_players')!.filters).toEqual([
      { op: 'eq', column: 'league_id', value: LEAGUE_ID },
    ]);
    expect(fake.ops.find((op) => op.table === 'games')!.filters).toEqual([
      { op: 'eq', column: 'league_round_id', value: ROUND_ID },
    ]);
    const [claim] = claims();
    expect(claims()).toHaveLength(1);
    expect(claim!.table).toBe('league_rounds');
    expect(claim!.payload).toEqual({ opening_notice_sent_at: new Date(NOW).toISOString() });
    expect(claim!.filters).toEqual([
      { op: 'eq', column: 'id', value: ROUND_ID },
      { op: 'is', column: 'opening_notice_sent_at', value: null },
    ]);
    // Per delivered and Ola is playing; Lise withdrew from her flight, so she is told.
    expect(notifyMock.mock.calls.map((c) => c[0])).toEqual(
      ['kari', 'lise'].map((userId) => ({
        userId,
        kind: 'league_round_open',
        payload: {
          league_id: LEAGUE_ID,
          league_name: 'Vinterligaen',
          round_id: ROUND_ID,
          round_label: 'Runde 3',
          closes_at: round().closes_at,
        },
      })),
    );
  });

  it('#2666: a simulator league names the course and tee in the payload; a regular league does not', async () => {
    await run(round({ leagues: { name: 'Vinterligaen', is_simulator: true } }));
    expect(notifyMock.mock.calls[0]![0].payload).toEqual({
      league_id: LEAGUE_ID,
      league_name: 'Vinterligaen',
      round_id: ROUND_ID,
      round_label: 'Runde 3',
      closes_at: round().closes_at,
      is_simulator: true,
      course_name: 'St Andrews',
      tee_name: 'Gul',
    });

    notifyMock.mockClear();
    fake.reset();
    await run(round());
    expect(Object.keys(notifyMock.mock.calls[0]![0].payload).sort()).toEqual(
      ['closes_at', 'league_id', 'league_name', 'round_id', 'round_label'],
    );
  });

  it('#2666: a simulator round without a course name still flags the league, with no course or tee fields', async () => {
    await run(round({ leagues: { name: 'Vinterligaen', is_simulator: true }, courses: null, tee_boxes: { name: null } }));
    const payload = notifyMock.mock.calls[0]![0].payload as Record<string, unknown>;
    expect(payload.is_simulator).toBe(true);
    expect('course_name' in payload || 'tee_name' in payload).toBe(false);
  });

  it('under 48 hours left: the reminder, claimed against the deadline it names', async () => {
    const r = round({ opening_notice_sent_at: '2026-10-24T00:10:00Z', closes_at: new Date(NOW + 20 * HOUR).toISOString() });
    await expect(run(r)).resolves.toEqual(result({ league_round_open: 0, league_round_closing: 2 }));

    expect(claims()).toHaveLength(1);
    expect(claims()[0]!.filters).toEqual([
      { op: 'eq', column: 'id', value: ROUND_ID },
      { op: 'is', column: 'closing_reminder_sent_at', value: null },
      { op: 'eq', column: 'closes_at', value: r.closes_at },
    ]);
    expect(notifyMock.mock.calls.map((c) => [c[0].userId, c[0].kind])).toEqual([
      ['kari', 'league_round_closing'],
      ['lise', 'league_round_closing'],
    ]);
  });

  it('a short round: both messages in one run, each claimed on its own, the opening first', async () => {
    await run(round({ closes_at: new Date(NOW + 20 * HOUR).toISOString() }));
    expect(claims().map((c) => Object.keys(c.payload!)[0])).toEqual([
      'opening_notice_sent_at',
      'closing_reminder_sent_at',
    ]);
    expect(notifyMock.mock.calls.map((c) => c[0].kind)).toEqual([
      'league_round_open',
      'league_round_open',
      'league_round_closing',
      'league_round_closing',
    ]);
  });

  it('a claim that wins no row (a second run) sends nothing for that message, and the other still goes', async () => {
    db.wins = new Set(['closing_reminder_sent_at']);
    await expect(run(round({ closes_at: new Date(NOW + 20 * HOUR).toISOString() }))).resolves.toEqual(result({ league_round_open: 0, league_round_closing: 2 }));
    expect(notifyMock.mock.calls.map((c) => c[0].kind)).toEqual(['league_round_closing', 'league_round_closing']);
  });

  it('no varsel landed: the stamp is released, so the next run tries again', async () => {
    notifyMock.mockImplementation(async () => ({ shouldAlsoSendMail: false, inserted: false }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 0, league_round_closing: 0 }));
    err.mockRestore();
    notifyMock.mockImplementation(async () => ({ shouldAlsoSendMail: false }));
    const [, release, ...extra] = claims();
    expect(extra).toEqual([]);
    expect(release!.payload).toEqual({ opening_notice_sent_at: null });
    expect(release!.filters).toEqual([
      { op: 'eq', column: 'id', value: ROUND_ID },
      { op: 'eq', column: 'opening_notice_sent_at', value: new Date(NOW).toISOString() },
    ]);
  });

  it('some varsler landed: the stamp stands, so nobody is told twice', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: false, inserted: false });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 1, league_round_closing: 0 }));
    err.mockRestore();
    expect(claims()).toHaveLength(1);
  });

  it('everyone has played: the stamp is still claimed, so the round does not come back, and nobody is told', async () => {
    db.players = ['per', 'ola'];
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 0, league_round_closing: 0 }));
    expect(claims()).toHaveLength(1);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('nothing due: no reads, no claim', async () => {
    await expect(run(round({ opening_notice_sent_at: '2026-10-24T00:10:00Z' }))).resolves.toEqual(result({ league_round_open: 0, league_round_closing: 0 }));
    expect(fake.ops).toEqual([]);
  });

  it.each(['players', 'flights'] as const)('a failed %s read throws before anything is claimed', async (which) => {
    db.readError = which;
    await expect(run(round())).rejects.toThrow(`leagueRoundReminder ${which}: connection reset`);
    expect(claims()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a claim the database refuses throws, and nothing is sent', async () => {
    db.claimError = true;
    await expect(run(round())).rejects.toThrow('leagueRoundReminder claim league_round_open: boom');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a round without its league throws before the claim (the payload needs the name)', async () => {
    await expect(run(round({ leagues: null }))).rejects.toThrow('came without its league');
    expect(claims()).toEqual([]);
  });

  it('one notify that throws is logged; the others still go and are counted', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValueOnce(new Error('invalid payload'));
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 1, league_round_closing: 0 }));
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledWith('[leagueRoundReminder] league_round_open to kari failed', expect.anything());
    err.mockRestore();
  });
});

/**
 * #2974: the varsel is in the inbox and goes as a push. A player with no
 * device to push to hears nothing outside Tørny, so that player gets the
 * message as mail as well. `notify` says who is away (`shouldAlsoSendMail`:
 * not in Tørny right now, not a guest, not a deleted account).
 */
describe('runLeagueRoundNotices: mail to the players without a device', () => {
  const away = () => notifyMock.mockImplementation(async () => ({ shouldAlsoSendMail: true, inserted: true }));
  const mailedTo = () => mailMock.mock.calls.map((c) => c[0].to);

  beforeEach(() => {
    notifyMock.mockImplementation(async () => ({ shouldAlsoSendMail: false }));
  });

  it('away and without a device: one mail each, with the varsel payload and the player’s own language', async () => {
    away();
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 2 }),
    );

    // One read per table for both players, then the two who get the mail.
    expect(deviceReads().map((op) => [op.table, op.columns, op.filters])).toEqual(
      DEVICE_TABLES.map((table) => [table, 'user_id', [{ op: 'in', column: 'user_id', value: ['kari', 'lise'] }]]),
    );
    const usersRead = fake.ops.find((op) => op.table === 'users')!;
    expect([usersRead.columns, usersRead.filters]).toEqual([
      'id, email, name, locale',
      [{ op: 'in', column: 'id', value: ['kari', 'lise'] }],
    ]);
    const payload = notifyMock.mock.calls[0]![0].payload;
    expect(mailMock.mock.calls.map((c) => c[0])).toEqual([
      { to: 'kari@example.test', playerFirstName: 'Kari', kind: 'league_round_open', payload, locale: null },
      { to: 'lise@example.test', playerFirstName: 'Lise', kind: 'league_round_open', payload, locale: 'en' },
    ]);
  });

  it.each(DEVICE_TABLES)('a device in %s is enough: that player gets the push, not the mail', async (table) => {
    away();
    db.devices[table] = ['kari'];
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 1 }),
    );
    expect(mailedTo()).toEqual(['lise@example.test']);
    expect(fake.ops.find((op) => op.table === 'users')!.filters).toEqual([{ op: 'in', column: 'id', value: ['lise'] }]);
  });

  it('a player in Tørny right now sees the varsel: no mail, and nobody away means no device read', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true, inserted: true });
    await run(round());
    expect(mailedTo()).toEqual(['kari@example.test']);
    expect(deviceReads()[0]!.filters).toEqual([{ op: 'in', column: 'user_id', value: ['kari'] }]);

    mailMock.mockClear();
    fake.reset();
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 2, league_round_closing: 0 }));
    expect(deviceReads()).toEqual([]);
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('everyone away has a device: no read of users, no mail', async () => {
    away();
    db.devices.apns_tokens = ['kari'];
    db.devices.push_subscriptions = ['lise'];
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 2, league_round_closing: 0 }));
    expect(fake.ops.some((op) => op.table === 'users')).toBe(false);
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('a player without an address gets no mail', async () => {
    away();
    db.users[0]!.email = null;
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 1 }),
    );
    expect(mailedTo()).toEqual(['lise@example.test']);
  });

  it('a varsel that did not land gives no mail to that player', async () => {
    away();
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: false, inserted: false });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 1, league_round_closing: 0 }, { league_round_open: 1 }),
    );
    err.mockRestore();
    expect(mailedTo()).toEqual(['lise@example.test']);
  });

  it('a run that loses the claim mails nobody', async () => {
    away();
    db.wins = new Set();
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 0, league_round_closing: 0 }));
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('a short round: each message has its own mails, counted per message', async () => {
    away();
    await expect(run(round({ closes_at: new Date(NOW + 20 * HOUR).toISOString() }))).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 2 }, { league_round_open: 2, league_round_closing: 2 }),
    );
    expect(mailMock.mock.calls.map((c) => c[0].kind)).toEqual([
      'league_round_open',
      'league_round_open',
      'league_round_closing',
      'league_round_closing',
    ]);
  });

  it.each(DEVICE_TABLES)('a failed read of %s: the mail goes to everyone away, so nobody is left without word', async (table) => {
    away();
    db.devices.push_subscriptions = ['kari'];
    db.devices.apns_tokens = ['kari'];
    db.devices.fcm_tokens = ['kari'];
    db.deviceReadError = table;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 2 }),
    );
    expect(err).toHaveBeenCalledWith(
      '[leagueRoundReminder] league_round_open device read failed, mailing everyone away',
      expect.anything(),
    );
    err.mockRestore();
    expect(mailedTo()).toEqual(['kari@example.test', 'lise@example.test']);
  });

  it('a failed read of the addresses: no mail, the varsler stand and the stamp is kept', async () => {
    away();
    db.usersReadError = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(result({ league_round_open: 2, league_round_closing: 0 }));
    err.mockRestore();
    expect(mailMock).not.toHaveBeenCalled();
    expect(claims()).toHaveLength(1);
  });

  it('one mail that fails is logged; the other goes, and the stamp is kept', async () => {
    away();
    mailMock.mockRejectedValueOnce(new Error('rate_limit_exceeded'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 1 }),
    );
    expect(err).toHaveBeenCalledWith('[leagueRoundReminder] league_round_open mail to kari failed', expect.anything());
    err.mockRestore();
    expect(mailMock).toHaveBeenCalledTimes(2);
    expect(claims()).toHaveLength(1);
  });
});

/**
 * #2979: the opening message of a round with a closed round before it carries
 * that round's summary in the mail, the same for everyone. Then every player
 * who is away gets the mail, with a device or not. What the summary holds is
 * `lib/league/roundSummary.test.ts`; the story is `lib/league/roundNews.test.ts`.
 */
describe('runLeagueRoundNotices: the summary of the round before', () => {
  const SNAPSHOT = { league: { name: 'Vinterligaen' } } as unknown as NonNullable<Awaited<ReturnType<typeof getLigaSnapshot>>>;
  const SUMMARY = { roundId: 'runde-2', roundLabel: 'Runde 2' } as unknown as RoundSummary;
  const mailedTo = () => mailMock.mock.calls.map((c) => c[0].to);

  beforeEach(() => {
    notifyMock.mockImplementation(async () => ({ shouldAlsoSendMail: true, inserted: true }));
    snapshotMock.mockImplementation(async () => SNAPSHOT);
    summaryMock.mockImplementation(() => SUMMARY);
    newsMock.mockImplementation(async () => 'Kari N. tok runden. Runde 3 er åpen nå.');
    db.devices.apns_tokens = ['kari'];
  });

  afterEach(() => {
    notifyMock.mockImplementation(async () => ({ shouldAlsoSendMail: false }));
    snapshotMock.mockImplementation(async () => null);
    summaryMock.mockImplementation(() => null);
    newsMock.mockImplementation(async () => null);
  });

  it('everyone away gets the mail with the same summary and story, a player with a device too', async () => {
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 2 }),
    );

    expect(snapshotMock).toHaveBeenCalledWith(LEAGUE_ID);
    expect(summaryMock).toHaveBeenCalledWith(SNAPSHOT, ROUND_ID, NOW);
    expect(newsMock).toHaveBeenCalledWith(fake.client, SUMMARY, 'Runde 3');
    expect(newsMock).toHaveBeenCalledTimes(1);
    // No device read: the summary is for the whole league.
    expect(deviceReads()).toEqual([]);
    expect(mailedTo()).toEqual(['kari@example.test', 'lise@example.test']);
    expect(mailMock.mock.calls.map((c) => c[0].summary)).toEqual([
      { summary: SUMMARY, story: 'Kari N. tok runden. Runde 3 er åpen nå.' },
      { summary: SUMMARY, story: 'Kari N. tok runden. Runde 3 er åpen nå.' },
    ]);
  });

  it('no story: the numbers go alone', async () => {
    newsMock.mockImplementation(async () => null);
    await run(round());
    expect(mailMock.mock.calls.map((c) => c[0].summary)).toEqual([
      { summary: SUMMARY, story: null },
      { summary: SUMMARY, story: null },
    ]);
  });

  it('no round before (or nobody played it): the mail is as before, only for the player without a device', async () => {
    summaryMock.mockImplementation(() => null);
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 1 }),
    );
    expect(newsMock).not.toHaveBeenCalled();
    expect(mailedTo()).toEqual(['lise@example.test']);
    expect('summary' in mailMock.mock.calls[0]![0]).toBe(false);
  });

  it.each([
    ['the table cannot be read', () => snapshotMock.mockRejectedValueOnce(new Error('connection reset'))],
    ['the league is gone', () => snapshotMock.mockResolvedValueOnce(null)],
  ])('%s: the mail goes without a summary, and the stamp is kept', async (_name, arrange) => {
    arrange();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 1 }),
    );
    err.mockRestore();
    expect(mailedTo()).toEqual(['lise@example.test']);
    expect(claims()).toHaveLength(1);
  });

  it('a story that throws does not take the numbers with it: everyone still gets the summary', async () => {
    newsMock.mockRejectedValueOnce(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(run(round())).resolves.toEqual(
      result({ league_round_open: 2, league_round_closing: 0 }, { league_round_open: 2 }),
    );
    err.mockRestore();
    expect(mailMock.mock.calls.map((c) => c[0].summary)).toEqual([
      { summary: SUMMARY, story: null },
      { summary: SUMMARY, story: null },
    ]);
  });

  it('the reminder never carries a summary, and the table is not read for it', async () => {
    const r = round({ opening_notice_sent_at: '2026-10-24T00:10:00Z', closes_at: new Date(NOW + 20 * HOUR).toISOString() });
    await expect(run(r)).resolves.toEqual(
      result({ league_round_open: 0, league_round_closing: 2 }, { league_round_closing: 1 }),
    );
    expect(snapshotMock).not.toHaveBeenCalled();
    expect(mailedTo()).toEqual(['lise@example.test']);
  });

  it('nobody away: the table is not read and the model is not asked', async () => {
    notifyMock.mockImplementation(async () => ({ shouldAlsoSendMail: false, inserted: true }));
    await run(round());
    expect(snapshotMock).not.toHaveBeenCalled();
    expect(newsMock).not.toHaveBeenCalled();
    expect(mailMock).not.toHaveBeenCalled();
  });
});
