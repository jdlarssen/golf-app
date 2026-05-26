import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameFinishedNotificationParams } from './gameFinishedNotification';

// Approval-style tester: snapshot subject + text + body-line HTML per
// mode-case. Når copy endres: kjør `vitest -u` og review diff-en. Slipper
// vedlikehold av dusinvis av `toContain`/`not.toContain` per case.
//
// Strategi:
//   - `subject` + `text` snapshot-es per case (det mottakeren faktisk leser).
//   - HTML-chrome (header, button, footer-template) snapshot-es ÉN gang
//     under «HTML chrome» — uendret kromen lekker ikke inn i hver case.
//   - HTML body-line-en (det personlige avsnittet med <strong>-markup)
//     ekstraheres og snapshot-es per case for å verifisere personalisering-
//     markup (partner-navn, motstander-navn, formatert match-resultat).

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

async function send(params: GameFinishedNotificationParams) {
  const { sendGameFinishedNotification } = await import(
    './gameFinishedNotification'
  );
  await sendGameFinishedNotification(params);
  return sendMock.mock.calls[0]![0];
}

// Body-line-paragrafen har unik styling (margin:0 0 24px) som skiller den
// fra salutation (16px) og footer (32px 0 0). Henter ut innerHTML for
// snapshot-sammenligning av personalisering uten å dra med chrome.
function bodyLineHtml(html: string): string {
  const m = html.match(
    /<p style="font-size:16px;line-height:1\.5;margin:0 0 24px;">\s*([\s\S]*?)\s*<\/p>/,
  );
  if (!m) throw new Error('Body-line paragraph not found in HTML');
  return m[1].trim();
}

const baseParams = {
  to: 'spiller@example.com',
  playerFirstName: 'Ada',
  gameName: 'Vinter-cup',
  gameId: 'game-1',
} satisfies Omit<GameFinishedNotificationParams, 'mode'>;

describe('sendGameFinishedNotification', () => {
  // ─────────────────────────────────────────────────────────────────────
  // Best ball (default + eksplisitt)
  // ─────────────────────────────────────────────────────────────────────

  it('best_ball (default): nøytral «leaderboard er åpen»-copy', async () => {
    const payload = await send(baseParams);
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet er klart — Vinter-cup"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Vinter-cup

      Hei Ada!

      Runden i Vinter-cup er ferdig, alle scorekort er levert og godkjent, og leaderboardet er åpent.

      Se leaderboard: https://tornygolf.no/games/game-1/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Vinter-cup</strong> er ferdig, alle scorekort er levert og godkjent, og leaderboardet er åpent."`);
  });

  it('best_ball (eksplisitt mode): samme nøytrale copy som default', async () => {
    const payload = await send({
      ...baseParams,
      mode: { kind: 'best_ball' },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Vinter-cup

      Hei Ada!

      Runden i Vinter-cup er ferdig, alle scorekort er levert og godkjent, og leaderboardet er åpent.

      Se leaderboard: https://tornygolf.no/games/game-1/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Vinter-cup</strong> er ferdig, alle scorekort er levert og godkjent, og leaderboardet er åpent."`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Stableford solo — celebration-cascade (1 → seier, 2-3 → solid, 4+ → nøytral)
  // ─────────────────────────────────────────────────────────────────────

  it('stableford solo: 1.-plass får «Gratulerer med seieren!»', async () => {
    const payload = await send({
      to: 'vinner@example.com',
      playerFirstName: 'Alice',
      gameName: 'Sommerturnering',
      gameId: 'game-2',
      mode: {
        kind: 'stableford',
        variant: 'solo',
        rank: 1,
        totalPoints: 38,
        totalPlayers: 5,
      },
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet er klart — Sommerturnering"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Sommerturnering

      Hei Alice!

      Runden i Sommerturnering er ferdig. Du endte på 1. plass av 5 med 38 poeng. Gratulerer med seieren!

      Se leaderboard: https://tornygolf.no/games/game-2/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Sommerturnering</strong> er ferdig. Du endte på <strong>1. plass av 5</strong> med <strong>38 poeng</strong>. Gratulerer med seieren!"`);
  });

  it('stableford solo: 3.-plass får «Solid plassering!»', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Bjørn',
      gameName: 'Sommerturnering',
      gameId: 'game-2',
      mode: {
        kind: 'stableford',
        variant: 'solo',
        rank: 3,
        totalPoints: 28,
        totalPlayers: 12,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Sommerturnering

      Hei Bjørn!

      Runden i Sommerturnering er ferdig. Du endte på 3. plass av 12 med 28 poeng. Solid plassering!

      Se leaderboard: https://tornygolf.no/games/game-2/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Sommerturnering</strong> er ferdig. Du endte på <strong>3. plass av 12</strong> med <strong>28 poeng</strong>. Solid plassering!"`);
  });

  it('stableford solo: 7.-plass får INGEN celebration (nøytral tone)', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Eva',
      gameName: 'Sommerturnering',
      gameId: 'game-2',
      mode: {
        kind: 'stableford',
        variant: 'solo',
        rank: 7,
        totalPoints: 18,
        totalPlayers: 12,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Sommerturnering

      Hei Eva!

      Runden i Sommerturnering er ferdig. Du endte på 7. plass av 12 med 18 poeng.

      Se leaderboard: https://tornygolf.no/games/game-2/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Sommerturnering</strong> er ferdig. Du endte på <strong>7. plass av 12</strong> med <strong>18 poeng</strong>."`);
  });

  it('stableford solo: faller tilbake til «Hei!» uten fornavn', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: null,
      gameName: 'Vinter-cup',
      gameId: 'game-1',
      mode: {
        kind: 'stableford',
        variant: 'solo',
        rank: 2,
        totalPoints: 32,
        totalPlayers: 4,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Vinter-cup

      Hei!

      Runden i Vinter-cup er ferdig. Du endte på 2. plass av 4 med 32 poeng. Solid plassering!

      Se leaderboard: https://tornygolf.no/games/game-1/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Stableford team — adresserer LAGET + partner-setning
  // ─────────────────────────────────────────────────────────────────────

  it('stableford team: 1.-plass — lag-adressert + partner i strong', async () => {
    const payload = await send({
      to: 'vinner@example.com',
      playerFirstName: 'Alice',
      gameName: 'Fyrball-cup',
      gameId: 'game-3',
      mode: {
        kind: 'stableford',
        variant: 'team',
        teamRank: 1,
        teamTotalPoints: 64,
        teamPartnerName: 'Bjørn',
        totalTeams: 4,
      },
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet er klart — Fyrball-cup"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Fyrball-cup

      Hei Alice!

      Runden i Fyrball-cup er ferdig. Laget endte på 1. plass av 4 lag med 64 poeng. Gratulerer med seieren! Du og Bjørn satt sammen på lag.

      Se leaderboard: https://tornygolf.no/games/game-3/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Fyrball-cup</strong> er ferdig. Laget endte på <strong>1. plass av 4 lag</strong> med <strong>64 poeng</strong>. Gratulerer med seieren! Du og <strong>Bjørn</strong> satt sammen på lag."`);
  });

  it('stableford team: 2.-plass — «Solid plassering» + partner', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Cecilie',
      gameName: 'Fyrball-cup',
      gameId: 'game-3',
      mode: {
        kind: 'stableford',
        variant: 'team',
        teamRank: 2,
        teamTotalPoints: 58,
        teamPartnerName: 'David',
        totalTeams: 3,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Fyrball-cup

      Hei Cecilie!

      Runden i Fyrball-cup er ferdig. Laget endte på 2. plass av 3 lag med 58 poeng. Solid plassering! Du og David satt sammen på lag.

      Se leaderboard: https://tornygolf.no/games/game-3/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Fyrball-cup</strong> er ferdig. Laget endte på <strong>2. plass av 3 lag</strong> med <strong>58 poeng</strong>. Solid plassering! Du og <strong>David</strong> satt sammen på lag."`);
  });

  it('stableford team: 4.-plass — nøytral, men partner-setningen henger på', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Eva',
      gameName: 'Fyrball-cup',
      gameId: 'game-3',
      mode: {
        kind: 'stableford',
        variant: 'team',
        teamRank: 4,
        teamTotalPoints: 41,
        teamPartnerName: 'Fred',
        totalTeams: 4,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Fyrball-cup

      Hei Eva!

      Runden i Fyrball-cup er ferdig. Laget endte på 4. plass av 4 lag med 41 poeng. Du og Fred satt sammen på lag.

      Se leaderboard: https://tornygolf.no/games/game-3/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Fyrball-cup</strong> er ferdig. Laget endte på <strong>4. plass av 4 lag</strong> med <strong>41 poeng</strong>. Du og <strong>Fred</strong> satt sammen på lag."`);
  });

  it('stableford team: dropper partner-setningen når partnernavn er null', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Gerd',
      gameName: 'Fyrball-cup',
      gameId: 'game-3',
      mode: {
        kind: 'stableford',
        variant: 'team',
        teamRank: 2,
        teamTotalPoints: 49,
        teamPartnerName: null,
        totalTeams: 3,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Fyrball-cup

      Hei Gerd!

      Runden i Fyrball-cup er ferdig. Laget endte på 2. plass av 3 lag med 49 poeng. Solid plassering!

      Se leaderboard: https://tornygolf.no/games/game-3/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Fyrball-cup</strong> er ferdig. Laget endte på <strong>2. plass av 3 lag</strong> med <strong>49 poeng</strong>. Solid plassering!"`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Singles matchplay — won/lost/tied + opponent-fallback
  // ─────────────────────────────────────────────────────────────────────

  it('matchplay: won — «Du vant {formatted} over {opponent}»', async () => {
    const payload = await send({
      to: 'vinner@example.com',
      playerFirstName: 'Alice',
      gameName: 'Matchplay-cup',
      gameId: 'game-4',
      mode: {
        kind: 'singles_matchplay',
        matchResult: 'won',
        formattedResult: '3&2',
        opponentName: 'Per',
        selfSide: 1,
      },
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet er klart — Matchplay-cup"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Matchplay-cup

      Hei Alice!

      Runden i Matchplay-cup er ferdig. Du vant 3&2 over Per. Gratulerer med seieren!

      Se leaderboard: https://tornygolf.no/games/game-4/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Matchplay-cup</strong> er ferdig. Du vant <strong>3&amp;2</strong> over <strong>Per</strong>. Gratulerer med seieren!"`);
  });

  it('matchplay: lost — «Du tapte {formatted} mot {opponent}» + revansje', async () => {
    const payload = await send({
      to: 'taper@example.com',
      playerFirstName: 'Bjørn',
      gameName: 'Matchplay-cup',
      gameId: 'game-4',
      mode: {
        kind: 'singles_matchplay',
        matchResult: 'lost',
        formattedResult: '1up',
        opponentName: 'Per',
        selfSide: 2,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Matchplay-cup

      Hei Bjørn!

      Runden i Matchplay-cup er ferdig. Du tapte 1up mot Per. Godt spilt. Kanskje revansje neste runde?

      Se leaderboard: https://tornygolf.no/games/game-4/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Matchplay-cup</strong> er ferdig. Du tapte <strong>1up</strong> mot <strong>Per</strong>. Godt spilt. Kanskje revansje neste runde?"`);
  });

  it('matchplay: tied — «Matchen mot {opponent} endte uavgjort (AS)»', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Cecilie',
      gameName: 'Matchplay-cup',
      gameId: 'game-4',
      mode: {
        kind: 'singles_matchplay',
        matchResult: 'tied',
        formattedResult: 'AS',
        opponentName: 'David',
        selfSide: 1,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Matchplay-cup

      Hei Cecilie!

      Runden i Matchplay-cup er ferdig. Matchen mot David endte uavgjort (AS). En jevn match. Kanskje neste gang.

      Se leaderboard: https://tornygolf.no/games/game-4/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Matchplay-cup</strong> er ferdig. Matchen mot <strong>David</strong> endte uavgjort (<strong>AS</strong>). En jevn match. Kanskje neste gang."`);
  });

  it('matchplay: faller tilbake til «motstanderen» når opponentName er null', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Eva',
      gameName: 'Matchplay-cup',
      gameId: 'game-4',
      mode: {
        kind: 'singles_matchplay',
        matchResult: 'won',
        formattedResult: '2up',
        opponentName: null,
        selfSide: 1,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Matchplay-cup

      Hei Eva!

      Runden i Matchplay-cup er ferdig. Du vant 2up over motstanderen. Gratulerer med seieren!

      Se leaderboard: https://tornygolf.no/games/game-4/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Matchplay-cup</strong> er ferdig. Du vant <strong>2up</strong> over <strong>motstanderen</strong>. Gratulerer med seieren!"`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Solo strokeplay — personlig rank + netto/brutto
  // ─────────────────────────────────────────────────────────────────────

  it('solo strokeplay: 1.-plass — «Gratulerer» + netto + brutto', async () => {
    const payload = await send({
      to: 'vinner@example.com',
      playerFirstName: 'Alice',
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay',
        rank: 1,
        totalNetStrokes: 68,
        totalGrossStrokes: 74,
        totalPlayers: 12,
      },
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet er klart — Klubbmesterskap"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Klubbmesterskap

      Hei Alice!

      Runden i Klubbmesterskap er ferdig. Du endte på 1. plass av 12 med 68 slag netto (74 brutto). Gratulerer med seieren!

      Se leaderboard: https://tornygolf.no/games/game-5/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Klubbmesterskap</strong> er ferdig. Du endte på <strong>1. plass av 12</strong> med <strong>68 slag netto</strong> (74 brutto). Gratulerer med seieren!"`);
  });

  it('solo strokeplay: 2.-plass — «Solid plassering»', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Bjørn',
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay',
        rank: 2,
        totalNetStrokes: 72,
        totalGrossStrokes: 78,
        totalPlayers: 12,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Klubbmesterskap

      Hei Bjørn!

      Runden i Klubbmesterskap er ferdig. Du endte på 2. plass av 12 med 72 slag netto (78 brutto). Solid plassering!

      Se leaderboard: https://tornygolf.no/games/game-5/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Klubbmesterskap</strong> er ferdig. Du endte på <strong>2. plass av 12</strong> med <strong>72 slag netto</strong> (78 brutto). Solid plassering!"`);
  });

  it('solo strokeplay: 4.-plass — nøytral tone', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Eva',
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay',
        rank: 4,
        totalNetStrokes: 80,
        totalGrossStrokes: 86,
        totalPlayers: 12,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Klubbmesterskap

      Hei Eva!

      Runden i Klubbmesterskap er ferdig. Du endte på 4. plass av 12 med 80 slag netto (86 brutto).

      Se leaderboard: https://tornygolf.no/games/game-5/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Klubbmesterskap</strong> er ferdig. Du endte på <strong>4. plass av 12</strong> med <strong>80 slag netto</strong> (86 brutto)."`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Texas scramble — lag-adressert + partner-liste
  // ─────────────────────────────────────────────────────────────────────

  it('texas: 2-mannslag 1.-plass — «Gratulerer» + partner i strong', async () => {
    const payload = await send({
      to: 'vinner@example.com',
      playerFirstName: 'Anne',
      gameName: 'Firma-cup',
      gameId: 'game-tx-1',
      mode: {
        kind: 'texas_scramble',
        teamRank: 1,
        teamTotalNet: 68,
        teamTotalGross: 78,
        teamPartnerNames: ['Bjørn'],
        totalTeams: 4,
      },
    });
    expect(payload.subject).toMatchInlineSnapshot(`"Resultatet er klart — Firma-cup"`);
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Firma-cup

      Hei Anne!

      Runden i Firma-cup er ferdig. Laget endte på 1. plass av 4 lag med 68 slag netto (78 brutto). Gratulerer med seieren! Du spilte med Bjørn.

      Se leaderboard: https://tornygolf.no/games/game-tx-1/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Firma-cup</strong> er ferdig. Laget endte på <strong>1. plass av 4 lag</strong> med <strong>68 slag netto</strong> (78 brutto). Gratulerer med seieren! Du spilte med <strong>Bjørn</strong>."`);
  });

  it('texas: 4-mannslag — komma-separert partner-liste med «og» foran siste', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Anne',
      gameName: 'Firma-cup',
      gameId: 'game-tx-2',
      mode: {
        kind: 'texas_scramble',
        teamRank: 2,
        teamTotalNet: 72,
        teamTotalGross: 82,
        teamPartnerNames: ['Bjørn', 'Carla', 'Dagfinn'],
        totalTeams: 4,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Firma-cup

      Hei Anne!

      Runden i Firma-cup er ferdig. Laget endte på 2. plass av 4 lag med 72 slag netto (82 brutto). Solid plassering! Du spilte med Bjørn, Carla og Dagfinn.

      Se leaderboard: https://tornygolf.no/games/game-tx-2/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Firma-cup</strong> er ferdig. Laget endte på <strong>2. plass av 4 lag</strong> med <strong>72 slag netto</strong> (82 brutto). Solid plassering! Du spilte med <strong>Bjørn, Carla og Dagfinn</strong>."`);
  });

  it('texas: 4.-plass — nøytral tone, men partner-setningen henger på', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Carla',
      gameName: 'Firma-cup',
      gameId: 'game-tx-3',
      mode: {
        kind: 'texas_scramble',
        teamRank: 4,
        teamTotalNet: 92,
        teamTotalGross: 98,
        teamPartnerNames: ['Bjørn'],
        totalTeams: 4,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Firma-cup

      Hei Carla!

      Runden i Firma-cup er ferdig. Laget endte på 4. plass av 4 lag med 92 slag netto (98 brutto). Du spilte med Bjørn.

      Se leaderboard: https://tornygolf.no/games/game-tx-3/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Firma-cup</strong> er ferdig. Laget endte på <strong>4. plass av 4 lag</strong> med <strong>92 slag netto</strong> (98 brutto). Du spilte med <strong>Bjørn</strong>."`);
  });

  it('texas: dropper partner-setningen når listen er tom', async () => {
    const payload = await send({
      to: 'spiller@example.com',
      playerFirstName: 'Eli',
      gameName: 'Firma-cup',
      gameId: 'game-tx-4',
      mode: {
        kind: 'texas_scramble',
        teamRank: 3,
        teamTotalNet: 80,
        teamTotalGross: 88,
        teamPartnerNames: [],
        totalTeams: 4,
      },
    });
    expect(payload.text).toMatchInlineSnapshot(`
      "Resultatet er klart — Firma-cup

      Hei Eli!

      Runden i Firma-cup er ferdig. Laget endte på 3. plass av 4 lag med 80 slag netto (88 brutto). Solid plassering!

      Se leaderboard: https://tornygolf.no/games/game-tx-4/leaderboard

      Tørny — fyr opp golfturneringen på et par minutter.
      "
    `);
    expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot(`"Runden i <strong>Firma-cup</strong> er ferdig. Laget endte på <strong>3. plass av 4 lag</strong> med <strong>80 slag netto</strong> (88 brutto). Solid plassering!"`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // HTML chrome — låses ÉN gang. Hvis chrome-mal-en endres må snapshot-en
  // oppdateres bevisst (kjør `vitest -u` og review).
  // ─────────────────────────────────────────────────────────────────────

  it('HTML chrome: full template for best_ball-default', async () => {
    const payload = await send(baseParams);
    expect(payload.html).toMatchInlineSnapshot(`
      "<!DOCTYPE html><html lang="nb">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Resultatet er klart — Vinter-cup</title>
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
                    Resultatet er klart
                  </h2>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                    Hei Ada!
                  </p>
                  <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
                    Runden i <strong>Vinter-cup</strong> er ferdig, alle scorekort er levert og godkjent, og leaderboardet er åpent.
                  </p>
                  <div style="margin:32px 0;">
                    <a href="https://tornygolf.no/games/game-1/leaderboard" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                      Se leaderboard
                    </a>
                  </div>
                  <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
                    Du får denne meldingen fordi du var med i runden. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for full oversikt.
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

  // Strukturelle Resend-kontrakter (error-propagation, from-format, call-count)
  // konsolidert til lib/mail/__tests__/resend-contract.test.ts (issue #263).
});
