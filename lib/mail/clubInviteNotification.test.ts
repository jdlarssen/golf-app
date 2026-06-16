import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClubInviteNotificationParams } from './clubInviteNotification';

// Approval-style tester: snapshot subject + text + body-line HTML per case.
// Når copy endres: kjør `vitest -u` og review diff-en.
//
// Strategi (speiler inviteNotification.test.ts):
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-line-en (det personlige intro-avsnittet) ekstraheres og
//     snapshot-es for å verifisere personalisering + HTML-escape.
//   - HTML-chrome (header, button, footer) snapshot-es ÉN gang.
//
// Strukturelle Resend-kontrakter (error-propagation, to/from, call-count)
// dekkes av lib/mail/__tests__/resend-contract.test.ts — ikke duplisert her.

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

async function send(params: ClubInviteNotificationParams) {
  const { sendClubInviteNotification } = await import('./clubInviteNotification');
  await sendClubInviteNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Intro-line-paragrafen har styling `margin:0 0 16px;` — den eneste 16px-paragrafen
// med den margin-en i denne malen (login-instruksen har 32px-margin).
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
  clubName: 'Stiklestad Golfklubb',
} satisfies ClubInviteNotificationParams;

describe('sendClubInviteNotification', () => {
  it('norsk: subject + body har klubb-konteksten', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(
      `"Du er invitert til Stiklestad Golfklubb på Tørny"`,
    );
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til Stiklestad Golfklubb på Tørny

      Jørgen har invitert deg til klubben Stiklestad Golfklubb i Tørny.

      Gå til https://tornygolf.no/login, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Da er du medlem med en gang.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(
      `"<strong>Jørgen</strong> har invitert deg til klubben <em>Stiklestad Golfklubb</em> i Tørny."`,
    );
  });

  it('escaper HTML i clubName + invitedByName i body-line', async () => {
    const payload = await send({
      ...baseParams,
      clubName: '<script>alert("x")</script>',
    });
    expect(payload.subject).toMatchInlineSnapshot(
      `"Du er invitert til <script>alert("x")</script> på Tørny"`,
    );
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(
      `"<strong>Jørgen</strong> har invitert deg til klubben <em>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</em> i Tørny."`,
    );
    // Plain-text-grenen bevarer rå-strengen siden den ikke rendres som HTML.
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til <script>alert("x")</script> på Tørny

      Jørgen har invitert deg til klubben <script>alert("x")</script> i Tørny.

      Gå til https://tornygolf.no/login, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Da er du medlem med en gang.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Engelsk (locale: 'en') — Fase M. Beviser at katalog-rendringen flipper
  // subject + text + body til engelsk + /en/-lenke. Chrome er strukturelt
  // locale-identisk, så ingen egen EN-chrome-lås.
  // ─────────────────────────────────────────────────────────────────────

  it('locale en: engelsk klubb-kontekst + /en/-lenke', async () => {
    const payload = await send({ ...baseParams, locale: 'en' });
    expect(payload.subject).toMatchInlineSnapshot(
      `"You're invited to Stiklestad Golfklubb on Tørny"`,
    );
    expect(payload.text).toMatchInlineSnapshot(`
      "You're invited to Stiklestad Golfklubb on Tørny

      Jørgen has invited you to the club Stiklestad Golfklubb on Tørny.

      Go to https://tornygolf.no/en/login, enter this email address, and log in with the code we send you. You'll be a member right away.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(
      `"<strong>Jørgen</strong> has invited you to the club <em>Stiklestad Golfklubb</em> on Tørny."`,
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang (norsk base-case).
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Du er invitert til Stiklestad Golfklubb på Tørny</title>
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
                    Du er invitert til en klubb
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Jørgen</strong> har invitert deg til klubben <em>Stiklestad Golfklubb</em> i Tørny.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 32px;">
                    For å bli med: gå til <a href="https://tornygolf.no/login" style="color:#1B4332;font-weight:600;text-decoration:underline;">tornygolf.no</a>, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Da er du medlem med en gang.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/login" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne Tørny
                    </a>
                  </div>
                  <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Kjenner du ikke Jørgen? Da kan du bare se bort fra denne meldingen.
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
});
