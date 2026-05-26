import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegistrationRequestMailParams } from './registrationRequest';

// Approval-style tester: snapshot subject + text + body-content HTML per case.
// Når copy endres: kjør `vitest -u` og review diff-en.
//
// Strategi:
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-content (regionen mellom <h2> og CTA-button-div) ekstraheres
//     og snapshot-es per case. Fanger body-line + blockquote-tilstedeværelse/
//     -fravær i ett snapshot.
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

async function send(params: RegistrationRequestMailParams) {
  const { sendRegistrationRequestMail } = await import(
    './registrationRequest'
  );
  await sendRegistrationRequestMail(params);
  return sendMock.mock.calls[0]![0];
}

// Henter ut alt mellom </h2> og CTA-button-div-en. Dekker body-line +
// ev. blockquote.
function mainBodyHtml(html: string): string {
  const m = html.match(
    /<\/h2>\s*([\s\S]*?)\s*<div style="margin:32px 0;">/,
  );
  if (!m) throw new Error('Main body region not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'admin@example.com',
  gameName: 'Sommercup 2026',
  gameShortId: 'abc12345',
  requesterName: 'Per Spiller',
} satisfies RegistrationRequestMailParams;

describe('sendRegistrationRequestMail', () => {
  it('forespørsel uten hilsen: ingen blockquote i body', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Ny påmelding til Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Ny påmelding til Sommercup 2026

      Per Spiller vil bli med i Sommercup 2026.

      Gå til påmeldinger: https://tornygolf.no/signup/abc12345

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Per Spiller</strong> vil bli med i <em>Sommercup 2026</em>.
                  </p>"
    `);
  });

  it('forespørsel med hilsen: blockquote rendres med søker-tekst', async () => {
    const payload = await send({
      ...baseParams,
      message: 'Slipp meg inn, takk',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Ny påmelding til Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Ny påmelding til Sommercup 2026

      Per Spiller vil bli med i Sommercup 2026.

      «Slipp meg inn, takk»

      Gå til påmeldinger: https://tornygolf.no/signup/abc12345

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Per Spiller</strong> vil bli med i <em>Sommercup 2026</em>.
                  </p>
                  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">Slipp meg inn, takk</blockquote>"
    `);
  });

  it('escaper HTML i requesterName og gameName', async () => {
    const payload = await send({
      ...baseParams,
      gameName: '<script>alert(1)</script>',
      requesterName: 'Per & Pål',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Ny påmelding til <script>alert(1)</script>"`);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Per &amp; Pål</strong> vil bli med i <em>&lt;script&gt;alert(1)&lt;/script&gt;</em>.
                  </p>"
    `);
    expect(payload.text).toMatchInlineSnapshot(`
      "Ny påmelding til <script>alert(1)</script>

      Per & Pål vil bli med i <script>alert(1)</script>.

      Gå til påmeldinger: https://tornygolf.no/signup/abc12345

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang (uten message-grenen).
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template for uten-message-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="nb">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Ny påmelding til Sommercup 2026</title>
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
                    Ny påmelding venter
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Per Spiller</strong> vil bli med i <em>Sommercup 2026</em>.
                  </p>
                  
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/signup/abc12345" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Gå til påmeldinger
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du er arrangør for spillet. Du kan godkjenne eller avslå forespørselen fra Sekretariatet.
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
  // Strukturelle tester (ikke approval-basert) — kontrakt mot Resend.
  // ─────────────────────────────────────────────────────────────────────

  it('kaster når Resend returnerer feil', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate-limited' },
    });
    const { sendRegistrationRequestMail } = await import(
      './registrationRequest'
    );
    await expect(
      sendRegistrationRequestMail(baseParams),
    ).rejects.toThrow(/Resend send failed/);
  });

  it('sender til mottakeren med korrekt avsender + ett kall per call', async () => {
    await send(baseParams);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.to).toBe('admin@example.com');
    expect(payload.from).toBe('Tørny <noreply@tornygolf.no>');
  });
});
