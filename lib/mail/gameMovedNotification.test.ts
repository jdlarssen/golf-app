import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { GameMovedNotificationParams } from './gameMovedNotification';

// Approval-style tests (Type B, see lib/mail/AGENTS.md): snapshot subject +
// text + body-line HTML per case. The chrome is locked ONCE, on the default
// case. The structural Resend contract lives in __tests__/resend-contract.test.ts.

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

async function send(params: GameMovedNotificationParams) {
  const { sendGameMovedNotification } = await import('./gameMovedNotification');
  await sendGameMovedNotification(params);
  return sendMock.mock.calls[0]![0];
}

// The body-line paragraph has unique styling (margin:0 0 24px).
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 24px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'spiller@example.com',
  recipientFirstName: 'Marte',
  gameName: 'Lørdagsrunden',
  gameId: '11111111-1111-1111-1111-111111111111',
  teeOffAt: '2026-10-04T07:00:00.000Z',
  courseChanged: false,
} satisfies GameMovedNotificationParams;

describe('sendGameMovedNotification', () => {
  it('new time in Oslo, same course and tees, link to the game', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Lørdagsrunden er flyttet"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Lørdagsrunden er flyttet

      Hei Marte!

      Lørdagsrunden har fått ny tid: søndag 4. okt. kl. 09:00. Samme bane og tee.

      Se runden: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Lørdagsrunden</strong> har fått ny tid: søndag 4. okt. kl. 09:00. Samme bane og tee."`);
  });

  it('course or tee changed too, no name', async () => {
    const payload = await send({ ...baseParams, courseChanged: true, recipientFirstName: null });
    expect(payload.text).toMatchInlineSnapshot(`
      "Lørdagsrunden er flyttet

      Hei!

      Lørdagsrunden har fått ny tid: søndag 4. okt. kl. 09:00. Bane eller tee er også endret.

      Se runden: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Lørdagsrunden</strong> har fått ny tid: søndag 4. okt. kl. 09:00. Bane eller tee er også endret."`);
  });

  it('English recipient, after the clock change', async () => {
    const payload = await send({ ...baseParams, locale: 'en', teeOffAt: '2026-11-08T08:00:00.000Z' });
    expect(payload.subject).toMatchInlineSnapshot(`"Lørdagsrunden has moved"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Lørdagsrunden has moved

      Hi Marte!

      Lørdagsrunden has a new time: Sunday, Nov 8 at 09:00. Same course and tees.

      See the round: https://tornygolf.no/en/games/11111111-1111-1111-1111-111111111111

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
  });

  // HTML chrome, locked ONCE. A change to the template shows up here only.
  it('HTML chrome: full template for the default case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Lørdagsrunden er flyttet</title>
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
                    Runden er flyttet
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Marte!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    <strong>Lørdagsrunden</strong> har fått ny tid: søndag 4. okt. kl. 09:00. Samme bane og tee.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/games/11111111-1111-1111-1111-111111111111" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Se runden
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du er med i spillet. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for å se det.
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
