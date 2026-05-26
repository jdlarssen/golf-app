import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegistrationApprovedMailParams } from './registrationApproved';

// Approval-style tester: snapshot subject + text + body-line HTML per case.
// Når copy endres: kjør `vitest -u` og review diff-en.
//
// Strategi:
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-line-en (avsnittet med <strong>-markup) ekstraheres og
//     snapshot-es per case for å verifisere personalisering + HTML-escape.
//   - HTML-chrome (header, button, footer) snapshot-es ÉN gang.

type SendArgs = [
  { from: string; to: string; subject: string; html: string; text: string },
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

async function send(params: RegistrationApprovedMailParams) {
  const { sendRegistrationApprovedMail } = await import(
    './registrationApproved'
  );
  await sendRegistrationApprovedMail(params);
  return sendMock.mock.calls[0]![0];
}

// Body-line-paragrafen har unik styling (margin:0 0 16px med 16px font-size).
// Eneste paragraf med den styling-en på dette malet — header-paragrafen har
// 13px font og footer har 32px 0 0 margin.
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 16px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'spiller@example.com',
  gameName: 'Sommercup 2026',
  gameId: '11111111-1111-1111-1111-111111111111',
} satisfies RegistrationApprovedMailParams;

describe('sendRegistrationApprovedMail', () => {
  it('approve-mail med subject + body-line + tekst', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Du er med i Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er med i Sommercup 2026

      Arrangøren har godkjent påmeldingen din til Sommercup 2026. Du står på lista, og scorekortet åpner ved tee-off.

      Se spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Arrangøren har godkjent påmeldingen din til <strong>Sommercup 2026</strong>. Du står på lista, og scorekortet åpner ved tee-off."`);
  });

  it('escaper HTML i gameName i body-line og text', async () => {
    const payload = await send({
      ...baseParams,
      gameName: '<b>X</b>',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Du er med i <b>X</b>"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er med i <b>X</b>

      Arrangøren har godkjent påmeldingen din til <b>X</b>. Du står på lista, og scorekortet åpner ved tee-off.

      Se spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Arrangøren har godkjent påmeldingen din til <strong>&lt;b&gt;X&lt;/b&gt;</strong>. Du står på lista, og scorekortet åpner ved tee-off."`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang.
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template for default-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="nb">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Du er med i Sommercup 2026</title>
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
                  <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
                    Fyr opp golfturneringen på et par minutter.
                  </p>
                  <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
                    Du er med
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Arrangøren har godkjent påmeldingen din til <strong>Sommercup 2026</strong>. Du står på lista, og scorekortet åpner ved tee-off.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/games/11111111-1111-1111-1111-111111111111" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Se spillet
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for å se flight, lag og tee-off.
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

  // Strukturelle Resend-kontrakter (error-propagation, to/from, call-count)
  // dekkes av gameFinishedNotification.test.ts som kanonisk demonstrasjon.
  // Konsolideres til lib/mail/__tests__/resend-contract.test.ts i issue #263.
});
