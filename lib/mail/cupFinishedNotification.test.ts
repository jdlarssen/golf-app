import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { CupFinishedNotificationParams } from './cupFinishedNotification';

// Approval-style tester (Type B, se lib/mail/AGENTS.md): snapshot subject +
// text + body-HTML per case. Chrome låses ÉN gang på default-casen.
// Strukturell Resend-kontrakt ligger i __tests__/resend-contract.test.ts.

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
});

async function send(params: CupFinishedNotificationParams) {
  const { sendCupFinishedNotification } = await import(
    './cupFinishedNotification'
  );
  await sendCupFinishedNotification(params);
  return sendMock.mock.calls[0]![0];
}

// #1499: mailen teaser bare — ingen vinner-/score-linjer igjen. De to
// varierende body-avsnittene (bodySettled + teaser) deler 16px-stylingen;
// hent begge joined for å snapshot-e body uten chrome. Salutation dekkes av
// text-snapshot-en.
function bodyBlockHtml(html: string): string {
  const paragraphs = [
    ...html.matchAll(
      /<p style="font-size:16px;line-height:1\.5;margin:0 0 16px;">\s*([\s\S]*?)\s*<\/p>/g,
    ),
  ];
  if (paragraphs.length === 0) {
    throw new Error('Body paragraphs not found in HTML');
  }
  return paragraphs.map((m) => m[1].trim()).join('\n');
}

const baseParams = {
  to: 'spiller@example.com',
  playerFirstName: 'Per',
  tournamentName: 'Høst-cup 2026',
  tournamentId: '33333333-3333-3333-3333-333333333333',
} satisfies CupFinishedNotificationParams;

describe('sendCupFinishedNotification', () => {
  it('default: teaser uten vinner eller stilling', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet er klart — Høst-cup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Hei Per!

      Cup-en "Høst-cup 2026" er avgjort.
      Hvordan endte det? Svaret venter på resultatsiden.

      Se resultatet: https://tornygolf.no/cup/33333333-3333-3333-3333-333333333333/resultater
      "
    `);
    expect(bodyBlockHtml(payload.html)).toMatchInlineSnapshot(`
      "Cup-en <strong>Høst-cup 2026</strong> er avgjort.
      Hvordan endte det? Svaret venter på resultatsiden."
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Engelsk (locale: 'en') — Fase M.
  // ─────────────────────────────────────────────────────────────────────

  it('locale en: engelsk subject + teaser + /en/-lenke', async () => {
    const payload = await send({ ...baseParams, locale: 'en' });
    expect(payload.subject).toMatchInlineSnapshot(`"Result confirmed — Høst-cup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Hi Per!

      The cup "Høst-cup 2026" is decided.
      How did it end? The answer is waiting on the results page.

      See the result: https://tornygolf.no/en/cup/33333333-3333-3333-3333-333333333333/resultater
      "
    `);
    expect(bodyBlockHtml(payload.html)).toMatchInlineSnapshot(`
      "The cup <strong>Høst-cup 2026</strong> is decided.
      How did it end? The answer is waiting on the results page."
    `);
  });

  // HTML chrome — låses ÉN gang. Endres chrome-mal-en må snapshot-en
  // oppdateres bevisst (vitest -u + review).
  it('HTML chrome: full template for default-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Resultatet er klart — Høst-cup 2026</title>
      </head>
      <body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1813;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
          <tr>
            <td align="center" style="padding:48px 16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
                <tr><td>
                  <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
                    Tørny<span style="color:#C9A961;">.</span>
                  </h1>
                  <p style="font-size:13px;color:#5C5347;margin:0 0 32px;">
                    Fyr opp golfturneringen på et par minutter.
                  </p>
                  <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
                    Hei Per!
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Cup-en <strong>Høst-cup 2026</strong> er avgjort.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hvordan endte det? Svaret venter på resultatsiden.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/cup/33333333-3333-3333-3333-333333333333/resultater" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Se resultatet
                    </a>
                  </div>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>"
    `);
  });
});
