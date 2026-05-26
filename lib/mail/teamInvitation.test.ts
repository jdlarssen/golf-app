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

describe('sendTeamInvitationMail', () => {
  it('subject lokker både teamName og gameName', async () => {
    const { sendTeamInvitationMail } = await import('./teamInvitation');
    await sendTeamInvitationMail({
      to: 'venn@example.com',
      captainName: 'Jørgen',
      gameName: 'Sommercup 2026',
      teamName: 'Bjørketrærne',
      gameShortId: 'abc12345',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe(
      'Du er invitert til Bjørketrærne (Sommercup 2026)',
    );
  });

  it('lenker til /login med next=/påmelding/[shortId]/team', async () => {
    const { sendTeamInvitationMail } = await import('./teamInvitation');
    await sendTeamInvitationMail({
      to: 'venn@example.com',
      captainName: 'Jørgen',
      gameName: 'Sommercup',
      teamName: 'Bjørka',
      gameShortId: 'abc12345',
    });
    const payload = sendMock.mock.calls[0]![0];
    // URL-encoded next-param: /påmelding/[shortId]/team
    expect(payload.html).toContain('login?next=');
    expect(payload.html).toContain('abc12345');
    expect(payload.text).toContain('login?next=');
  });

  it('inneholder kaptein- og lag-navn i body', async () => {
    const { sendTeamInvitationMail } = await import('./teamInvitation');
    await sendTeamInvitationMail({
      to: 'venn@example.com',
      captainName: 'Jørgen',
      gameName: 'Sommercup',
      teamName: 'Bjørka',
      gameShortId: 'abc12345',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Jørgen');
    expect(payload.html).toContain('Bjørka');
    expect(payload.html).toContain('Sommercup');
    expect(payload.text).toContain('Jørgen');
    expect(payload.text).toContain('Bjørka');
    expect(payload.text).toContain('Sommercup');
  });

  it('escaper HTML i alle bruker-styrte felt', async () => {
    const { sendTeamInvitationMail } = await import('./teamInvitation');
    await sendTeamInvitationMail({
      to: 'venn@example.com',
      captainName: '<b>X</b>',
      gameName: '<i>Y</i>',
      teamName: '<u>Z</u>',
      gameShortId: 'abc12345',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).not.toContain('<b>X</b>');
    expect(payload.html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(payload.html).toContain('&lt;i&gt;Y&lt;/i&gt;');
    expect(payload.html).toContain('&lt;u&gt;Z&lt;/u&gt;');
  });
});
