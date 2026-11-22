import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';
import type { LeagueRoundNotificationParams } from './leagueRoundNotification';

// Approval-style tests (Type B, see lib/mail/AGENTS.md): snapshot subject +
// text + the body line per case. The chrome is locked ONCE, on the default
// case. The structural Resend contract (error/from/call count) lives in
// __tests__/resend-contract.test.ts, not here.

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

async function send(params: LeagueRoundNotificationParams) {
  const { sendLeagueRoundNotification } = await import('./leagueRoundNotification');
  await sendLeagueRoundNotification(params);
  return sendMock.mock.calls[0]![0];
}

// The body line has its own styling (margin:0 0 24px), which sets it apart
// from the salutation (margin:0 0 16px) and the footer.
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 24px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

function headingHtml(html: string): string {
  const m = html.match(/<h2 [^>]*>\s*([\s\S]*?)\s*<\/h2>/);
  if (!m) throw new Error('Heading not found in HTML');
  return m[1].trim();
}

const LEAGUE_ID = '11111111-1111-1111-1111-111111111111';
const ROUND_ID = '22222222-2222-2222-2222-222222222222';

// Sunday 20 December 2026 at 23:59 in Oslo.
const payload = {
  league_id: LEAGUE_ID,
  league_name: 'Vinterliga 2026-2027',
  round_id: ROUND_ID,
  round_label: 'Runde 3',
  closes_at: '2026-12-20T22:59:00+00:00',
} satisfies LeagueRoundNotificationParams['payload'];

const simPayload = {
  ...payload,
  is_simulator: true,
  course_name: 'Byneset North',
  tee_name: '57 – 5745 m',
} satisfies LeagueRoundNotificationParams['payload'];

const baseParams = {
  to: 'spiller@example.com',
  playerFirstName: 'Per',
  kind: 'league_round_open',
  payload,
} satisfies LeagueRoundNotificationParams;

describe('sendLeagueRoundNotification', () => {
  it('default: the round is open, with the deadline and a button to the league', async () => {
    const mail = await send(baseParams);
    expect(mail.subject).toMatchInlineSnapshot(`"Runde 3 i Vinterliga 2026-2027 er åpen"`);
    expect(mail.text).toMatchInlineSnapshot(`
      "Runde 3 i Vinterliga 2026-2027 er åpen

      Hei Per!

      Spill den når det passer deg. Fristen er søndag 20. des. kl. 23:59.

      Åpne ligaen: https://tornygolf.no/liga/11111111-1111-1111-1111-111111111111

      Du får denne e-posten fordi du er med i ligaen og ikke har slått på varsler. Slå dem på i profilen din (https://tornygolf.no/profile), så får du beskjeden som varsel i stedet.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(mail.html)).toMatchInlineSnapshot(`"Spill den når det passer deg. Fristen er søndag 20. des. kl. 23:59."`);
  });

  it('default: the whole chrome (locked once)', async () => {
    const mail = await send(baseParams);
    expect(mail.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Runde 3 i Vinterliga 2026-2027 er åpen</title>
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
                    Runde 3 i Vinterliga 2026-2027 er åpen
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Per!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Spill den når det passer deg. Fristen er søndag 20. des. kl. 23:59.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/liga/11111111-1111-1111-1111-111111111111" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:9999px;font-weight:600;font-size:15px;">
                      Åpne ligaen
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E5E0D3;padding-top:24px;">
                    Du får denne e-posten fordi du er med i ligaen og ikke har slått på varsler. Slå dem på i <a href="https://tornygolf.no/profile" style="color:#1B4332;text-decoration:underline;">profilen din</a>, så får du beskjeden som varsel i stedet.
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

  it('a simulator league names the course and tee, and the button opens the round', async () => {
    const mail = await send({ ...baseParams, payload: simPayload });
    expect(mail.subject).toMatchInlineSnapshot(`"Runde 3 i Vinterliga 2026-2027 er åpen"`);
    expect(mail.text).toMatchInlineSnapshot(`
      "Runde 3 i Vinterliga 2026-2027 er åpen

      Hei Per!

      Byneset North, tee 57 – 5745 m. Åpne runden for å se hva du skal stille inn i Trackman. Fristen er søndag 20. des. kl. 23:59.

      Åpne runden: https://tornygolf.no/liga/11111111-1111-1111-1111-111111111111/runde/22222222-2222-2222-2222-222222222222/spill

      Du får denne e-posten fordi du er med i ligaen og ikke har slått på varsler. Slå dem på i profilen din (https://tornygolf.no/profile), så får du beskjeden som varsel i stedet.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(mail.html)).toMatchInlineSnapshot(`"Byneset North, tee 57 – 5745 m. Åpne runden for å se hva du skal stille inn i Trackman. Fristen er søndag 20. des. kl. 23:59."`);
  });

  it('a simulator league without a course name keeps the plain text', async () => {
    const mail = await send({ ...baseParams, payload: { ...payload, is_simulator: true } });
    expect(mail.text).toMatchInlineSnapshot(`
      "Runde 3 i Vinterliga 2026-2027 er åpen

      Hei Per!

      Spill den når det passer deg. Fristen er søndag 20. des. kl. 23:59.

      Åpne runden: https://tornygolf.no/liga/11111111-1111-1111-1111-111111111111/runde/22222222-2222-2222-2222-222222222222/spill

      Du får denne e-posten fordi du er med i ligaen og ikke har slått på varsler. Slå dem på i profilen din (https://tornygolf.no/profile), så får du beskjeden som varsel i stedet.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(mail.html)).toMatchInlineSnapshot(`"Spill den når det passer deg. Fristen er søndag 20. des. kl. 23:59."`);
  });

  it('the reminder: the deadline is in the subject, and the text says the round is not played', async () => {
    const mail = await send({ ...baseParams, kind: 'league_round_closing', playerFirstName: null });
    expect(mail.subject).toMatchInlineSnapshot(`"Runde 3 i Vinterliga 2026-2027 stenger søndag 20. des. kl. 23:59"`);
    expect(mail.text).toMatchInlineSnapshot(`
      "Runde 3 i Vinterliga 2026-2027 stenger søndag 20. des. kl. 23:59

      Hei!

      Du har ikke spilt den ennå.

      Åpne ligaen: https://tornygolf.no/liga/11111111-1111-1111-1111-111111111111

      Du får denne e-posten fordi du er med i ligaen og ikke har slått på varsler. Slå dem på i profilen din (https://tornygolf.no/profile), så får du beskjeden som varsel i stedet.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(mail.html)).toMatchInlineSnapshot(`"Du har ikke spilt den ennå."`);
  });

  it('the reminder in a simulator league opens the round', async () => {
    const mail = await send({ ...baseParams, kind: 'league_round_closing', payload: simPayload });
    expect(mail.text).toMatchInlineSnapshot(`
      "Runde 3 i Vinterliga 2026-2027 stenger søndag 20. des. kl. 23:59

      Hei Per!

      Du har ikke spilt den ennå.

      Åpne runden: https://tornygolf.no/liga/11111111-1111-1111-1111-111111111111/runde/22222222-2222-2222-2222-222222222222/spill

      Du får denne e-posten fordi du er med i ligaen og ikke har slått på varsler. Slå dem på i profilen din (https://tornygolf.no/profile), så får du beskjeden som varsel i stedet.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  it('English: the round is open in a simulator league, with /en links', async () => {
    const mail = await send({ ...baseParams, payload: simPayload, locale: 'en' });
    expect(mail.subject).toMatchInlineSnapshot(`"Runde 3 in Vinterliga 2026-2027 is open"`);
    expect(mail.text).toMatchInlineSnapshot(`
      "Runde 3 in Vinterliga 2026-2027 is open

      Hi Per!

      Byneset North, 57 – 5745 m tee. Open the round to see what to set in Trackman. The deadline is Sunday, Dec 20 at 23:59.

      Open the round: https://tornygolf.no/en/liga/11111111-1111-1111-1111-111111111111/runde/22222222-2222-2222-2222-222222222222/spill

      You're receiving this email because you're in the league and haven't turned on notifications. Turn them on in your profile (https://tornygolf.no/en/profile), and you'll get the message as a notification instead.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    expect(bodyLineHtml(mail.html)).toMatchInlineSnapshot(`"Byneset North, 57 – 5745 m tee. Open the round to see what to set in Trackman. The deadline is Sunday, Dec 20 at 23:59."`);
  });

  it('English: the reminder', async () => {
    const mail = await send({ ...baseParams, kind: 'league_round_closing', locale: 'en' });
    expect(mail.subject).toMatchInlineSnapshot(`"Runde 3 in Vinterliga 2026-2027 closes Sunday, Dec 20 at 23:59"`);
    expect(mail.text).toMatchInlineSnapshot(`
      "Runde 3 in Vinterliga 2026-2027 closes Sunday, Dec 20 at 23:59

      Hi Per!

      You have not played it yet.

      Open the league: https://tornygolf.no/en/liga/11111111-1111-1111-1111-111111111111

      You're receiving this email because you're in the league and haven't turned on notifications. Turn them on in your profile (https://tornygolf.no/en/profile), and you'll get the message as a notification instead.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
  });

  it('a league name with markup is escaped in the heading', async () => {
    const mail = await send({
      ...baseParams,
      payload: { ...payload, league_name: 'Liga <b>& co</b>' },
    });
    expect(headingHtml(mail.html)).toMatchInlineSnapshot(`"Runde 3 i Liga &lt;b&gt;&amp; co&lt;/b&gt; er åpen"`);
  });
});
