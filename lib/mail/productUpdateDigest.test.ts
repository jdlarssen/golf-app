import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProductUpdateDigestParams } from './productUpdateDigest';

// Hybrid-strategi her: copy-tester konverteres til body-region snapshots.
// Strukturelle kontrakter (RFC 8058 unsub-headere, URL-encoding av token,
// Resend-error-propagation) beholdes som eksplisitte assertions fordi de
// verifiserer kontrakt mot eksterne systemer (Gmail/Yahoo bulk-sender-
// disiplin) — ikke copy som drifter med språk-justeringer.
//
// Snapshot-strategi:
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-region (h2 → footer-paragraf) snapshot-es per case for å
//     verifisere salutation, intro, update-blokker, CTA-knapper og
//     HTML-escape i ett ekspressivt snapshot.
//   - Full HTML chrome snapshot-es ÉN gang i minimal-digest-casen.

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

async function send(params: ProductUpdateDigestParams) {
  const { sendProductUpdateDigest } = await import('./productUpdateDigest');
  await sendProductUpdateDigest(params);
  return sendMock.mock.calls[0]![0];
}

// Henter ut alt mellom </h2> og footer-paragrafen (border-top + 13px-fonten).
// Dekker salutation + intro + update-blokker (inkl. ev. CTA-knapper).
function mainBodyHtml(html: string): string {
  const m = html.match(
    /<\/h2>\s*([\s\S]*?)\s*<p style="font-size:13px;color:#4A3F30;line-height:1\.5;margin:32px 0 0;/,
  );
  if (!m) throw new Error('Main body region not found in HTML');
  return m[1].trim();
}

describe('sendProductUpdateDigest', () => {
  // ─────────────────────────────────────────────────────────────────────
  // Approval-style copy-tester
  // ─────────────────────────────────────────────────────────────────────

  it('salutation med fornavn: «Hei {fornavn}!»', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      recipientFirstName: 'Per',
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'tok',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Nytt i Tørny — mai 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Nytt i Tørny — mai 2026

      Hei Per!

      Dette var nytt i Tørny i mai 2026:

      X
      Y

      ---
      Du får denne mailen fordi du er på Tørny.
      Meld deg av månedsbrevet: https://tornygolf.no/api/unsubscribe/product-update?token=tok
      Eller styr det fra profilen din: https://tornygolf.no/profile
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hei Per!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
                    Dette var nytt i Tørny i mai 2026:
                  </p>
                  
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      X
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      Y
                    </p>
                    
                  </div>"
    `);
  });

  it('salutation uten fornavn: faller tilbake til «Hei!»', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'tok',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Nytt i Tørny — mai 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Nytt i Tørny — mai 2026

      Hei!

      Dette var nytt i Tørny i mai 2026:

      X
      Y

      ---
      Du får denne mailen fordi du er på Tørny.
      Meld deg av månedsbrevet: https://tornygolf.no/api/unsubscribe/product-update?token=tok
      Eller styr det fra profilen din: https://tornygolf.no/profile
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hei!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
                    Dette var nytt i Tørny i mai 2026:
                  </p>
                  
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      X
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      Y
                    </p>
                    
                  </div>"
    `);
  });

  it('rendrer flere updates i kronologisk rekkefølge', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      recipientFirstName: 'Ada',
      periodLabel: 'mai 2026',
      updates: [
        { title: 'First feature', body: 'First body' },
        { title: 'Second feature', body: 'Second body' },
      ],
      unsubToken: 'tok',
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Nytt i Tørny — mai 2026

      Hei Ada!

      Dette var nytt i Tørny i mai 2026:

      First feature
      First body

      Second feature
      Second body

      ---
      Du får denne mailen fordi du er på Tørny.
      Meld deg av månedsbrevet: https://tornygolf.no/api/unsubscribe/product-update?token=tok
      Eller styr det fra profilen din: https://tornygolf.no/profile
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hei Ada!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
                    Dette var nytt i Tørny i mai 2026:
                  </p>
                  
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      First feature
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      First body
                    </p>
                    
                  </div>
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      Second feature
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      Second body
                    </p>
                    
                  </div>"
    `);
  });

  it('rendrer CTA-knapp når både link og cta_label er satt', async () => {
    const payload = await send({
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
    expect(payload.text).toMatchInlineSnapshot(`
      "Nytt i Tørny — mai 2026

      Hei!

      Dette var nytt i Tørny i mai 2026:

      Sideturneringen
      14 nye bonus-kategorier.
      Prøv det: https://tornygolf.no/admin/games/new

      ---
      Du får denne mailen fordi du er på Tørny.
      Meld deg av månedsbrevet: https://tornygolf.no/api/unsubscribe/product-update?token=tok
      Eller styr det fra profilen din: https://tornygolf.no/profile
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hei!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
                    Dette var nytt i Tørny i mai 2026:
                  </p>
                  
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      Sideturneringen
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      14 nye bonus-kategorier.
                    </p>
                    <div style="margin:12px 0 0;">
                             <a href="https://tornygolf.no/admin/games/new" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
                               Prøv det
                             </a>
                           </div>
                  </div>"
    `);
  });

  it('escaper HTML i title/body for å forhindre injection', async () => {
    const payload = await send({
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
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hei!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
                    Dette var nytt i Tørny i mai 2026:
                  </p>
                  
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      &lt;script&gt;alert(1)&lt;/script&gt;
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      &lt;img src=x onerror=alert(2)&gt;
                    </p>
                    
                  </div>"
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Strukturelle kontrakter (ikke approval-basert)
  // ─────────────────────────────────────────────────────────────────────

  it('subject følger «Nytt i Tørny — {periode}»', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      recipientFirstName: 'Ada',
      periodLabel: 'mai 2026',
      updates: [{ title: 'Texas scramble', body: 'Ny modus.' }],
      unsubToken: 'tok-abc',
    });
    expect(payload.subject).toBe('Nytt i Tørny — mai 2026');
  });

  it('inkluderer List-Unsubscribe + List-Unsubscribe-Post headere (RFC 8058)', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'token-xyz',
    });
    expect(payload.headers).toBeDefined();
    expect(payload.headers!['List-Unsubscribe']).toBe(
      '<https://tornygolf.no/api/unsubscribe/product-update?token=token-xyz>',
    );
    expect(payload.headers!['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click',
    );
  });

  it('URL-encoder token i unsub-URL (header + body)', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      recipientFirstName: null,
      periodLabel: 'mai 2026',
      updates: [{ title: 'X', body: 'Y' }],
      unsubToken: 'token+with/chars=',
    });
    // encodeURIComponent('token+with/chars=') === 'token%2Bwith%2Fchars%3D'
    expect(payload.headers!['List-Unsubscribe']).toContain(
      'token%2Bwith%2Fchars%3D',
    );
    expect(payload.html).toContain('token%2Bwith%2Fchars%3D');
    expect(payload.text).toContain('token%2Bwith%2Fchars%3D');
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

  // ─────────────────────────────────────────────────────────────────────
  // Eksisterende text-snapshot beholdes + full-HTML chrome låses ÉN gang
  // ─────────────────────────────────────────────────────────────────────

  it('snapshot: minimal digest med én oppdatering (text + full HTML)', async () => {
    const payload = await send({
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
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Nytt i Tørny — mai 2026</title>
      </head>
      <body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1813;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
          <tr>
            <td align="center" style="padding:48px 16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;">
                <tr><td>
                  <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
                    Tørny<span style="color:#C9A961;">.</span>
                  </h1>
                  <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
                    Fyr opp golfturneringen på et par minutter.
                  </p>
                  <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
                    Nytt i Tørny — mai 2026
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hei Ada!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
                    Dette var nytt i Tørny i mai 2026:
                  </p>
                  
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      Texas scramble er ute!
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      Ny modus: lag spiller én ball, beste slag velges.
                    </p>
                    
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne mailen fordi du er på Tørny. <a href="https://tornygolf.no/api/unsubscribe/product-update?token=fixed-token-for-snapshot" style="color:#1B4332;text-decoration:underline;">Meld deg av månedsbrevet</a>, eller styr det fra <a href="https://tornygolf.no/profile" style="color:#1B4332;text-decoration:underline;">profilen din</a>.
                  </p>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>"
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Engelsk (locale: 'en') — Fase M.
  // ─────────────────────────────────────────────────────────────────────

  it('locale en: engelsk chrome (salutation, intro, footer) + uoversatt update-innhold', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      recipientFirstName: 'Ada',
      periodLabel: 'mai 2026',
      updates: [{ title: 'Texas scramble er ute!', body: 'Ny modus: lag spiller én ball.' }],
      unsubToken: 'fixed-token',
      locale: 'en',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"What's new in Tørny — mai 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "What's new in Tørny — mai 2026

      Hi Ada!

      Here's what was new in Tørny in mai 2026:

      Texas scramble er ute!
      Ny modus: lag spiller én ball.

      ---
      You're receiving this because you're on Tørny.
      Unsubscribe from the monthly digest: https://tornygolf.no/api/unsubscribe/product-update?token=fixed-token
      Or manage it from your profile: https://tornygolf.no/en/profile
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hi Ada!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
                    Here&#39;s what was new in Tørny in mai 2026:
                  </p>
                  
                  <div style="margin:0 0 24px;">
                    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                      Texas scramble er ute!
                    </h3>
                    <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                      Ny modus: lag spiller én ball.
                    </p>
                    
                  </div>"
    `);
  });
});
