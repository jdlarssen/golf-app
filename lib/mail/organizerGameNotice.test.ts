import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { OrganizerGameNoticeParams } from './organizerGameNotice';

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

async function send(params: OrganizerGameNoticeParams) {
  const { sendOrganizerGameNotice } = await import('./organizerGameNotice');
  await sendOrganizerGameNotice(params);
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
  to: 'arrangor@example.com',
  recipientFirstName: 'Kari',
  gameName: 'Sommercup 2026',
  gameId: '11111111-1111-1111-1111-111111111111',
  variant: 'all_delivered',
} satisfies OrganizerGameNoticeParams;

describe('sendOrganizerGameNotice', () => {
  it('all_delivered: «Alle har levert», link to the finish page', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Alle har levert i Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Alle har levert i Sommercup 2026

      Hei Kari!

      Alle scorekortene i Sommercup 2026 er levert. Avslutt spillet, så får spillerne resultatlista.

      Avslutt spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111/avslutt

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Alle scorekortene i <strong>Sommercup 2026</strong> er levert. Avslutt spillet, så får spillerne resultatlista."`);
  });

  it('stale, no name: says neither who is missing nor that everyone is in', async () => {
    const payload = await send({ ...baseParams, variant: 'stale', recipientFirstName: null });
    expect(payload.subject).toMatchInlineSnapshot(`"Sommercup 2026 står stille"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Sommercup 2026 står stille

      Hei!

      Det har ikke kommet nye slag i Sommercup 2026 på et døgn. Avslutt spillet når du er klar, så får spillerne resultatlista.

      Avslutt spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111/avslutt

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Det har ikke kommet nye slag i <strong>Sommercup 2026</strong> på et døgn. Avslutt spillet når du er klar, så får spillerne resultatlista."`);
  });

  it('locale en: English text and an /en/ link, both variants', async () => {
    const allIn = await send({ ...baseParams, locale: 'en' });
    expect(allIn.subject).toMatchInlineSnapshot(`"Everyone has delivered in Sommercup 2026"`);
    expect(allIn.text).toMatchInlineSnapshot(`
      "Everyone has delivered in Sommercup 2026

      Hi Kari!

      Every scorecard in Sommercup 2026 is in. Finish the game, and the players get the results.

      Finish the game: https://tornygolf.no/en/games/11111111-1111-1111-1111-111111111111/avslutt

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    sendMock.mockClear();
    const stale = await send({ ...baseParams, variant: 'stale', locale: 'en' });
    expect(stale.subject).toMatchInlineSnapshot(`"Sommercup 2026 has stood still"`);
    expect(bodyLineHtml(stale.html)).toMatchInlineSnapshot(`"There have been no new scores in <strong>Sommercup 2026</strong> for a day. Finish the game when you are ready, and the players get the results."`);
  });

  it('escapes HTML in the game name', async () => {
    const payload = await send({ ...baseParams, gameName: 'Cup <b>& co</b>' });
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Alle scorekortene i <strong>Cup &lt;b&gt;&amp; co&lt;/b&gt;</strong> er levert. Avslutt spillet, så får spillerne resultatlista."`);
  });

  // HTML chrome, locked ONCE. A change to the template shows up here only.
  it('HTML chrome: full template for the default case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Alle har levert i Sommercup 2026</title>
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
                    Alle har levert
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Kari!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Alle scorekortene i <strong>Sommercup 2026</strong> er levert. Avslutt spillet, så får spillerne resultatlista.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/games/11111111-1111-1111-1111-111111111111/avslutt" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Avslutt spillet
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du arrangerer spillet. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for å avslutte det.
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
