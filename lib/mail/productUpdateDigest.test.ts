import { describe, it, expect, vi, beforeEach } from 'vitest';

type SendArgs = [
  {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
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

describe('sendProductUpdateDigest', () => {
  it('subject følger «Nytt i Tørny — [periode]»', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: 'Ada',
      periodLabel: 'mai 2026',
      updates: [{ title: 'Texas scramble', body: 'Ny modus.' }],
      unsubToken: 'tok-abc',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Nytt i Tørny — mai 2026');
  });

  it('inkluderer List-Unsubscribe + List-Unsubscribe-Post headere (RFC 8058)', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'token-xyz',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.headers).toBeDefined();
    expect(payload.headers!['List-Unsubscribe']).toBe(
      '<https://tornygolf.no/api/unsubscribe/product-update?token=token-xyz>',
    );
    expect(payload.headers!['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click',
    );
  });

  it('URL-encoder token i unsub-URL', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'token+with/chars=',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.headers!['List-Unsubscribe']).toContain(
      'token%2Bwith%2Fchars%3D',
    );
    expect(payload.html).toContain('token%2Bwith%2Fchars%3D');
    expect(payload.text).toContain('token%2Bwith%2Fchars%3D');
  });

  it('HTML inkluderer salutation med fornavn når satt', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: 'Per',
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'tok',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Hei Per!');
    expect(payload.text).toContain('Hei Per!');
  });

  it('HTML faller tilbake til «Hei!» når fornavn er null', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'tok',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toMatch(/Hei!/);
    expect(payload.text).toMatch(/Hei!/);
  });

  it('rendrer flere updates i kronologisk rekkefølge', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: 'Ada',
      periodLabel: 'mai 2026',
      updates: [
        { title: 'First feature', body: 'First body' },
        { title: 'Second feature', body: 'Second body' },
      ],
      unsubToken: 'tok',
    });
    const payload = sendMock.mock.calls[0]![0];
    const firstIdx = payload.html.indexOf('First feature');
    const secondIdx = payload.html.indexOf('Second feature');
    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(payload.text.indexOf('First feature')).toBeLessThan(
      payload.text.indexOf('Second feature'),
    );
  });

  it('rendrer CTA-knapp når både link og cta_label er satt', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [
        {
          title: 'Sideturneringen',
          body: '14 nye bonus-kategorier.',
          link: '/admin/games/new',
          cta_label: 'Prøv det',
        },
      ],
      unsubToken: 'tok',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Prøv det');
    expect(payload.html).toContain('https://tornygolf.no/admin/games/new');
    expect(payload.text).toContain('Prøv det: https://tornygolf.no/admin/games/new');
  });

  it('escapes HTML i title/body for å forhindre injection', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [
        {
          title: '<script>alert(1)</script>',
          body: '<img src=x onerror=alert(2)>',
        },
      ],
      unsubToken: 'tok',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).not.toContain('<script>alert(1)</script>');
    expect(payload.html).not.toContain('<img src=x');
    expect(payload.html).toContain('&lt;script&gt;');
  });

  it('kaster ved Resend-error', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate limited' },
    });
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await expect(
      sendProductUpdateDigest({
        to: 'spiller@example.com',
        recipientFirstName: null,
        periodLabel: 'mai 2026',
        updates: [{ title: 'X', body: 'Y' }],
        unsubToken: 'tok',
      }),
    ).rejects.toThrow(/rate limited/);
  });

  it('snapshot: HTML for minimal digest med én oppdatering', async () => {
    const { sendProductUpdateDigest } = await import('./productUpdateDigest');
    await sendProductUpdateDigest({
      to: 'spiller@example.com',
      recipientFirstName: 'Ada',
      periodLabel: 'mai 2026',
      updates: [
        {
          title: 'Texas scramble er ute!',
          body: 'Ny modus: lag spiller én ball, beste slag velges.',
        },
      ],
      unsubToken: 'fixed-token-for-snapshot',
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.text).toMatchInlineSnapshot(`
      "Nytt i Tørny — mai 2026

      Hei Ada!

      Dette var nytt i Tørny i mai 2026:

      Texas scramble er ute!
      Ny modus: lag spiller én ball, beste slag velges.

      ---
      Du får denne mailen fordi du er på Tørny.
      Meld deg av månedsbrevet: https://tornygolf.no/api/unsubscribe/product-update?token=fixed-token-for-snapshot
      Eller styr det fra profilen din: https://tornygolf.no/profile
      "
    `);
  });
});
