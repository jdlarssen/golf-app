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

describe('sendRegistrationApprovedMail', () => {
  it('bruker «Du er med i {gameName}» som subject + lenker til /games/[id]', async () => {
    const { sendRegistrationApprovedMail } = await import(
      './registrationApproved'
    );
    await sendRegistrationApprovedMail({
      to: 'spiller@example.com',
      gameName: 'Sommercup 2026',
      gameId: '11111111-1111-1111-1111-111111111111',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Du er med i Sommercup 2026');
    expect(payload.html).toContain('Sommercup 2026');
    expect(payload.html).toContain(
      '/games/11111111-1111-1111-1111-111111111111',
    );
    expect(payload.text).toContain('Sommercup 2026');
    expect(payload.text).toContain(
      '/games/11111111-1111-1111-1111-111111111111',
    );
  });

  it('escaper HTML i gameName', async () => {
    const { sendRegistrationApprovedMail } = await import(
      './registrationApproved'
    );
    await sendRegistrationApprovedMail({
      to: 'spiller@example.com',
      gameName: '<b>X</b>',
      gameId: '11111111-1111-1111-1111-111111111111',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).not.toContain('<b>X</b>');
    expect(payload.html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});
