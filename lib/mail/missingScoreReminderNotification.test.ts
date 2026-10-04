import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { MissingScoreReminderNotificationParams } from './missingScoreReminderNotification';

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

async function send(params: MissingScoreReminderNotificationParams) {
  const { sendMissingScoreReminderNotification } = await import(
    './missingScoreReminderNotification'
  );
  await sendMissingScoreReminderNotification(params);
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
  playerFirstName: 'Tore',
  gameName: 'Sommercup 2026',
  gameId: '11111111-1111-1111-1111-111111111111',
  holes: [10],
} satisfies MissingScoreReminderNotificationParams;

describe('sendMissingScoreReminderNotification', () => {
  it('default: one hole, named salutation, link to the hole', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Du mangler slag på hull 10 i Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du mangler slag på hull 10 i Sommercup 2026

      Hei Tore!

      Arrangøren ser at du har ført senere hull i Sommercup 2026, men ikke hull 10. Før slaget nå, så stemmer kortet når du leverer.

      Åpne hull 10: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111/holes/10

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Arrangøren ser at du har ført senere hull i <strong>Sommercup 2026</strong>, men ikke hull 10. Før slaget nå, så stemmer kortet når du leverer."`);
  });

  it('two holes, no name: the list is joined and the link goes to the first', async () => {
    const payload = await send({ ...baseParams, playerFirstName: null, holes: [10, 11] });
    expect(payload.subject).toMatchInlineSnapshot(`"Du mangler slag på hull 10 og 11 i Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du mangler slag på hull 10 og 11 i Sommercup 2026

      Hei!

      Arrangøren ser at du har ført senere hull i Sommercup 2026, men ikke hull 10 og 11. Før slagene nå, så stemmer kortet når du leverer.

      Åpne hull 10: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111/holes/10

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('locale en: English text, plural «holes» and an /en/ link', async () => {
    const payload = await send({ ...baseParams, holes: [10, 11], locale: 'en' });
    expect(payload.subject).toMatchInlineSnapshot(`"You have no score on holes 10 and 11 in Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "You have no score on holes 10 and 11 in Sommercup 2026

      Hi Tore!

      The organiser can see you have scored later holes in Sommercup 2026, but not holes 10 and 11. Enter the score so your card is right when you submit it.

      Open hole 10: https://tornygolf.no/en/games/11111111-1111-1111-1111-111111111111/holes/10

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
  });

  it('escapes HTML in the game name', async () => {
    const payload = await send({ ...baseParams, gameName: 'Cup <b>& co</b>' });
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Arrangøren ser at du har ført senere hull i <strong>Cup &lt;b&gt;&amp; co&lt;/b&gt;</strong>, men ikke hull 10. Før slaget nå, så stemmer kortet når du leverer."`);
  });

  // HTML chrome, locked ONCE. A change to the template shows up here only.
  it('HTML chrome: full template for the default case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Du mangler slag på hull 10 i Sommercup 2026</title>
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
                    Du mangler slag på hull 10
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Tore!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Arrangøren ser at du har ført senere hull i <strong>Sommercup 2026</strong>, men ikke hull 10. Før slaget nå, så stemmer kortet når du leverer.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/games/11111111-1111-1111-1111-111111111111/holes/10" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne hull 10
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi arrangøren sendte deg en påminnelse. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for å føre slag.
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
