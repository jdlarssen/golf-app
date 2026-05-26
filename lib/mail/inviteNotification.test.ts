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

describe('sendInviteNotification', () => {
  it('uten gameName: bruker generisk «Du er invitert til Tørny»-subject', async () => {
    const { sendInviteNotification } = await import('./inviteNotification');
    await sendInviteNotification({
      to: 'venn@example.com',
      invitedByName: 'Jørgen',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Du er invitert til Tørny');
    expect(payload.html).toContain('Jørgen');
    expect(payload.html).toContain('har invitert deg til en golf-turnering i Tørny');
    expect(payload.text).toContain('har invitert deg til en golf-turnering i Tørny');
    // Ingen spill-spesifikk linje når gameName ikke er satt.
    expect(payload.html).not.toContain('til spillet');
    expect(payload.text).not.toContain('til spillet');
  });

  it('med gameName: subject + body har spill-konteksten', async () => {
    const { sendInviteNotification } = await import('./inviteNotification');
    await sendInviteNotification({
      to: 'venn@example.com',
      invitedByName: 'Jørgen',
      gameName: 'Stiklestad 25. mai',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Du er invitert til Stiklestad 25. mai på Tørny');
    expect(payload.html).toContain('Stiklestad 25. mai');
    expect(payload.html).toContain('har invitert deg til spillet');
    expect(payload.text).toContain('Stiklestad 25. mai');
    expect(payload.text).toContain('har invitert deg til spillet');
  });

  it('escaper HTML i gameName slik at apostrof + tags ikke smyger gjennom', async () => {
    const { sendInviteNotification } = await import('./inviteNotification');
    await sendInviteNotification({
      to: 'venn@example.com',
      invitedByName: 'Jørgen',
      gameName: '<script>alert("x")</script>',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).toContain('&lt;script&gt;');
    // Plain-text-grenen bevarer brutto-strengen siden den ikke rendres som HTML.
    expect(payload.text).toContain('<script>alert("x")</script>');
  });
});
