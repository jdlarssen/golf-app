import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { CupStartedNotificationParams } from './cupStartedNotification';

// Approval-style tester (Type B, se lib/mail/AGENTS.md): snapshot subject +
// text + body-HTML per case. Chrome låses ÉN gang på default-casen.
// Strukturell Resend-kontrakt ligger i __tests__/resend-contract.test.ts.

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

async function send(params: CupStartedNotificationParams) {
  const { sendCupStartedNotification } = await import('./cupStartedNotification');
  await sendCupStartedNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Cup-started har salutation i <h2> og to body-paragrafer (margin:0 0 16px).
// Henter ut begge body-paragrafene (lag-oppstilling + point-til-seier) joined
// for å snapshot-e personaliserings-markup uten chrome. Salutation dekkes av
// text-snapshot-en.
function bodyHtml(html: string): string {
  const matches = [
    ...html.matchAll(
      /<p style="font-size:16px;line-height:1\.5;margin:0 0 16px;">\s*([\s\S]*?)\s*<\/p>/g,
    ),
  ];
  if (matches.length === 0) throw new Error('Body paragraphs not found in HTML');
  return matches.map((m) => m[1].trim()).join('\n');
}

const baseParams = {
  to: 'spiller@example.com',
  playerFirstName: 'Per',
  tournamentName: 'Høst-cup 2026',
  tournamentId: '22222222-2222-2222-2222-222222222222',
  team1Name: 'Bjørketrærne',
  team2Name: 'Granskogen',
  pointsToWin: 10,
} satisfies CupStartedNotificationParams;

describe('sendCupStartedNotification', () => {
  it('default: personlig salutation + lag-oppstilling + heltall-point', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Cup-en har startet — Høst-cup 2026"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Hei Per!

      Cup-en "Høst-cup 2026" har startet.

      Bjørketrærne møter Granskogen. Først til 10 point vinner.

      Åpne leaderboard: https://tornygolf.no/cup/22222222-2222-2222-2222-222222222222

      Lykke til på banen!
      "
    `);
    expect(bodyHtml(payload.html)).toMatchInlineSnapshot(`
      "Cup-en <strong>Høst-cup 2026</strong> har startet.
      <strong>Bjørketrærne</strong> møter <strong>Granskogen</strong>.
                    Først til <strong>10</strong> point vinner."
    `);
  });

  it('playerFirstName: null → nøytral «Hei!»-salutation', async () => {
    const payload = await send({ ...baseParams, playerFirstName: null });
    expect(payload.text).toMatchInlineSnapshot(`
      "Hei!

      Cup-en "Høst-cup 2026" har startet.

      Bjørketrærne møter Granskogen. Først til 10 point vinner.

      Åpne leaderboard: https://tornygolf.no/cup/22222222-2222-2222-2222-222222222222

      Lykke til på banen!
      "
    `);
  });

  it('desimal-point formateres med norsk komma (10.5 → 10,5)', async () => {
    const payload = await send({ ...baseParams, pointsToWin: 10.5 });
    expect(payload.text).toMatchInlineSnapshot(`
      "Hei Per!

      Cup-en "Høst-cup 2026" har startet.

      Bjørketrærne møter Granskogen. Først til 10,5 point vinner.

      Åpne leaderboard: https://tornygolf.no/cup/22222222-2222-2222-2222-222222222222

      Lykke til på banen!
      "
    `);
    expect(bodyHtml(payload.html)).toMatchInlineSnapshot(`
      "Cup-en <strong>Høst-cup 2026</strong> har startet.
      <strong>Bjørketrærne</strong> møter <strong>Granskogen</strong>.
                    Først til <strong>10,5</strong> point vinner."
    `);
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
        <title>Cup-en har startet — Høst-cup 2026</title>
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
                    Hei Per!
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Cup-en <strong>Høst-cup 2026</strong> har startet.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Bjørketrærne</strong> møter <strong>Granskogen</strong>.
                    Først til <strong>10</strong> point vinner.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/cup/22222222-2222-2222-2222-222222222222" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne leaderboard
                    </a>
                  </div>
                  <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Lykke til på banen!
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
