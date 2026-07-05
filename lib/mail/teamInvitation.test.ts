import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TeamInvitationMailParams } from './teamInvitation';

// Approval-style tester: snapshot subject + text + body-content HTML per case.
// Når copy endres: kjør `vitest -u` og review diff-en.
//
// Strategi:
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-content (regionen mellom <h2> og CTA-div) ekstraheres og
//     snapshot-es per case — dekker både intro-paragraf (med personalisering)
//     og login-instruks-paragraf (ren chrome).
//   - HTML-chrome (header, button, footer) snapshot-es ÉN gang.
//   - URL-encoding av next-param holdes som eksplisitt struktur-assertion
//     (kontrakt mot login-flyt, ikke copy).

type SendArgs = [
  { from: string; to: string; subject: string; html: string; text: string },
];
type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};
const sendMock = vi.fn<(...args: SendArgs) => Promise<SendResult>>(
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

async function send(params: TeamInvitationMailParams) {
  const { sendTeamInvitationMail } = await import('./teamInvitation');
  await sendTeamInvitationMail(params);
  return sendMock.mock.calls[0]![0];
}

// Henter ut alt mellom </h2> og CTA-button-div-en. Dekker intro-line
// (personalisert) + login-instruks-paragraf.
function mainBodyHtml(html: string): string {
  const m = html.match(
    /<\/h2>\s*([\s\S]*?)\s*<div style="margin:32px 0;">/,
  );
  if (!m) throw new Error('Main body region not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'venn@example.com',
  captainName: 'Jørgen',
  gameName: 'Sommercup 2026',
  teamName: 'Bjørketrærne',
  gameShortId: 'abc12345',
} satisfies TeamInvitationMailParams;

describe('sendTeamInvitationMail', () => {
  it('lag-invitasjon: subject + body med kaptein, lagnavn, spillnavn', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til Bjørketrærne (Sommercup 2026)"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til Bjørketrærne (Sommercup 2026)

      Jørgen vil ha deg med på laget Bjørketrærne i Sommercup 2026.

      Gå til Tørny, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Etter pålogging lander du rett på lag-siden hvor du kan bekrefte plassen.

      Bli med: https://tornygolf.no/login?email=venn%40example.com&next=%2Fsignup%2Fabc12345%2Fteam

      Kjenner du ikke Jørgen? Ignorer denne meldingen.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Jørgen</strong> vil ha deg med på laget <em>Bjørketrærne</em> i <strong>Sommercup 2026</strong>.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    For å bli med: gå til Tørny, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Etter pålogging lander du rett på lag-siden hvor du kan bekrefte plassen din.
                  </p>"
    `);
  });

  it('escaper HTML i alle bruker-styrte felt', async () => {
    const payload = await send({
      ...baseParams,
      captainName: '<b>X</b>',
      gameName: '<i>Y</i>',
      teamName: '<u>Z</u>',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til <u>Z</u> (<i>Y</i>)"`);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>&lt;b&gt;X&lt;/b&gt;</strong> vil ha deg med på laget <em>&lt;u&gt;Z&lt;/u&gt;</em> i <strong>&lt;i&gt;Y&lt;/i&gt;</strong>.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    For å bli med: gå til Tørny, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Etter pålogging lander du rett på lag-siden hvor du kan bekrefte plassen din.
                  </p>"
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Engelsk (locale: 'en') — Fase M.
  // ─────────────────────────────────────────────────────────────────────

  it('locale en: engelsk subject + body + /en/-lenke med next-param', async () => {
    const payload = await send({ ...baseParams, locale: 'en' });
    expect(payload.subject).toMatchInlineSnapshot(`"You're invited to join Bjørketrærne (Sommercup 2026)"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "You're invited to join Bjørketrærne (Sommercup 2026)

      Jørgen wants you on team Bjørketrærne in Sommercup 2026.

      Go to Tørny, enter this email address, and log in with the code we send you. After logging in you land straight on the team page where you can confirm your spot.

      Join: https://tornygolf.no/en/login?email=venn%40example.com&next=%2Fsignup%2Fabc12345%2Fteam

      Don't know Jørgen? Just ignore this message.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    expect(mainBodyHtml(payload.html)).toMatchInlineSnapshot(`
      "<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Jørgen</strong> wants you on team <em>Bjørketrærne</em> in <strong>Sommercup 2026</strong>.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    To join: go to Tørny, enter this email address, and log in with the code we send you. After logging in you land straight on the team page where you can confirm your spot.
                  </p>"
    `);
    // next-param must remain locale-agnostic (just a path, not translated)
    expect(payload.html).toContain(
      'https://tornygolf.no/en/login?email=venn%40example.com&next=%2Fsignup%2Fabc12345%2Fteam',
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang.
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template for default-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Du er invitert til Bjørketrærne (Sommercup 2026)</title>
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
                    Du er invitert på lag
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Jørgen</strong> vil ha deg med på laget <em>Bjørketrærne</em> i <strong>Sommercup 2026</strong>.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    For å bli med: gå til Tørny, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Etter pålogging lander du rett på lag-siden hvor du kan bekrefte plassen din.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/login?email=venn%40example.com&next=%2Fsignup%2Fabc12345%2Fteam" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Bli med på laget
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Kjenner du ikke Jørgen? Ignorer denne meldingen — ingenting skjer hvis du ikke logger inn.
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

  // ─────────────────────────────────────────────────────────────────────
  // Strukturelle tester (ikke approval-basert) — kontrakt mot login-flyt
  // + Resend.
  // ─────────────────────────────────────────────────────────────────────

  it('CTA-lenke bruker URL-encoded email + next=/signup/[shortId]/team (#1056)', async () => {
    const payload = await send(baseParams);
    // URLSearchParams encoder email + next('/signup/abc12345/team' → '%2Fsignup%2Fabc12345%2Fteam')
    expect(payload.html).toContain(
      'https://tornygolf.no/login?email=venn%40example.com&next=%2Fsignup%2Fabc12345%2Fteam',
    );
    expect(payload.text).toContain(
      'https://tornygolf.no/login?email=venn%40example.com&next=%2Fsignup%2Fabc12345%2Fteam',
    );
  });

  // Resend-error-propagation + to/from + call-count konsolideres til
  // lib/mail/__tests__/resend-contract.test.ts i issue #263. URL-encoding-
  // testen over beholdes per modul fordi `next`-routing er module-spesifikk.
});
