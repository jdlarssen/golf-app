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

describe('sendRegistrationRequestMail', () => {
  it('bruker «Ny påmelding til {gameName}» som subject', async () => {
    const { sendRegistrationRequestMail } = await import('./registrationRequest');
    await sendRegistrationRequestMail({
      to: 'admin@example.com',
      gameName: 'Sommercup 2026',
      gameShortId: 'abc12345',
      requesterName: 'Per Spiller',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Ny påmelding til Sommercup 2026');
    expect(payload.html).toContain('Per Spiller');
    expect(payload.html).toContain('Sommercup 2026');
    expect(payload.html).toContain('/påmelding/abc12345');
    expect(payload.text).toContain('Per Spiller');
    expect(payload.text).toContain('Sommercup 2026');
  });

  it('inkluderer hilsen som blockquote når message er satt', async () => {
    const { sendRegistrationRequestMail } = await import('./registrationRequest');
    await sendRegistrationRequestMail({
      to: 'admin@example.com',
      gameName: 'Sommercup',
      gameShortId: 'abc12345',
      requesterName: 'Per',
      message: 'Slipp meg inn, takk',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Slipp meg inn, takk');
    expect(payload.html).toContain('blockquote');
    expect(payload.text).toContain('«Slipp meg inn, takk»');
  });

  it('utelater blockquote når message ikke er satt', async () => {
    const { sendRegistrationRequestMail } = await import('./registrationRequest');
    await sendRegistrationRequestMail({
      to: 'admin@example.com',
      gameName: 'Sommercup',
      gameShortId: 'abc12345',
      requesterName: 'Per',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).not.toContain('blockquote');
  });

  it('escaper HTML i requesterName og gameName', async () => {
    const { sendRegistrationRequestMail } = await import('./registrationRequest');
    await sendRegistrationRequestMail({
      to: 'admin@example.com',
      gameName: '<script>alert(1)</script>',
      gameShortId: 'abc12345',
      requesterName: 'Per & Pål',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).toContain('&lt;script&gt;');
    expect(payload.html).toContain('Per &amp; Pål');
  });
});
