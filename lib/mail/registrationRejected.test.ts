import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('sendRegistrationRejectedMail', () => {
  it('bruker «Søknad til {gameName}» som subject', async () => {
    const { sendRegistrationRejectedMail } = await import(
      './registrationRejected'
    );
    await sendRegistrationRejectedMail({
      to: 'spiller@example.com',
      gameName: 'Sommercup 2026',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Søknad til Sommercup 2026');
    expect(payload.html).toContain('Sommercup 2026');
    expect(payload.html).toContain('dessverre ikke godkjent');
    expect(payload.text).toContain('dessverre ikke godkjent');
  });

  it('inkluderer reason som blockquote når satt', async () => {
    const { sendRegistrationRejectedMail } = await import(
      './registrationRejected'
    );
    await sendRegistrationRejectedMail({
      to: 'spiller@example.com',
      gameName: 'Sommercup',
      reason: 'Fullt opp denne gangen',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Fullt opp denne gangen');
    expect(payload.html).toContain('blockquote');
    expect(payload.text).toContain('«Fullt opp denne gangen»');
  });

  it('utelater blockquote når reason ikke er satt', async () => {
    const { sendRegistrationRejectedMail } = await import(
      './registrationRejected'
    );
    await sendRegistrationRejectedMail({
      to: 'spiller@example.com',
      gameName: 'Sommercup',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).not.toContain('blockquote');
  });
});
