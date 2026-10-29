// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

type Db = {
  players: string[];
  flights: Array<{ status: string; game_players: Array<{ user_id: string; withdrawn_at: string | null }> }>;
  readError: 'players' | 'flights' | null;
  /** Which stamps the claim wins. */
  wins: Set<string>;
  claimError: boolean;
};
let db: Db;

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
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('./notify', () => ({ notify: vi.fn(async () => ({ shouldAlsoSendMail: false })) }));

import { notify } from './notify';
import { runLeagueRoundNotices, type LeagueRoundSweepRound } from './leagueRoundNotices';

const notifyMock = vi.mocked(notify);
const claims = () => fake.ops.filter((op) => op.kind === 'update');

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
  };
});

describe('runLeagueRoundNotices', () => {
  it('a round that just opened: claims the opening stamp and tells everyone who has not played', async () => {
    await expect(run(round())).resolves.toEqual({ sent: { league_round_open: 2, league_round_closing: 0 } });

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
    await expect(run(r)).resolves.toEqual({ sent: { league_round_open: 0, league_round_closing: 2 } });

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
    await expect(run(round({ closes_at: new Date(NOW + 20 * HOUR).toISOString() }))).resolves.toEqual({
      sent: { league_round_open: 0, league_round_closing: 2 },
    });
    expect(notifyMock.mock.calls.map((c) => c[0].kind)).toEqual(['league_round_closing', 'league_round_closing']);
  });

  it('everyone has played: the stamp is still claimed, so the round does not come back, and nobody is told', async () => {
    db.players = ['per', 'ola'];
    await expect(run(round())).resolves.toEqual({ sent: { league_round_open: 0, league_round_closing: 0 } });
    expect(claims()).toHaveLength(1);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('nothing due: no reads, no claim', async () => {
    await expect(run(round({ opening_notice_sent_at: '2026-10-24T00:10:00Z' }))).resolves.toEqual({
      sent: { league_round_open: 0, league_round_closing: 0 },
    });
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
    await expect(run(round())).resolves.toEqual({ sent: { league_round_open: 1, league_round_closing: 0 } });
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledWith('[leagueRoundReminder] league_round_open to kari failed', expect.anything());
    err.mockRestore();
  });
});
