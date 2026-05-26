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
// Refinement Loop: starter med 2 sendere for å verifisere mønsteret.
// Utvides til alle 7 aktive sendere etter Check Alignment med hovedchat.

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
