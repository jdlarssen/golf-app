import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegistrationRejectedMailParams } from './registrationRejected';

// Approval-style tester: snapshot subject + text + body-content HTML per case.
// Når copy endres: kjør `vitest -u` og review diff-en.
//
// Strategi:
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-content (regionen mellom <h2> og footer-paragraf)
//     ekstraheres og snapshot-es per case. Denne fanger både body-line-en
//     OG blockquote-tilstedeværelse/-fravær i ett snapshot, uten å gjøre
//     en egen «not.toContain('blockquote')»-assertion nødvendig.
//   - HTML-chrome (header, footer) snapshot-es ÉN gang.

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

async function send(params: RegistrationRejectedMailParams) {
  const { sendRegistrationRejectedMail } = await import(
    './registrationRejected'
  );
  await sendRegistrationRejectedMail(params);
  return sendMock.mock.calls[0]![0];
}

// Henter ut alt mellom </h2> og footer-paragrafens åpnings-tag. Dekker
// body-line + ev. blockquote + closing «Kanskje neste runde»-paragraf.
function mainBodyHtml(html: string): string {
  const m = html.match(
    /<\/h2>\s*([\s\S]*?)\s*<p style="font-size:13px;color:#4A3F30;/,
  );
  if (!m) throw new Error('Main body region not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'spiller@example.com',
  gameName: 'Sommercup 2026',
} satisfies RegistrationRejectedMailParams;

describe('sendRegistrationRejectedMail', () => {
  it('reject-mail uten begrunnelse: ingen blockquote i body', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Søknad til Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Søknad til Sommercup 2026

      Forespørselen din om å bli med i Sommercup 2026 ble dessverre ikke godkjent.

      Kanskje neste runde. Lykke til på banen uansett.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Forespørselen din om å bli med i <strong>Sommercup 2026</strong> ble dessverre ikke godkjent.
                  </p>
                  
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Kanskje neste runde. Lykke til på banen uansett.
                  </p>"
    `);
  });

  it('reject-mail med begrunnelse: blockquote rendres med admin-tekst', async () => {
    const payload = await send({
      ...baseParams,
      reason: 'Fullt opp denne gangen',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Søknad til Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Søknad til Sommercup 2026

      Forespørselen din om å bli med i Sommercup 2026 ble dessverre ikke godkjent.

      Begrunnelse: «Fullt opp denne gangen»

      Kanskje neste runde. Lykke til på banen uansett.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Forespørselen din om å bli med i <strong>Sommercup 2026</strong> ble dessverre ikke godkjent.
                  </p>
                  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">Fullt opp denne gangen</blockquote>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Kanskje neste runde. Lykke til på banen uansett.
                  </p>"
    `);
  });

  it('escaper HTML i gameName og reason', async () => {
    const payload = await send({
      ...baseParams,
      gameName: '<b>X</b>',
      reason: 'Nei & takk',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Søknad til <b>X</b>"`);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Forespørselen din om å bli med i <strong>&lt;b&gt;X&lt;/b&gt;</strong> ble dessverre ikke godkjent.
                  </p>
                  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">Nei &amp; takk</blockquote>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Kanskje neste runde. Lykke til på banen uansett.
                  </p>"
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang (uten reason-grenen).
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template for uten-reason-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="nb">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Søknad til Sommercup 2026</title>
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
                    Søknad ikke godkjent
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Forespørselen din om å bli med i <strong>Sommercup 2026</strong> ble dessverre ikke godkjent.
                  </p>
                  
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Kanskje neste runde. Lykke til på banen uansett.
                  </p>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Spørsmål? Snakk med arrangøren direkte — Tørny formidler ingen meldinger på vegne av admin.
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
