import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SendArgs, SendResult } from './_helpers';

// Strukturelle Resend-kontrakter samlet i ÉN delt fil per Type B-disiplinen
// i docs/test-discipline.md. Hver aktiv sender får én it.each-rad som
// verifiserer:
//   (a) error-propagation — kaster med /Resend send failed/ når Resend feiler
//   (b) from-format — default 'Tørny <noreply@tornygolf.no>' uten env-override
//   (c) call-count — sendMock kalles eksakt 1 gang per invocation
//
// vi.mock-registreringen hoistes til toppen av denne filen av Vitest, så
// selve mock-oppsettet ligger her (ikke i _helpers.ts — se kommentar der).
//
// Dekker alle 17 aktive mail-sendere i lib/mail/. Per-modul-testene beholder
// fortsatt sin egen Resend-mock for å snapshot-e copy/HTML — denne fila
// kompletterer dem ved å samle de strukturelle kontraktene ett sted.

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn<(...args: SendArgs) => Promise<SendResult>>(async () => ({
    data: { id: 'mock-id' },
    error: null,
  })),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  delete process.env.RESEND_FROM_EMAIL;
});

// Fixtures kopiert fra eksisterende per-modul-tester (baseParams). Ikke
// finn på nye verdier — sender-modulen er allerede dekket av sine egne
// approval-snapshots; her tester vi kun den strukturelle Resend-kontrakten.
const senders = [
  {
    name: 'sendGameFinishedNotification',
    invoke: async () => {
      const { sendGameFinishedNotification } = await import(
        '../gameFinishedNotification'
      );
      return sendGameFinishedNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Ada',
        gameName: 'Vinter-cup',
        gameId: 'game-1',
      });
    },
  },
  {
    name: 'sendInviteNotification',
    invoke: async () => {
      const { sendInviteNotification } = await import('../inviteNotification');
      return sendInviteNotification({
        to: 'venn@example.com',
        invitedByName: 'Jørgen',
      });
    },
  },
  {
    name: 'sendClubInviteNotification',
    invoke: async () => {
      const { sendClubInviteNotification } = await import(
        '../clubInviteNotification'
      );
      return sendClubInviteNotification({
        to: 'venn@example.com',
        invitedByName: 'Jørgen',
        clubName: 'Stiklestad Golfklubb',
      });
    },
  },
  {
    name: 'sendRegistrationApprovedMail',
    invoke: async () => {
      const { sendRegistrationApprovedMail } = await import(
        '../registrationApproved'
      );
      return sendRegistrationApprovedMail({
        to: 'spiller@example.com',
        gameName: 'Sommercup 2026',
        gameId: '11111111-1111-1111-1111-111111111111',
      });
    },
  },
  {
    name: 'sendRegistrationRejectedMail',
    invoke: async () => {
      const { sendRegistrationRejectedMail } = await import(
        '../registrationRejected'
      );
      return sendRegistrationRejectedMail({
        to: 'spiller@example.com',
        gameName: 'Sommercup 2026',
      });
    },
  },
  {
    name: 'sendRegistrationRequestMail',
    invoke: async () => {
      const { sendRegistrationRequestMail } = await import(
        '../registrationRequest'
      );
      return sendRegistrationRequestMail({
        to: 'admin@example.com',
        gameName: 'Sommercup 2026',
        gameShortId: 'abc12345',
        requesterName: 'Per Spiller',
      });
    },
  },
  {
    name: 'sendTeamInvitationMail',
    invoke: async () => {
      const { sendTeamInvitationMail } = await import('../teamInvitation');
      return sendTeamInvitationMail({
        to: 'venn@example.com',
        captainName: 'Jørgen',
        gameName: 'Sommercup 2026',
        teamName: 'Bjørketrærne',
        gameShortId: 'abc12345',
      });
    },
  },
  {
    name: 'sendProductUpdateDigest',
    invoke: async () => {
      const { sendProductUpdateDigest } = await import('../productUpdateDigest');
      return sendProductUpdateDigest({
        to: 'spiller@example.com',
        recipientFirstName: 'Per',
        periodLabel: 'mai 2026',
        updates: [{ title: 'X', body: 'Y' }],
        unsubToken: 'tok',
      });
    },
  },
  {
    name: 'sendScorecardSubmittedNotification',
    invoke: async () => {
      const { sendScorecardSubmittedNotification } = await import(
        '../scorecardSubmittedNotification'
      );
      return sendScorecardSubmittedNotification({
        to: 'admin@example.com',
        adminFirstName: 'Jørgen',
        playerName: 'Per Spiller',
        gameName: 'Sommercup 2026',
        gameId: '11111111-1111-1111-1111-111111111111',
      });
    },
  },
  {
    name: 'sendCupStartedNotification',
    invoke: async () => {
      const { sendCupStartedNotification } = await import(
        '../cupStartedNotification'
      );
      return sendCupStartedNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Per',
        tournamentName: 'Høst-cup 2026',
        tournamentId: '22222222-2222-2222-2222-222222222222',
        team1Name: 'Bjørketrærne',
        team2Name: 'Granskogen',
        pointsToWin: 10,
      });
    },
  },
  {
    name: 'sendCupFinishedNotification',
    invoke: async () => {
      const { sendCupFinishedNotification } = await import(
        '../cupFinishedNotification'
      );
      return sendCupFinishedNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Per',
        tournamentName: 'Høst-cup 2026',
        tournamentId: '33333333-3333-3333-3333-333333333333',
      });
    },
  },
  {
    name: 'sendDeliverReminderNotification',
    invoke: async () => {
      const { sendDeliverReminderNotification } = await import(
        '../deliverReminderNotification'
      );
      return sendDeliverReminderNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Per',
        gameName: 'Sommercup 2026',
        gameId: '11111111-1111-1111-1111-111111111111',
      });
    },
  },
  {
    name: 'sendMissingScoreReminderNotification',
    invoke: async () => {
      const { sendMissingScoreReminderNotification } = await import(
        '../missingScoreReminderNotification'
      );
      return sendMissingScoreReminderNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Tore',
        gameName: 'Sommercup 2026',
        gameId: '11111111-1111-1111-1111-111111111111',
        holes: [10],
      });
    },
  },
  {
    name: 'sendGuestClaimNotification',
    invoke: async () => {
      const { sendGuestClaimNotification } = await import(
        '../guestClaimNotification'
      );
      return sendGuestClaimNotification({
        to: 'kari@example.com',
        guestFirstName: 'Kari',
        invitedByName: 'Jørgen',
        gameName: 'Sommercup 2026',
      });
    },
  },
  {
    name: 'sendPaymentReminderNotification',
    invoke: async () => {
      const { sendPaymentReminderNotification } = await import(
        '../paymentReminderNotification'
      );
      return sendPaymentReminderNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Per',
        gameName: 'Sommercup 2026',
        gameId: '11111111-1111-1111-1111-111111111111',
        entryFeeKr: 200,
        paymentLink: '12345',
      });
    },
  },
  // De to idé-senderne har ingen per-modul-test; fiksturene følger kallstedene
  // (app/[locale]/foreslaa-ide/actions.ts og app/[locale]/admin/ideer/actions.ts).
  {
    name: 'sendIdeaSubmittedNotification',
    invoke: async () => {
      const { sendIdeaSubmittedNotification } = await import(
        '../ideaSubmittedNotification'
      );
      return sendIdeaSubmittedNotification({
        to: 'admin@example.com',
        adminFirstName: 'Jørgen',
        submitterName: 'Per Spiller',
        text: 'Vis vind på hvert hull',
        locale: null,
      });
    },
  },
  {
    name: 'sendIdeaBuiltNotification',
    invoke: async () => {
      const { sendIdeaBuiltNotification } = await import(
        '../ideaBuiltNotification'
      );
      return sendIdeaBuiltNotification({
        to: 'spiller@example.com',
        name: 'Per',
        locale: null,
      });
    },
  },
] as const;

describe('Resend-kontrakt — alle aktive mail-sendere', () => {
  it.each(senders)('$name overholder Resend-kontrakten', async ({ invoke }) => {
    // (a) Error-propagation — første invocation skal kaste på Resend-feil.
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate-limited' },
    });
    await expect(invoke()).rejects.toThrow(/Resend send failed/);

    // (b) From-format + (c) call-count — fresh invocation etter clear så
    // error-pathens 1 call fra (a) ikke teller med i toHaveBeenCalledTimes.
    sendMock.mockClear();
    await invoke();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![0].from).toBe('Tørny <noreply@tornygolf.no>');
  });
});

// Resend tillater 10 kall i sekundet per team og svarer 429 med `retry-after`
// over det (resend.com/docs/api-reference/rate-limit, hentet 2026-09-27).
// Nyhetsbrevet 1. september nådde 10 av 27: alle kallene gikk i samme sekund.
// Mocken under speiler grensen på den falske klokka.
const RATE_LIMITED: SendResult = {
  data: null,
  error: { name: 'rate_limit_exceeded', statusCode: 429, message: 'Too many requests' },
  headers: { 'retry-after': '1' },
};

function resendWithTeamLimit() {
  const starts: number[] = [];
  return async (): Promise<SendResult> => {
    const t = Date.now();
    starts.push(t);
    const startedLastSecond = starts.filter((s) => s > t - 1000).length;
    return startedLastSecond > 10
      ? RATE_LIMITED
      : { data: { id: 'mock-id' }, error: null, headers: {} };
  };
}

const digestFixture = {
  to: 'spiller@example.com',
  recipientFirstName: 'Per',
  periodLabel: 'mai 2026',
  updates: [{ title: 'X', body: 'Y' }],
  unsubToken: 'tok',
};

/** Kjører klokka til alt som venter på en timer er ferdig, og melder utfallet. */
async function settleOnFakeClock(work: Promise<unknown>) {
  const outcome = work.then(
    () => 'levert' as const,
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
  await vi.runAllTimersAsync();
  return outcome;
}

describe('Resend-kontrakt — tempo og nytt forsøk (#2227)', () => {
  beforeEach(() => {
    // Ny modulinstans per test, så avsenderens tempo-tilstand ikke lekker.
    vi.resetModules();
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    sendMock.mockReset();
  });

  it('27 samtidige nyhetsbrev når alle fram', async () => {
    sendMock.mockImplementation(resendWithTeamLimit());
    const { sendProductUpdateDigest } = await import('../productUpdateDigest');

    const all = Promise.allSettled(
      Array.from({ length: 27 }, () => sendProductUpdateDigest(digestFixture)),
    );
    await vi.runAllTimersAsync();
    const results = await all;

    const levert = results.filter((r) => r.status === 'fulfilled').length;
    expect({ levert, avvist: results.length - levert }).toEqual({
      levert: 27,
      avvist: 0,
    });
  });

  it('prøver på nytt etter rate_limit_exceeded og venter retry-after', async () => {
    const startedAt: number[] = [];
    sendMock.mockImplementation(async () => {
      startedAt.push(Date.now());
      return startedAt.length === 1
        ? RATE_LIMITED
        : { data: { id: 'mock-id' }, error: null, headers: {} };
    });
    const { sendProductUpdateDigest } = await import('../productUpdateDigest');

    const outcome = await settleOnFakeClock(sendProductUpdateDigest(digestFixture));

    expect({ outcome, kall: sendMock.mock.calls.length }).toEqual({
      outcome: 'levert',
      kall: 2,
    });
    expect(startedAt[1]! - startedAt[0]!).toBeGreaterThanOrEqual(1000);
  });

  it('gir opp etter tre rate_limit_exceeded på rad', async () => {
    sendMock.mockResolvedValue(RATE_LIMITED);
    const { sendProductUpdateDigest } = await import('../productUpdateDigest');

    const outcome = await settleOnFakeClock(sendProductUpdateDigest(digestFixture));

    expect(outcome).toMatch(/Resend send failed/);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('prøver ikke på nytt når dagskvoten er brukt opp', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'daily_quota_exceeded', statusCode: 429, message: 'Daily quota exceeded' },
      headers: {},
    });
    const { sendProductUpdateDigest } = await import('../productUpdateDigest');

    const outcome = await settleOnFakeClock(sendProductUpdateDigest(digestFixture));

    expect(outcome).toMatch(/Resend send failed/);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
