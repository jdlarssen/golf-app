import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { GameCancelledNotificationParams } from './gameCancelledNotification';

// #2481: the mail a player gets when the organiser cancels a scheduled round
// with «Avlys og si fra». Approval-style per lib/mail/AGENTS.md: subject +
// text + the body region per case, the HTML chrome locked once.

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

async function send(params: GameCancelledNotificationParams) {
  const { sendGameCancelledNotification } = await import('./gameCancelledNotification');
  await sendGameCancelledNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Everything between </h2> and the footer paragraph: salutation, body line,
// and the greeting when there is one.
function mainBodyHtml(html: string): string {
  const m = html.match(/<\/h2>\s*([\s\S]*?)\s*<p style="font-size:13px;color:#4A3F30;line-height/);
  if (!m) throw new Error('Main body region not found in HTML');
  return m[1].trim();
}

// 07:00 UTC is 09:00 in Oslo in October (summer time).
const baseParams = {
  to: 'spiller@example.com',
  playerFirstName: 'Marte',
  gameName: 'Lørdagsrunden',
  teeOffAt: '2026-10-03T07:00:00.000Z',
  courseName: 'Byneset North',
  organizerName: 'Jørgen',
} satisfies GameCancelledNotificationParams;

describe('sendGameCancelledNotification', () => {
  it('with a greeting: the round, when it was set for, and the greeting', async () => {
    const payload = await send({
      ...baseParams,
      message: 'Banen er stengt på grunn av frost.\nVi prøver igjen neste lørdag.',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Lørdagsrunden er avlyst"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Lørdagsrunden er avlyst

      Hei Marte!

      Jørgen har avlyst Lørdagsrunden. Runden var satt opp lørdag 3. oktober kl. 09:00 på Byneset North.

      Hilsen fra Jørgen: «Banen er stengt på grunn av frost.
      Vi prøver igjen neste lørdag.»

      Du får denne meldingen fordi du var med i spillet.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Marte!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Jørgen har avlyst <strong>Lørdagsrunden</strong>. Runden var satt opp lørdag 3. oktober kl. 09:00 på Byneset North.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hilsen fra Jørgen:
                  </p>
                  <blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">Banen er stengt på grunn av frost.<br>Vi prøver igjen neste lørdag.</blockquote>"
    `);
  });

  it('without a greeting, a start time, a course or names', async () => {
    const payload = await send({
      ...baseParams,
      playerFirstName: null,
      teeOffAt: null,
      courseName: null,
      organizerName: null,
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Lørdagsrunden er avlyst

      Hei!

      Arrangøren har avlyst Lørdagsrunden.

      Du får denne meldingen fordi du var med i spillet.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Arrangøren har avlyst <strong>Lørdagsrunden</strong>.
                  </p>"
    `);
  });

  it('a start time without a course', async () => {
    const payload = await send({ ...baseParams, courseName: null });
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Marte!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Jørgen har avlyst <strong>Lørdagsrunden</strong>. Runden var satt opp lørdag 3. oktober kl. 09:00.
                  </p>"
    `);
  });

  it('escapes HTML in the game name, the course and the greeting', async () => {
    const payload = await send({
      ...baseParams,
      gameName: '<b>X</b>',
      courseName: 'Bane & Co',
      message: 'Nei <takk>',
    });
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Marte!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Jørgen har avlyst <strong>&lt;b&gt;X&lt;/b&gt;</strong>. Runden var satt opp lørdag 3. oktober kl. 09:00 på Bane &amp; Co.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
                    Hilsen fra Jørgen:
                  </p>
                  <blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">Nei &lt;takk&gt;</blockquote>"
    `);
  });

  it('in English', async () => {
    const payload = await send({ ...baseParams, locale: 'en', message: 'The course is closed.' });
    expect(payload.subject).toMatchInlineSnapshot(`"Lørdagsrunden has been cancelled"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Lørdagsrunden has been cancelled

      Hi Marte!

      Jørgen has cancelled Lørdagsrunden. It was set for Saturday, October 3 at 09:00 at Byneset North.

      A note from Jørgen: “The course is closed.”

      You are getting this because you were in the game.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — locked ONCE (the case without a greeting).
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Lørdagsrunden er avlyst</title>
      </head>
      <body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1813;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
          <tr>
            <td align="center" style="padding:48px 16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
                <tr><td>
                  <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
                    <img src="https://tornygolf.no/brand/wordmark-mail@2x.png" width="88" height="40" alt="Tørny" style="display:block;width:88px;height:40px;border:0;outline:none;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:40px;color:#1B4332;">
                  </h1>
                  <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
                    Fyr opp golfturneringen på et par minutter.
                  </p>
                  <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
                    Runden er avlyst
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Marte!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Jørgen har avlyst <strong>Lørdagsrunden</strong>. Runden var satt opp lørdag 3. oktober kl. 09:00 på Byneset North.
                  </p>
                  
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du var med i spillet.
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
