import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContentReportNotificationParams } from './contentReportNotification';

// Type B (docs/test-discipline.md): subject + text per case, the HTML chrome
// once. Copy changes: run `vitest -u` and review the diff.

type SendArgs = [{ from: string; to: string; subject: string; html: string; text: string }];
const sendMock = vi.fn<(...args: SendArgs) => Promise<{ data: { id: string } | null; error: null }>>(
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

async function send(params: ContentReportNotificationParams) {
  const { sendContentReportNotification } = await import('./contentReportNotification');
  await sendContentReportNotification(params);
  return sendMock.mock.calls[0]![0];
}

const BASE: ContentReportNotificationParams = {
  to: 'admin@example.com',
  adminFirstName: 'Sara',
  reporterName: 'Marte Lien',
  kind: 'game',
  target: 'Lørdagsrunden',
  reason: 'offensive',
  note: 'Taperpremien heter noe stygt.',
  locale: 'no',
};

describe('sendContentReportNotification', () => {
  it('a round, with the reporter\'s words (nb)', async () => {
    const mail = await send(BASE);
    expect(mail.subject).toMatchInlineSnapshot(`"Ny rapport: Lørdagsrunden"`);
    expect(mail.text).toMatchInlineSnapshot(`
      "Ny rapport: Lørdagsrunden

      Hei Sara!

      Marte Lien har rapportert runden Lørdagsrunden.

      Grunn: støtende navn eller tekst

      «Taperpremien heter noe stygt.»

      Vi har lovet å se på rapporten innen 24 timer.

      Se rapporten i admin: https://tornygolf.no/admin/rapporter

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('a player, without words (en)', async () => {
    const mail = await send({
      ...BASE,
      kind: 'user',
      target: 'Kristian Holm',
      reason: 'harassment',
      note: null,
      adminFirstName: null,
      locale: 'en',
    });
    expect(mail.subject).toMatchInlineSnapshot(`"New report: Kristian Holm"`);
    expect(mail.text).toMatchInlineSnapshot(`
      "New report: Kristian Holm

      Hi!

      Marte Lien has reported the player Kristian Holm.

      Reason: harassment

      We have promised to look at the report within 24 hours.

      View the report in admin: https://tornygolf.no/en/admin/rapporter

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
  });

  it('escapes the reporter\'s words in the HTML', async () => {
    const mail = await send({ ...BASE, note: '<b>hei</b>' });
    expect(mail.html).not.toContain('<b>hei</b>');
    expect(mail.html).toContain('&lt;b&gt;hei&lt;/b&gt;');
  });

  it('HTML chrome', async () => {
    const mail = await send(BASE);
    expect(mail.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Ny rapport: Lørdagsrunden</title>
      </head>
      <body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A2E1F;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
          <tr>
            <td align="center" style="padding:48px 16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
                <tr><td>
                  <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
                    <img src="https://tornygolf.no/brand/wordmark-mail@2x.png" width="88" height="40" alt="Tørny" style="display:block;width:88px;height:40px;border:0;outline:none;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:40px;color:#1B4332;">
                  </h1>
                  <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
                    Fyr opp golfturneringen på et par minutter.
                  </p>
                  <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A2E1F;font-weight:500;">
                    En spiller har sagt fra
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Sara!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Marte Lien</strong> har rapportert runden <strong>Lørdagsrunden</strong>.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Grunn: støtende navn eller tekst
                  </p>
                  <p style="font-size:15px;line-height:1.6;margin:0 0 16px;background:#F0EDE5;border-radius:8px;padding:16px;color:#1A2E1F;">
                    «Taperpremien heter noe stygt.»
                  </p>
                  <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#4A3F30;">
                    Vi har lovet å se på rapporten innen 24 timer.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/admin/rapporter" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:9999px;font-weight:600;font-size:15px;">
                      Se rapporten i admin
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E5E0D3;padding-top:24px;">
                    Du får denne meldingen fordi du er admin. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for full oversikt.
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
