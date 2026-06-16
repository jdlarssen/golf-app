import { describe, it, expect, vi, beforeEach } from 'vitest';
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
// Dekker alle 12 aktive mail-sendere i lib/mail/. Per-modul-testene beholder
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
        team1Name: 'Bjørketrærne',
        team2Name: 'Granskogen',
        team1Points: 3,
        team2Points: 2,
        winnerTeamName: 'Bjørketrærne',
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
