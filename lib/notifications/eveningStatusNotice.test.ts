// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2483): the evening varsel for one round. When it is due has its own
 * suite (`lib/games/eveningBeforeRules.test.ts`). Here: what is read, that the
 * claim is atomic and decides (two sweeps, one varsel), what the varsel says,
 * when the mail goes, and that a failed send never leaves the function.
 */

const GAME_ID = '11111111-1111-1111-1111-111111111111';
const ORG = 'arrangor';
// Friday 20 November 2026, 19:00 Oslo: the evening before Saturday's round.
const NOW = Date.parse('2026-11-20T18:00:00.000Z');

type RosterRow = {
  user_id: string;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { name: string | null; nickname: string | null; email: string | null; is_guest: boolean } | null;
};

let db: {
  roster: RosterRow[];
  rosterError: boolean;
  /** How many claims still win their row; the next ones get none. */
  claimsLeft: number;
  claimError: boolean;
  organiser: { name: string | null; locale: string | null } | null;
};

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games' && op.kind === 'update') {
    if (db.claimError) return { error: { message: 'boom' } };
    if (db.claimsLeft <= 0) return { data: [] };
    db.claimsLeft -= 1;
    return { data: [{ id: GAME_ID }] };
  }
  if (op.table === 'game_players') {
    return db.rosterError ? { error: { message: 'connection reset' } } : { data: db.roster };
  }
  if (op.table === 'users') return { data: db.organiser };
  throw new Error(`unexpected query: ${op.kind} ${op.table}`);
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
import { sendOrganizerGameNotice } from '@/lib/mail/organizerGameNotice';
import { runEveningNoticeForGame, type EveningSweepGame } from './eveningStatusNotice';

const notifyMock = vi.mocked(notify);
const mailMock = vi.mocked(sendOrganizerGameNotice);
const claims = () => fake.ops.filter((op) => op.kind === 'update');

function member(
  user_id: string,
  name: string | null,
  overrides: Partial<Omit<RosterRow, 'user_id' | 'users'>> & { is_guest?: boolean; email?: string } = {},
): RosterRow {
  const { is_guest = false, email = `${user_id}@example.test`, ...rest } = overrides;
  return {
    user_id,
    withdrawn_at: null,
    accepted_at: '2026-11-11T10:00:00.000Z',
    users: { name, nickname: null, email, is_guest },
    ...rest,
  };
}

const GAME: EveningSweepGame = {
  id: GAME_ID,
  name: 'Lørdagsrunden',
  status: 'scheduled',
  scheduled_tee_off_at: '2026-11-21T08:00:00.000Z',
  created_at: '2026-11-10T12:00:00.000Z',
  created_by: ORG,
  tournament_id: null,
  source_game_id: null,
  league_round_id: null,
  organizer_evening_notice_sent_at: null,
};

const run = (game: EveningSweepGame = GAME, now = NOW) =>
  runEveningNoticeForGame(
    fake.client as unknown as Parameters<typeof runEveningNoticeForGame>[0],
    game,
    now,
  );

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false } as Awaited<ReturnType<typeof notify>>);
  db = {
    roster: [
      member(ORG, 'Jørgen Larssen'),
      member('marte', 'Marte Hansen'),
      member('kari', 'Kari Lund', { accepted_at: null }),
      member('gjest', 'Gjest Gjestesen', { accepted_at: null, is_guest: true }),
      member('ola', 'Ola Nordmann', { accepted_at: null, withdrawn_at: '2026-11-15T10:00:00.000Z' }),
    ],
    rosterError: false,
    claimsLeft: 1,
    claimError: false,
    organiser: { name: 'Jørgen Larssen', locale: 'no' },
  };
});

describe('runEveningNoticeForGame', () => {
  it('due: claims the stamp while still scheduled and sends one varsel with the evening\'s picture', async () => {
    await expect(run()).resolves.toEqual({ notified: true });

    const roster = fake.ops.find((op) => op.table === 'game_players')!;
    expect(roster.filters).toEqual([{ op: 'eq', column: 'game_id', value: GAME_ID }]);
    const claim = claims()[0]!;
    expect(claim.payload).toEqual({ organizer_evening_notice_sent_at: new Date(NOW).toISOString() });
    expect(claim.filters).toEqual([
      { op: 'eq', column: 'id', value: GAME_ID },
      { op: 'is', column: 'organizer_evening_notice_sent_at', value: null },
      { op: 'eq', column: 'status', value: 'scheduled' },
    ]);
    // Marte, the organiser and the guest have confirmed; Ola withdrew.
    expect(notifyMock.mock.calls.map((c) => c[0])).toEqual([
      {
        userId: ORG,
        kind: 'organizer_evening_status',
        payload: {
          game_id: GAME_ID,
          game_name: 'Lørdagsrunden',
          tee_off_at: '2026-11-21T08:00:00.000Z',
          confirmed: 3,
          total: 4,
          unanswered_names: ['Kari'],
          unanswered_more: 0,
        },
      },
    ]);
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('two sweeps meet: the second claim wins no row, so the organiser hears it once', async () => {
    await run();
    await run();
    expect(claims()).toHaveLength(2);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('not due yet (17:59 Oslo): no claim, nothing sent', async () => {
    await expect(run(GAME, Date.parse('2026-11-20T16:59:00.000Z'))).resolves.toEqual({ notified: false });
    expect(claims()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('nobody else on the list: no claim, nothing sent', async () => {
    db.roster = [member(ORG, 'Jørgen Larssen'), member('gjest', 'Gjest', { is_guest: true })];
    await expect(run()).resolves.toEqual({ notified: false });
    expect(claims()).toEqual([]);
  });

  it('a nameless player shows by the masked address, never the whole of it', async () => {
    db.roster = [member(ORG, 'Jørgen'), member('ny', null, { accepted_at: null, email: 'nyspiller@example.test' })];
    await run();
    const names = (notifyMock.mock.calls[0][0].payload as { unanswered_names: string[] }).unanswered_names;
    expect(names).toHaveLength(1);
    expect(names[0]).not.toContain('nyspiller@');
    expect(names[0]).toContain('@example.test');
  });

  it('off-app: the mail goes too, with the same status', async () => {
    notifyMock.mockResolvedValue({ shouldAlsoSendMail: true } as Awaited<ReturnType<typeof notify>>);
    await run();
    expect(mailMock).toHaveBeenCalledWith({
      to: `${ORG}@example.test`,
      recipientFirstName: 'Jørgen',
      gameName: 'Lørdagsrunden',
      gameId: GAME_ID,
      locale: 'no',
      variant: 'evening',
      status: notifyMock.mock.calls[0][0].payload,
    });
  });

  it('a failed roster read throws, so the sweep counts it, and nothing is claimed', async () => {
    db.rosterError = true;
    await expect(run()).rejects.toThrow('connection reset');
    expect(claims()).toEqual([]);
  });

  it('a failed claim throws and sends nothing', async () => {
    db.claimError = true;
    await expect(run()).rejects.toThrow('boom');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it.each([
    ['notify threw', () => notifyMock.mockRejectedValue(new Error('push down'))],
    ['the row did not land', () =>
      notifyMock.mockResolvedValue({ shouldAlsoSendMail: true, inserted: false } as Awaited<ReturnType<typeof notify>>)],
  ])('a failed send (%s) is logged, never thrown, and the stamp is released for the next sweep', async (_label, arrange) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    arrange();
    await expect(run()).resolves.toEqual({ notified: false });
    const [, release, ...extra] = claims();
    expect(extra).toEqual([]);
    expect(release!.payload).toEqual({ organizer_evening_notice_sent_at: null });
    expect(release!.filters).toEqual([
      { op: 'eq', column: 'id', value: GAME_ID },
      { op: 'eq', column: 'organizer_evening_notice_sent_at', value: new Date(NOW).toISOString() },
    ]);
    expect(mailMock).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
