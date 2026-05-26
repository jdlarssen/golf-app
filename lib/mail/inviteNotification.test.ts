import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InviteNotificationParams } from './inviteNotification';

// Approval-style tester: snapshot subject + text + body-line HTML per case.
// Når copy endres: kjør `vitest -u` og review diff-en.
//
// Strategi:
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-line-en (det personlige intro-avsnittet) ekstraheres og
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

async function send(params: InviteNotificationParams) {
  const { sendInviteNotification } = await import('./inviteNotification');
  await sendInviteNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Intro-line-paragrafen har styling `margin:0 0 16px;` — det er TO paragrafer
// med 16px font-size i denne malen, intro (16px-margin) og login-instruks
// (32px-margin). Vi matcher første (intro) ved å låse på 16px-margin.
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 16px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'venn@example.com',
  invitedByName: 'Jørgen',
} satisfies InviteNotificationParams;

describe('sendInviteNotification', () => {
  it('uten gameName: generisk «Du er invitert til Tørny»-copy', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til Tørny"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til Tørny

      Jørgen har invitert deg til en golf-turnering i Tørny.

      Gå til https://tornygolf.no/login, skriv inn denne e-posten, og logg inn med koden du får tilsendt.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> har invitert deg til en golf-turnering i Tørny."`);
  });

  it('med gameName: subject + body har spill-konteksten', async () => {
    const payload = await send({
      ...baseParams,
      gameName: 'Stiklestad 25. mai',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til Stiklestad 25. mai på Tørny"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til Stiklestad 25. mai på Tørny

      Jørgen har invitert deg til spillet Stiklestad 25. mai på Tørny.

      Gå til https://tornygolf.no/login, skriv inn denne e-posten, og logg inn med koden du får tilsendt.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> har invitert deg til spillet <em>Stiklestad 25. mai</em> på Tørny."`);
  });

  it('escaper HTML i gameName + invitedByName i body-line', async () => {
    const payload = await send({
      ...baseParams,
      gameName: '<script>alert("x")</script>',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til <script>alert("x")</script> på Tørny"`);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> har invitert deg til spillet <em>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</em> på Tørny."`);
    // Plain-text-grenen bevarer rå-strengen siden den ikke rendres som HTML.
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til <script>alert("x")</script> på Tørny

      Jørgen har invitert deg til spillet <script>alert("x")</script> på Tørny.

      Gå til https://tornygolf.no/login, skriv inn denne e-posten, og logg inn med koden du får tilsendt.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang (uten gameName-grenen).
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template for uten-gameName-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="nb">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Du er invitert til Tørny</title>
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
                    Du er invitert
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Jørgen</strong> har invitert deg til en golf-turnering i Tørny.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 32px;">
                    For å komme i gang: gå til
                    <a href="https://tornygolf.no/login" style="color:#1B4332;font-weight:600;text-decoration:underline;">tornygolf.no</a>,
                    skriv inn denne e-posten, og logg inn med koden du får tilsendt.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/login" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne Tørny
                    </a>
                  </div>
                  <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Har du ikke en golfvenn ved navn Jørgen? Ignorer denne meldingen.
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
    const { sendInviteNotification } = await import('./inviteNotification');
    await expect(
      sendInviteNotification(baseParams),
    ).rejects.toThrow(/Resend send failed/);
  });

  it('sender til mottakeren med korrekt avsender + ett kall per call', async () => {
    await send(baseParams);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.to).toBe('venn@example.com');
    expect(payload.from).toBe('Tørny <noreply@tornygolf.no>');
  });
});
