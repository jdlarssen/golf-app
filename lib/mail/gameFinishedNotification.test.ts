import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Resend før import av modulen — alle send-kall fanges av spioner
// så vi kan assertere på subject/body uten å treffe nettverk. Resend må
// være et class-ish constructor (modulen kaller `new Resend(...)`).
type SendArgs = [
  {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  },
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

describe('sendGameFinishedNotification', () => {
  it('best_ball_netto (default): bruker dagens nøytrale «leaderboard er åpen»-copy', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Ada',
      gameName: 'Vinter-cup',
      gameId: 'game-1',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Vinter-cup');
    expect(payload.html).toContain('Hei Ada!');
    expect(payload.html).toContain('alle scorekort er levert og godkjent');
    expect(payload.text).toContain('alle scorekort er levert og godkjent');
    // Ingen stableford-fraser i default-grenen
    expect(payload.html).not.toContain('plass');
    expect(payload.text).not.toContain('plass');
  });

  it('best_ball_netto eksplisitt mode: samme nøytrale copy som default', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Ada',
      gameName: 'Vinter-cup',
      gameId: 'game-1',
      mode: { kind: 'best_ball_netto' },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('alle scorekort er levert og godkjent');
    expect(payload.html).not.toContain('plass');
  });

  it('stableford: 1.-plass får «Gratulerer med seieren!»-tilegg', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Sommerturnering');
    expect(payload.html).toContain('1. plass');
    expect(payload.html).toContain('av 5');
    expect(payload.html).toContain('38');
    expect(payload.html).toContain('poeng');
    expect(payload.html).toContain('Gratulerer med seieren');
    expect(payload.text).toContain('1. plass av 5');
    expect(payload.text).toContain('38 poeng');
    expect(payload.text).toContain('Gratulerer med seieren');
  });

  it('stableford: 3.-plass får «Solid plassering!»-tilegg', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('3. plass');
    expect(payload.html).toContain('Solid plassering');
    expect(payload.html).not.toContain('Gratulerer med seieren');
  });

  it('stableford: 7.-plass får INGEN celebration-tilegg (kun nøytralt resultat)', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('7. plass');
    expect(payload.html).not.toContain('Gratulerer');
    expect(payload.html).not.toContain('Solid plassering');
    expect(payload.text).toContain('7. plass');
  });

  it('faller tilbake til «Hei!» uten navn (samme i begge moduser)', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Hei!');
    expect(payload.html).not.toContain('Hei null');
  });

  it('stableford team: 1.-plass adresserer LAGET med partnernavn + «Gratulerer»', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Fyrball-cup');
    expect(payload.html).toContain('Laget endte på');
    expect(payload.html).toContain('1. plass');
    expect(payload.html).toContain('av 4 lag');
    expect(payload.html).toContain('64');
    expect(payload.html).toContain('poeng');
    expect(payload.html).toContain('Gratulerer med seieren');
    expect(payload.html).toContain('Du og <strong>Bjørn</strong> satt sammen');
    expect(payload.text).toContain('Laget endte på');
    expect(payload.text).toContain('1. plass av 4 lag');
    expect(payload.text).toContain('64 poeng');
    expect(payload.text).toContain('Gratulerer med seieren');
    expect(payload.text).toContain('Du og Bjørn satt sammen');
    // Solo-frasen «Du endte på» skal IKKE komme med — team-grenen er lag-fokus.
    expect(payload.html).not.toContain('Du endte på');
    expect(payload.text).not.toContain('Du endte på');
  });

  it('stableford team: 2.-plass får «Solid plassering!» + partnernavn', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('2. plass');
    expect(payload.html).toContain('av 3 lag');
    expect(payload.html).toContain('58');
    expect(payload.html).toContain('Solid plassering');
    expect(payload.html).not.toContain('Gratulerer med seieren');
    expect(payload.html).toContain('Du og <strong>David</strong>');
  });

  it('stableford team: 4.-plass får INGEN celebration, kun nøytralt resultat', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('4. plass');
    expect(payload.html).not.toContain('Gratulerer');
    expect(payload.html).not.toContain('Solid plassering');
    expect(payload.html).toContain('Du og <strong>Fred</strong>');
    expect(payload.text).toContain('4. plass');
  });

  it('stableford team: dropper partner-setningen når partnernavn er null', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('2. plass');
    expect(payload.html).not.toContain('satt sammen');
    expect(payload.html).not.toContain('Du og');
    expect(payload.text).not.toContain('satt sammen');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Singles matchplay (epic #45). Tre grener (won/lost/tied) + null-fallback
  // for opponent-navn.
  // ─────────────────────────────────────────────────────────────────────

  it('matchplay: won-resultatet rendrer «Du vant {formatted} over {opponent}» + gratulasjon', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Matchplay-cup');
    expect(payload.html).toContain('Du vant');
    expect(payload.html).toContain('<strong>3&amp;2</strong>');
    expect(payload.html).toContain('<strong>Per</strong>');
    expect(payload.html).toContain('Gratulerer med seieren');
    expect(payload.text).toContain('Du vant 3&2 over Per');
    expect(payload.text).toContain('Gratulerer med seieren');
    // Stableford-fraser skal ikke lekke inn
    expect(payload.html).not.toContain('plass');
    expect(payload.html).not.toContain('poeng');
  });

  it('matchplay: lost-resultatet rendrer «Du tapte {formatted} mot {opponent}» + revansje-linje', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Du tapte');
    expect(payload.html).toContain('<strong>1up</strong>');
    expect(payload.html).toContain('mot <strong>Per</strong>');
    expect(payload.html).toContain('revansje');
    expect(payload.html).not.toContain('Gratulerer');
    expect(payload.text).toContain('Du tapte 1up mot Per');
    expect(payload.text).toContain('revansje');
  });

  it('matchplay: tied-resultatet rendrer «Matchen mot {opponent} endte uavgjort (AS)»', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Matchen mot');
    expect(payload.html).toContain('<strong>David</strong>');
    expect(payload.html).toContain('uavgjort');
    expect(payload.html).toContain('<strong>AS</strong>');
    expect(payload.html).toContain('jevn match');
    expect(payload.html).not.toContain('Gratulerer');
    expect(payload.html).not.toContain('revansje');
    expect(payload.text).toContain('Matchen mot David endte uavgjort');
    expect(payload.text).toContain('AS');
  });

  it('matchplay: faller tilbake til «motstanderen» når opponentName er null', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Du vant');
    expect(payload.html).toContain('<strong>motstanderen</strong>');
    expect(payload.html).not.toContain('null');
    expect(payload.text).toContain('Du vant 2up over motstanderen');
  });

  it('matchplay: bruker «Hei!» når playerFirstName er null', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: null,
      gameName: 'Matchplay-cup',
      gameId: 'game-4',
      mode: {
        kind: 'singles_matchplay',
        matchResult: 'tied',
        formattedResult: 'AS',
        opponentName: 'Per',
        selfSide: 1,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Hei!');
    expect(payload.html).not.toContain('Hei null');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Solo strokeplay netto (epic #46). Klassisk slagspill — personlig
  // plassering + netto-total + brutto-side-note. Samme celebration-cascade
  // som solo-stableford (1. → seier, 2-3 → solid, 4+ → nøytral).
  // ─────────────────────────────────────────────────────────────────────

  it('solo strokeplay netto: 1.-plass får «Gratulerer med seieren!» + netto + brutto', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'vinner@example.com',
      playerFirstName: 'Alice',
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay_netto',
        rank: 1,
        totalNetStrokes: 68,
        totalGrossStrokes: 74,
        totalPlayers: 12,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Klubbmesterskap');
    expect(payload.html).toContain('1. plass');
    expect(payload.html).toContain('av 12');
    expect(payload.html).toContain('68 slag netto');
    expect(payload.html).toContain('(74 brutto)');
    expect(payload.html).toContain('Gratulerer med seieren');
    expect(payload.text).toContain('1. plass av 12');
    expect(payload.text).toContain('68 slag netto');
    expect(payload.text).toContain('(74 brutto)');
    expect(payload.text).toContain('Gratulerer med seieren');
    // Stableford-fraser skal ikke lekke inn
    expect(payload.html).not.toContain('poeng');
  });

  it('solo strokeplay netto: 2.-plass får «Solid plassering!»-tilegg', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Bjørn',
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay_netto',
        rank: 2,
        totalNetStrokes: 72,
        totalGrossStrokes: 78,
        totalPlayers: 12,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('2. plass');
    expect(payload.html).toContain('72 slag netto');
    expect(payload.html).toContain('(78 brutto)');
    expect(payload.html).toContain('Solid plassering');
    expect(payload.html).not.toContain('Gratulerer med seieren');
  });

  it('solo strokeplay netto: 3.-plass får også «Solid plassering!»-tilegg', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Cecilie',
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay_netto',
        rank: 3,
        totalNetStrokes: 75,
        totalGrossStrokes: 80,
        totalPlayers: 12,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('3. plass');
    expect(payload.html).toContain('Solid plassering');
    expect(payload.html).not.toContain('Gratulerer med seieren');
  });

  it('solo strokeplay netto: 4.-plass får INGEN celebration-tilegg (kun nøytralt resultat)', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Eva',
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay_netto',
        rank: 4,
        totalNetStrokes: 80,
        totalGrossStrokes: 86,
        totalPlayers: 12,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('4. plass');
    expect(payload.html).toContain('80 slag netto');
    expect(payload.html).toContain('(86 brutto)');
    expect(payload.html).not.toContain('Gratulerer');
    expect(payload.html).not.toContain('Solid plassering');
    expect(payload.text).toContain('4. plass');
  });

  it('solo strokeplay netto: plain-text inkluderer alle felter (rank, totalPlayers, netto, brutto)', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: 'Fred',
      gameName: 'Vinter-cup',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay_netto',
        rank: 5,
        totalNetStrokes: 82,
        totalGrossStrokes: 88,
        totalPlayers: 10,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.text).toContain('Runden i Vinter-cup er ferdig');
    expect(payload.text).toContain('5. plass av 10');
    expect(payload.text).toContain('82 slag netto');
    expect(payload.text).toContain('(88 brutto)');
    expect(payload.text).toContain('Se leaderboard:');
  });

  it('solo strokeplay netto: bruker «Hei!» når playerFirstName er null', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: null,
      gameName: 'Klubbmesterskap',
      gameId: 'game-5',
      mode: {
        kind: 'solo_strokeplay_netto',
        rank: 2,
        totalNetStrokes: 70,
        totalGrossStrokes: 76,
        totalPlayers: 8,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Hei!');
    expect(payload.html).not.toContain('Hei null');
  });

  // Texas scramble (issue #44). Lag-fokus, n medlemmer (2 eller 4), netto+brutto-slag.
  it('texas: 1.-plass adresserer LAGET med 2-mannslag-partner + «Gratulerer»', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.subject).toBe('Resultatet er klart — Firma-cup');
    expect(payload.html).toContain('Laget endte på');
    expect(payload.html).toContain('1. plass');
    expect(payload.html).toContain('av 4 lag');
    expect(payload.html).toContain('68 slag netto');
    expect(payload.html).toContain('(78 brutto)');
    expect(payload.html).toContain('Gratulerer med seieren');
    expect(payload.html).toContain('Du spilte med <strong>Bjørn</strong>');
    expect(payload.text).toContain('1. plass av 4 lag');
    expect(payload.text).toContain('68 slag netto (78 brutto)');
    expect(payload.text).toContain('Du spilte med Bjørn');
    // Solo-frasen «Du endte på» skal IKKE komme med — team-grenen er lag-fokus.
    expect(payload.html).not.toContain('Du endte på');
  });

  it('texas: 4-mannslag listet med «og» mellom siste to navn', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('2. plass');
    expect(payload.html).toContain('Solid plassering');
    expect(payload.html).toContain(
      'Du spilte med <strong>Bjørn, Carla og Dagfinn</strong>',
    );
    expect(payload.text).toContain('Du spilte med Bjørn, Carla og Dagfinn');
  });

  it('texas: 4.-plass får INGEN celebration, kun nøytralt resultat', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('4. plass');
    expect(payload.html).not.toContain('Gratulerer');
    expect(payload.html).not.toContain('Solid plassering');
    expect(payload.html).toContain('Du spilte med <strong>Bjørn</strong>');
  });

  it('texas: dropper partner-setningen når partnernavn-listen er tom', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
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
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('3. plass');
    expect(payload.html).toContain('Solid plassering');
    expect(payload.html).not.toContain('Du spilte med');
    expect(payload.text).not.toContain('Du spilte med');
  });

  it('texas: bruker «Hei!» når playerFirstName er null', async () => {
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await sendGameFinishedNotification({
      to: 'spiller@example.com',
      playerFirstName: null,
      gameName: 'Firma-cup',
      gameId: 'game-tx-5',
      mode: {
        kind: 'texas_scramble',
        teamRank: 2,
        teamTotalNet: 75,
        teamTotalGross: 82,
        teamPartnerNames: ['Bjørn'],
        totalTeams: 3,
      },
    });
    const payload = sendMock.mock.calls[0]![0];
    expect(payload.html).toContain('Hei!');
    expect(payload.html).not.toContain('Hei null');
  });

  it('kaster når Resend returnerer feil', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate-limited' },
    } as SendResult);
    const { sendGameFinishedNotification } = await import(
      './gameFinishedNotification'
    );
    await expect(
      sendGameFinishedNotification({
        to: 'spiller@example.com',
        playerFirstName: 'Ada',
        gameName: 'Vinter-cup',
        gameId: 'game-1',
      }),
    ).rejects.toThrow(/Resend send failed/);
  });
});
