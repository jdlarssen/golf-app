import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { PaymentReminderNotificationParams } from './paymentReminderNotification';

// Approval-style tester (Type B, se lib/mail/AGENTS.md): snapshot subject +
// text per case (fanger den betingede betalingsmåte-linja), chrome låses ÉN
// gang. Strukturell Resend-kontrakt ligger i __tests__/resend-contract.test.ts.

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

async function send(params: PaymentReminderNotificationParams) {
  const { sendPaymentReminderNotification } = await import(
    './paymentReminderNotification'
  );
  await sendPaymentReminderNotification(params);
  return sendMock.mock.calls[0]![0];
}

const baseParams = {
  to: 'spiller@example.com',
  playerFirstName: 'Per',
  gameName: 'Sommercup 2026',
  gameId: '11111111-1111-1111-1111-111111111111',
  entryFeeKr: 200,
  paymentLink: '12345',
} satisfies PaymentReminderNotificationParams;

describe('sendPaymentReminderNotification', () => {
  it('default: Vipps-nummer + beløp + spill-navn', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Startkontingent — Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Startkontingent — Sommercup 2026

      Hei Per!

      Du mangler å betale startkontingenten på 200 kr for Sommercup 2026.

      Betal med Vipps til 12345.

      Åpne spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('playerFirstName: null → nøytral salutation', async () => {
    const payload = await send({ ...baseParams, playerFirstName: null });
    expect(payload.text).toMatchInlineSnapshot(`
      "Startkontingent — Sommercup 2026

      Hei!

      Du mangler å betale startkontingenten på 200 kr for Sommercup 2026.

      Betal med Vipps til 12345.

      Åpne spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('payment_link som URL → «Betal her»-lenke', async () => {
    const payload = await send({
      ...baseParams,
      paymentLink: 'https://vipps.no/pay/abc',
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Startkontingent — Sommercup 2026

      Hei Per!

      Du mangler å betale startkontingenten på 200 kr for Sommercup 2026.

      Betal her: https://vipps.no/pay/abc

      Åpne spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('payment_link null → «avtal med arrangøren»', async () => {
    const payload = await send({ ...baseParams, paymentLink: null });
    expect(payload.text).toMatchInlineSnapshot(`
      "Startkontingent — Sommercup 2026

      Hei Per!

      Du mangler å betale startkontingenten på 200 kr for Sommercup 2026.

      Avtal betaling med arrangøren.

      Åpne spillet: https://tornygolf.no/games/11111111-1111-1111-1111-111111111111

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('escaper HTML-spesialtegn i spill-navn', async () => {
    const payload = await send({ ...baseParams, gameName: 'Cup "2026" <b>' });
    expect(payload.subject).toMatchInlineSnapshot(`"Startkontingent — Cup "2026" <b>"`);
  });

  it('HTML chrome: full template for default-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Startkontingent — Sommercup 2026</title>
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
                    Husk startkontingenten
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Per!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Du mangler å betale startkontingenten på <strong>200 kr</strong> for Sommercup 2026.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Betal med Vipps til 12345.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/games/11111111-1111-1111-1111-111111111111" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne spillet
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du er påmeldt spillet. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a>.
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

  it('locale en: engelsk subject + body + /en/-lenke', async () => {
    const payload = await send({ ...baseParams, locale: 'en' });
    expect(payload.subject).toMatchInlineSnapshot(`"Entry fee — Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Entry fee — Sommercup 2026

      Hi Per!

      You still owe the 200 kr entry fee for Sommercup 2026.

      Pay with Vipps to 12345.

      Open the game: https://tornygolf.no/en/games/11111111-1111-1111-1111-111111111111

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
  });
});
