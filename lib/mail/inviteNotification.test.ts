import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InviteNotificationParams } from './inviteNotification';

// Approval-style tester: snapshot subject + text + body-line HTML per case.
// Når copy endres: kjør `vitest -u` og review diff-en.
//
// Strategi:
//   - `subject` + `text` snapshot-es per case.
//   - HTML body-line-en (det personlige intro-avsnittet) ekstraheres og
//     snapshot-es per case for å verifisere personalisering + HTML-escape.
//   - HTML-chrome (header, button, footer) snapshot-es ÉN gang.

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

async function send(params: InviteNotificationParams) {
  const { sendInviteNotification } = await import('./inviteNotification');
  await sendInviteNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Intro-line-paragrafen har styling `margin:0 0 16px;` — det er TO paragrafer
// med 16px font-size i denne malen, intro (16px-margin) og login-instruks
// (32px-margin). Vi matcher første (intro) ved å låse på 16px-margin.
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 16px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

// Modus-hint-callouten (#309) har distinkt 14px-styling, så den kolliderer ikke
// med intro-linjens 16px-regex over.
function modeHintHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:14px;line-height:1\.5;margin:0 0 24px;[^"]*">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Mode-hint paragraph not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'venn@example.com',
  invitedByName: 'Jørgen',
} satisfies InviteNotificationParams;

describe('sendInviteNotification', () => {
  it('uten gameName: generisk «Du er invitert til Tørny»-copy', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til Tørny"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til Tørny

      Jørgen har invitert deg til en golf-turnering i Tørny.

      Gå til https://tornygolf.no/login?email=venn%40example.com, skriv inn denne e-posten, og logg inn med koden du får tilsendt.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> har invitert deg til en golf-turnering i Tørny."`);
  });

  it('med gameName: subject + body har spill-konteksten', async () => {
    // #1169: game-scoped invitasjoner sender alltid med invitations.token —
    // login-lenken skal få &invite=<token> så /login viser kontekstkortet.
    const payload = await send({
      ...baseParams,
      gameName: 'Stiklestad 25. mai',
      inviteToken: '11111111-2222-3333-4444-555555555555',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til Stiklestad 25. mai på Tørny"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til Stiklestad 25. mai på Tørny

      Jørgen har invitert deg til spillet Stiklestad 25. mai på Tørny.

      Gå til https://tornygolf.no/login?email=venn%40example.com&invite=11111111-2222-3333-4444-555555555555, skriv inn denne e-posten, og logg inn med koden du får tilsendt.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> har invitert deg til spillet <em>Stiklestad 25. mai</em> på Tørny."`);
  });

  it('med gameName + gameMode: viser modus-hint (navn + sammendrag + lenke) (#309)', async () => {
    const payload = await send({
      ...baseParams,
      gameName: 'Stiklestad 25. mai',
      gameMode: 'best_ball',
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til Stiklestad 25. mai på Tørny

      Jørgen har invitert deg til spillet Stiklestad 25. mai på Tørny.

      Spillformat: Best ball — Dere er to på lag, og på hvert hull teller bare den beste netto-scoren av dere to.
      Les mer om spillformatene: https://tornygolf.no/spillformater

      Gå til https://tornygolf.no/login?email=venn%40example.com, skriv inn denne e-posten, og logg inn med koden du får tilsendt.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(modeHintHtml(payload.html)).toMatchInlineSnapshot(`
      "<strong>Spillformat: Best ball</strong><br>
                    Dere er to på lag, og på hvert hull teller bare den beste netto-scoren av dere to.<br>
                    <a href="https://tornygolf.no/spillformater" style="color:#1B4332;font-weight:600;text-decoration:underline;">Les mer om spillformatene</a>"
    `);
  });

  it('ukjent gameMode: ingen modus-hint, mail uendret', async () => {
    const payload = await send({
      ...baseParams,
      gameName: 'Stiklestad 25. mai',
      gameMode: 'not_a_real_mode',
    });
    expect(payload.html).not.toContain('Spillform:');
    expect(payload.text).not.toContain('Spillform:');
  });

  it('gameMode uten gameName (åpen invitasjon): ingen modus-hint', async () => {
    const payload = await send({ ...baseParams, gameMode: 'best_ball' });
    expect(payload.html).not.toContain('Spillform:');
    expect(payload.text).not.toContain('Spillform:');
  });

  it('escaper HTML i gameName + invitedByName i body-line', async () => {
    const payload = await send({
      ...baseParams,
      gameName: '<script>alert("x")</script>',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Du er invitert til <script>alert("x")</script> på Tørny"`);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> har invitert deg til spillet <em>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</em> på Tørny."`);
    // Plain-text-grenen bevarer rå-strengen siden den ikke rendres som HTML.
    expect(payload.text).toMatchInlineSnapshot(`
      "Du er invitert til <script>alert("x")</script> på Tørny

      Jørgen har invitert deg til spillet <script>alert("x")</script> på Tørny.

      Gå til https://tornygolf.no/login?email=venn%40example.com, skriv inn denne e-posten, og logg inn med koden du får tilsendt.

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Engelsk (locale: 'en') — Fase M. Beviser at katalog-rendringen flipper
  // subject + text + body til engelsk. Chrome er strukturelt locale-identisk,
  // så ingen egen EN-chrome-lås (den norske over dekker strukturen).
  // ─────────────────────────────────────────────────────────────────────

  it('locale en, uten gameName: engelsk generisk copy', async () => {
    const payload = await send({ ...baseParams, locale: 'en' });
    expect(payload.subject).toMatchInlineSnapshot(`"You're invited to Tørny"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "You're invited to Tørny

      Jørgen has invited you to a golf tournament on Tørny.

      Go to https://tornygolf.no/en/login?email=venn%40example.com, enter this email address, and log in with the code we send you.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> has invited you to a golf tournament on Tørny."`);
  });

  it('locale en, med gameName: engelsk spill-kontekst', async () => {
    const payload = await send({
      ...baseParams,
      locale: 'en',
      gameName: 'Stiklestad 25. mai',
      inviteToken: '11111111-2222-3333-4444-555555555555',
    });
    expect(payload.subject).toMatchInlineSnapshot(`"You're invited to Stiklestad 25. mai on Tørny"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "You're invited to Stiklestad 25. mai on Tørny

      Jørgen has invited you to Stiklestad 25. mai on Tørny.

      Go to https://tornygolf.no/en/login?email=venn%40example.com&invite=11111111-2222-3333-4444-555555555555, enter this email address, and log in with the code we send you.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"<strong>Jørgen</strong> has invited you to <em>Stiklestad 25. mai</em> on Tørny."`);
  });

  it('locale en, med gameMode: engelsk modus-hint + /en/-lenker', async () => {
    const payload = await send({
      ...baseParams,
      locale: 'en',
      gameName: 'Stiklestad 25. mai',
      gameMode: 'best_ball',
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "You're invited to Stiklestad 25. mai on Tørny

      Jørgen has invited you to Stiklestad 25. mai on Tørny.

      Game format: Best ball — You play as a pair, and on each hole only the better net score of the two of you counts.
      Learn more about the formats: https://tornygolf.no/en/spillformater

      Go to https://tornygolf.no/en/login?email=venn%40example.com, enter this email address, and log in with the code we send you.

      Tørny — fire up your golf tournament in a couple of minutes.
      "
    `);
    expect(modeHintHtml(payload.html)).toMatchInlineSnapshot(`
      "<strong>Game format: Best ball</strong><br>
                    You play as a pair, and on each hole only the better net score of the two of you counts.<br>
                    <a href="https://tornygolf.no/en/spillformater" style="color:#1B4332;font-weight:600;text-decoration:underline;">Learn more about the formats</a>"
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang (uten gameName-grenen).
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template for uten-gameName-case', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="no">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Du er invitert til Tørny</title>
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
                    Du er invitert
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    <strong>Jørgen</strong> har invitert deg til en golf-turnering i Tørny.
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 32px;">
                    For å komme i gang: gå til <a href="https://tornygolf.no/login?email=venn%40example.com" style="color:#1B4332;font-weight:600;text-decoration:underline;">tornygolf.no</a>, skriv inn denne e-posten, og logg inn med koden du får tilsendt.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/login?email=venn%40example.com" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Åpne Tørny
                    </a>
                  </div>
                  <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Har du ikke en golfvenn ved navn Jørgen? Ignorer denne meldingen.
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

  // Strukturelle Resend-kontrakter (error-propagation, to/from, call-count)
  // dekkes av gameFinishedNotification.test.ts som kanonisk demonstrasjon.
  // Konsolideres til lib/mail/__tests__/resend-contract.test.ts i issue #263.
});
