import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { ScorecardSubmittedNotificationParams } from './scorecardSubmittedNotification';

// Approval-style tester (Type B, se lib/mail/AGENTS.md): snapshot subject +
// text + body-line-HTML per case. Chrome låses ÉN gang på default-casen.
// Strukturell Resend-kontrakt (error/from/call-count) ligger i
// __tests__/resend-contract.test.ts, ikke her.

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

async function send(params: ScorecardSubmittedNotificationParams) {
  const { sendScorecardSubmittedNotification } = await import(
    './scorecardSubmittedNotification'
  );
  await sendScorecardSubmittedNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Body-line-paragrafen har unik styling (margin:0 0 24px) som skiller den fra
// salutation (margin:0 0 16px) og footer. Henter ut innerHTML for å
// snapshot-e personaliserings-markup uten chrome.
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 24px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'admin@example.com',
  adminFirstName: 'Jørgen',
  playerName: 'Per Spiller',
  gameName: 'Sommercup 2026',
  gameId: '11111111-1111-1111-1111-111111111111',
} satisfies ScorecardSubmittedNotificationParams;

describe('sendScorecardSubmittedNotification', () => {
  it('default: personlig salutation + spiller/spill-navn i body', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Scorekort levert: Per Spiller i Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Scorekort levert: Per Spiller i Sommercup 2026

      Hei Jørgen!

      Per Spiller har levert scorekortet sitt i Sommercup 2026. Du kan godkjenne det i admin-flaten.

      Åpne admin: https://tornygolf.no/admin/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Per Spiller</strong> har levert scorekortet sitt i <strong>Sommercup 2026</strong>. Du kan godkjenne det i admin-flaten."`);
  });

  it('adminFirstName: null → nøytral «Hei!»-salutation', async () => {
    const payload = await send({ ...baseParams, adminFirstName: null });
    expect(payload.text).toMatchInlineSnapshot(`
      "Scorekort levert: Per Spiller i Sommercup 2026

      Hei!

      Per Spiller har levert scorekortet sitt i Sommercup 2026. Du kan godkjenne det i admin-flaten.

      Åpne admin: https://tornygolf.no/admin/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('escaper HTML-spesialtegn i spiller- og spill-navn', async () => {
    const payload = await send({
      ...baseParams,
      playerName: 'Per & <Co>',
      gameName: 'Cup "2026" <b>',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Scorekort levert: Per & <Co> i Cup "2026" <b>"`);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Per &amp; &lt;Co&gt;</strong> har levert scorekortet sitt i <strong>Cup &quot;2026&quot; &lt;b&gt;</strong>. Du kan godkjenne det i admin-flaten."`);
  });

  // HTML chrome — låses ÉN gang. Endres chrome-mal-en må snapshot-en
  // oppdateres bevisst (vitest -u + review).
  it('HTML chrome: full template for default-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="nb">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Scorekort levert: Per Spiller i Sommercup 2026</title>
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
                    Scorekort levert
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Jørgen!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    <strong>Per Spiller</strong> har levert scorekortet sitt i <strong>Sommercup 2026</strong>. Du kan godkjenne det i admin-flaten.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/admin/games/11111111-1111-1111-1111-111111111111" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne admin
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du er admin for spillet. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for full oversikt.
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
