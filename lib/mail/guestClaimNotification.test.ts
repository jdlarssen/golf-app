import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { GuestClaimNotificationParams } from './guestClaimNotification';

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

async function send(params: GuestClaimNotificationParams) {
  const { sendGuestClaimNotification } = await import('./guestClaimNotification');
  await sendGuestClaimNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Body-linja (arrangør + spill) har unik styling (margin:0 0 24px) som skiller
// den fra salutation (margin:0 0 16px) og footer. Første match er body-linja;
// claim-linja under deler styling men kommer etter.
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 24px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'kari@example.com',
  guestFirstName: 'Kari',
  invitedByName: 'Jørgen',
  gameName: 'Sommercup 2026',
} satisfies GuestClaimNotificationParams;

describe('sendGuestClaimNotification', () => {
  it('default: personlig salutation + arrangør og spill i body + login-lenke', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet ditt fra Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet ditt fra Sommercup 2026

      Hei Kari!

      Jørgen la deg inn som gjest i Sommercup 2026. Runden er ferdig, og scorekortet ditt ligger klart på en egen Tørny-konto.

      Logg inn med denne e-postadressen, så er kontoen din. Du får en engangskode på mail i stedet for passord.

      Logg inn: https://tornygolf.no/login

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> la deg inn som gjest i <strong>Sommercup 2026</strong>. Runden er ferdig, og scorekortet ditt ligger klart på en egen Tørny-konto."`);
  });

  it('guestFirstName: null → nøytral «Hei!»-salutation', async () => {
    const payload = await send({ ...baseParams, guestFirstName: null });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet ditt fra Sommercup 2026

      Hei!

      Jørgen la deg inn som gjest i Sommercup 2026. Runden er ferdig, og scorekortet ditt ligger klart på en egen Tørny-konto.

      Logg inn med denne e-postadressen, så er kontoen din. Du får en engangskode på mail i stedet for passord.

      Logg inn: https://tornygolf.no/login

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('escaper HTML-spesialtegn i spill-navn og arrangør-navn', async () => {
    const payload = await send({
      ...baseParams,
      invitedByName: 'A & B',
      gameName: 'Cup "2026" <b>',
    });
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>A &amp; B</strong> la deg inn som gjest i <strong>Cup &quot;2026&quot; &lt;b&gt;</strong>. Runden er ferdig, og scorekortet ditt ligger klart på en egen Tørny-konto."`);
  });

  // HTML chrome — låses ÉN gang. Endres chrome-mal-en må snapshot-en
  // oppdateres bevisst (vitest -u + review).
  it('HTML chrome: full template for default-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Resultatet ditt fra Sommercup 2026</title>
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
                    Runden er i boks
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Kari!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    <strong>Jørgen</strong> la deg inn som gjest i <strong>Sommercup 2026</strong>. Runden er ferdig, og scorekortet ditt ligger klart på en egen Tørny-konto.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Logg inn med denne e-postadressen, så er kontoen din. Du får en engangskode på mail i stedet for passord.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/login" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne Tørny
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne mailen fordi Jørgen la deg til som gjest i en runde på Tørny. Er ikke dette deg, kan du se bort fra den.
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
    expect(payload.subject).toMatchInlineSnapshot(`"Your result from Sommercup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Your result from Sommercup 2026

      Hi Kari!

      Jørgen added you as a guest in Sommercup 2026. The round is finished, and your scorecard is waiting on a Tørny account of your own.

      Log in with this email address and the account is yours. You'll get a one-time code by email instead of a password.

      Log in: https://tornygolf.no/en/login

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
  });
});
