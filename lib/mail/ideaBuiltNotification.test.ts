import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { IdeaBuiltNotificationParams } from './ideaBuiltNotification';
import { APP_BASE_URL } from './i18n';

// Approval-style tester (Type B, se lib/mail/AGENTS.md): snapshot subject +
// text + brødtekst-regionen per case, chrome låses ÉN gang. Strukturell
// Resend-kontrakt ligger i __tests__/resend-contract.test.ts.

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

async function send(params: IdeaBuiltNotificationParams) {
  const { sendIdeaBuiltNotification } = await import('./ideaBuiltNotification');
  await sendIdeaBuiltNotification(params);
  return sendMock.mock.calls[0]![0];
}

/** Heading through the button: the part that changes per case. */
function mainBodyHtml(html: string): string {
  const start = html.indexOf('<h2 ');
  const end = html.indexOf('</div>', start);
  return html.slice(start, end + '</div>'.length);
}

const baseParams = {
  to: 'spiller@example.com',
  name: 'Per',
  locale: 'no',
  summary: 'Ryder Cup-oppsettet er klart',
  link: null,
} satisfies IdeaBuiltNotificationParams;

describe('sendIdeaBuiltNotification', () => {
  it('med lenke: knappen går dit, og lenka escapes i href', async () => {
    const payload = await send({ ...baseParams, link: '/cup"x' });
    expect(payload.html).toContain(`href="${APP_BASE_URL}/cup&quot;x"`);
    expect(payload.subject).toMatchInlineSnapshot(`"Vi bygde det du foreslo"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Vi bygde det du foreslo

      Hei Per!

      Dette er nytt: Ryder Cup-oppsettet er klart

      Idéen din er nå en del av Tørny. Takk for at du tok deg tid til å si fra. Det er akkurat slik appen blir bedre.

      Se hva som er nytt: https://tornygolf.no/cup"x

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
                    Vi bygde det!
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Per!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Dette er nytt: Ryder Cup-oppsettet er klart
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Idéen din er nå en del av Tørny. Takk for at du tok deg tid til å si fra. Det er akkurat slik appen blir bedre.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/cup&quot;x" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Se hva som er nytt
                    </a>
                  </div>"
    `);
  });

  it('uten lenke: knappen går til forsiden', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Vi bygde det du foreslo"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Vi bygde det du foreslo

      Hei Per!

      Dette er nytt: Ryder Cup-oppsettet er klart

      Idéen din er nå en del av Tørny. Takk for at du tok deg tid til å si fra. Det er akkurat slik appen blir bedre.

      Se hva som er nytt: https://tornygolf.no

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
                    Vi bygde det!
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Per!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Dette er nytt: Ryder Cup-oppsettet er klart
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Idéen din er nå en del av Tørny. Takk for at du tok deg tid til å si fra. Det er akkurat slik appen blir bedre.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Se hva som er nytt
                    </a>
                  </div>"
    `);
  });

  it('locale en: engelsk tekst og /en/-lenke', async () => {
    const payload = await send({ ...baseParams, locale: 'en', link: '/spillformater' });
    expect(payload.subject).toMatchInlineSnapshot(`"We built what you suggested"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "We built what you suggested

      Hi Per!

      Here's what's new: Ryder Cup-oppsettet er klart

      Your idea is now part of Tørny. Thanks for taking the time to tell us. That's exactly how the app gets better.

      See what's new: https://tornygolf.no/en/spillformater

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
                    We built it!
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hi Per!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Here&#39;s what&#39;s new: Ryder Cup-oppsettet er klart
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Your idea is now part of Tørny. Thanks for taking the time to tell us. That&#39;s exactly how the app gets better.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/en/spillformater" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      See what's new
                    </a>
                  </div>"
    `);
  });

  it('HTML chrome: full template for default-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Vi bygde det du foreslo</title>
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
                    Vi bygde det!
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Per!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Dette er nytt: Ryder Cup-oppsettet er klart
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Idéen din er nå en del av Tørny. Takk for at du tok deg tid til å si fra. Det er akkurat slik appen blir bedre.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Se hva som er nytt
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du sendte inn en idé. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for å se hva som skjer.
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
