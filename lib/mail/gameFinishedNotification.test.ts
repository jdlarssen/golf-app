import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Resend før import av modulen — alle send-kall fanges av spioner
// så vi kan assertere på subject/body uten å treffe nettverk. Resend må
// være et class-ish constructor (modulen kaller `new Resend(...)`).
type SendArgs = [
  {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  },
];
type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};
const sendMock = vi.fn<(...args: SendArgs) => Promise<SendResult>>(
  async () => ({ data: { id: 'mock-id' }, error: null }),
);
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: SendArgs) => sendMock(...args) };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
});

describe('sendGameFinishedNotification', () => {
  it('best_ball_netto (default): bruker dagens nøytrale «leaderboard er åpen»-copy', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Ada',
      gameName: 'Vinter-cup',
      gameId: 'game-1',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Vinter-cup');
    expect(payload.html).toContain('Hei Ada!');
    expect(payload.html).toContain('alle scorekort er levert og godkjent');
    expect(payload.text).toContain('alle scorekort er levert og godkjent');
    // Ingen stableford-fraser i default-grenen
    expect(payload.html).not.toContain('plass');
    expect(payload.text).not.toContain('plass');
  });

  it('best_ball_netto eksplisitt mode: samme nøytrale copy som default', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Ada',
      gameName: 'Vinter-cup',
      gameId: 'game-1',
      mode: { kind: 'best_ball_netto' },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('alle scorekort er levert og godkjent');
    expect(payload.html).not.toContain('plass');
  });

  it('stableford: 1.-plass får «Gratulerer med seieren!»-tilegg', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'vinner@example.com',
      playerFirstName: 'Alice',
      gameName: 'Sommerturnering',
      gameId: 'game-2',
      mode: { kind: 'stableford', rank: 1, totalPoints: 38, totalPlayers: 5 },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Sommerturnering');
    expect(payload.html).toContain('1. plass');
    expect(payload.html).toContain('av 5');
    expect(payload.html).toContain('38');
    expect(payload.html).toContain('poeng');
    expect(payload.html).toContain('Gratulerer med seieren');
    expect(payload.text).toContain('1. plass av 5');
    expect(payload.text).toContain('38 poeng');
    expect(payload.text).toContain('Gratulerer med seieren');
  });

  it('stableford: 3.-plass får «Solid plassering!»-tilegg', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Bjørn',
      gameName: 'Sommerturnering',
      gameId: 'game-2',
      mode: { kind: 'stableford', rank: 3, totalPoints: 28, totalPlayers: 12 },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('3. plass');
    expect(payload.html).toContain('Solid plassering');
    expect(payload.html).not.toContain('Gratulerer med seieren');
  });

  it('stableford: 7.-plass får INGEN celebration-tilegg (kun nøytralt resultat)', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Eva',
      gameName: 'Sommerturnering',
      gameId: 'game-2',
      mode: { kind: 'stableford', rank: 7, totalPoints: 18, totalPlayers: 12 },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('7. plass');
    expect(payload.html).not.toContain('Gratulerer');
    expect(payload.html).not.toContain('Solid plassering');
    expect(payload.text).toContain('7. plass');
  });

  it('faller tilbake til «Hei!» uten navn (samme i begge moduser)', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: null,
      gameName: 'Vinter-cup',
      gameId: 'game-1',
      mode: { kind: 'stableford', rank: 2, totalPoints: 32, totalPlayers: 4 },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Hei!');
    expect(payload.html).not.toContain('Hei null');
  });

  it('kaster når Resend returnerer feil', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate-limited' },
    } as SendResult);
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await expect(
      sendGameFinishedNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Ada',
        gameName: 'Vinter-cup',
        gameId: 'game-1',
      }),
    ).rejects.toThrow(/Resend send failed/);
  });
});
