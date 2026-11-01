// Native N4 (#1828): teksten og radene leaderboardet viser.
//
// Ingen av disse testene regner golf. De låser to ting:
//  1. at reveal-runden skjuler riktig mye — for lite er en lekkasje, for mye er
//     en tom skjerm i et vanlig spill;
//  2. at match-etikettene sier det motoren mener. Fasiten kommer derfor FRA
//     motoren i den siste testen, ikke fra tall skrevet for hånd her.
import {
  firstHalfHoleNumbersForSegment,
  hiddenHoleNumbersForSegment,
} from '../../../../lib/games/holeScope';
import { buildModeResultFromData } from '../../../../lib/scoring/buildModeResultFromData';
import type { WolfResult } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import type { LocalScore } from '../data/db';
import {
  carriedPotLine,
  firstHalfScope,
  grossLines,
  leaderboardVisibility,
  matchStanding,
  matchStandingLine,
  matchStrip,
  nameLookup,
  nassauSectionLine,
  teamLabel,
  wolfCatchUpRuleLine,
  wolfChoiceLabel,
  wolfHoleHasStory,
  wolfHolePointsLine,
  wolfOutcomeLabel,
} from './leaderboardModel';
import { computeGameLeaderboard } from './scoringContext';

function player(overrides: Partial<BundlePlayer> = {}): BundlePlayer {
  return {
    userId: 'a',
    name: 'Anna Andersen',
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 0,
    teeGender: 'mens',
    acceptedAt: null,
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    withdrawnByUserId: null,
    submittedByUserId: null,
    isGuest: false,
    ...overrides,
  };
}

describe('leaderboardVisibility', () => {
  it.each<[string, string, string, string]>([
    // Vanlig spill: alt vises, uansett status.
    ['live-runde som går', 'live', 'active', 'full'],
    ['live-runde som er ferdig', 'live', 'finished', 'full'],
    // Reveal etter at arrangøren har avsluttet: seremonien er over, alt vises.
    ['reveal-runde som er avsluttet', 'reveal', 'finished', 'full'],
    // Reveal mens runden går: brutto, ingen netto/poeng/plassering.
    ['reveal-runde som går', 'reveal', 'active', 'gross-only'],
  ])('%s', (_label, visibility, status, expected) => {
    expect(leaderboardVisibility(visibility, status, 'stableford')).toBe(expected);
  });

  it('skjuler ALT for matchplay-familien i en reveal-runde som går', () => {
    // En duell har ingen brutto-halvdel å vise: brutto-forskjellen ER
    // stillingen. Samme skille som webbens RevealHiddenView.
    for (const mode of [
      'singles_matchplay',
      'fourball_matchplay',
      'foursomes_matchplay',
      'greensome_matchplay',
      'chapman_matchplay',
      'gruesome_matchplay',
    ] as const) {
      expect(leaderboardVisibility('reveal', 'active', mode)).toBe('hidden');
    }
    // ... men bare i reveal. Et vanlig matchplay viser alt.
    expect(leaderboardVisibility('live', 'active', 'singles_matchplay')).toBe('full');
  });

  // #1981: appen viste bruttosummer for disse der nettsiden viser ingenting.
  // Hele lista per format bor i lib/leaderboard/firstHalfReveal.test.ts; her
  // holder det å vise at appen leser den.
  it.each(['best_ball', 'wolf', 'skins'] as const)(
    'skjuler ALT for %s i en reveal-runde som går, som nettsiden',
    (mode) => {
      expect(leaderboardVisibility('reveal', 'active', mode)).toBe('hidden');
      expect(leaderboardVisibility('live', 'active', mode)).toBe('full');
      expect(leaderboardVisibility('reveal', 'finished', mode)).toBe('full');
    },
  );

  it('viser fortsatt brutto for scramble i en reveal-runde som går, som nettsiden', () => {
    expect(leaderboardVisibility('reveal', 'active', 'texas_scramble')).toBe('gross-only');
  });
});

describe('navn', () => {
  it('bruker kallenavn når det finnes, og faller rolig tilbake', () => {
    const nameOf = nameLookup([
      player({ userId: 'a', name: 'Anna Andersen', nickname: 'Anna' }),
      player({ userId: 'b', name: null, nickname: null }),
    ]);
    expect(nameOf('a')).toBe('Anna');
    expect(nameOf('b')).toBe('Ukjent spiller');
    expect(nameOf('finnes-ikke')).toBe('Ukjent spiller');
  });

  it('setter lagnummeret først og navnene etter', () => {
    const nameOf = nameLookup([
      player({ userId: 'a', nickname: 'Anna' }),
      player({ userId: 'b', nickname: 'Bjørn' }),
    ]);
    expect(teamLabel(2, ['a', 'b'], nameOf)).toBe('Lag 2 · Anna, Bjørn');
    expect(teamLabel(3, [], nameOf)).toBe('Lag 3');
  });
});

describe('matchStrip', () => {
  it('gir én celle per hull i hull-rekkefølge, sett fra side 1, med «—» for uspilte', () => {
    expect(
      matchStrip([
        { holeNumber: 1, result: 'side1_wins' },
        { holeNumber: 2, result: 'side2_wins' },
        { holeNumber: 3, result: 'tied' },
        { holeNumber: 4, result: 'unplayed' },
        { holeNumber: 5, result: 'side1_wins' },
      ]),
    ).toEqual([
      { holeNumber: 1, outcome: 'W' },
      { holeNumber: 2, outcome: 'L' },
      { holeNumber: 3, outcome: 'T' },
      { holeNumber: 4, outcome: '—' },
      { holeNumber: 5, outcome: 'W' },
    ]);
  });

  it('holder på et uspilt hull før noe er avgjort, i stedet for å gi en tom stripe', () => {
    expect(matchStrip([{ holeNumber: 1, result: 'unplayed' }])).toEqual([
      { holeNumber: 1, outcome: '—' },
    ]);
  });

  it('er tom bare når motoren ikke gir noen hull', () => {
    expect(matchStrip([])).toEqual([]);
  });
});

describe('matchStanding + matchStandingLine', () => {
  const decided = (winner: 'side1' | 'side2' | 'tied', formatted: string) => ({
    winner,
    marginUp: winner === 'tied' ? 0 : 3,
    decidedAtHole: 16,
    remainingAtDecision: 2,
    formatted,
  });

  it.each<[string, number, number, ReturnType<typeof decided> | null, string, string]>([
    ['side 1 leder', 2, 5, null, '2up', 'Anna 2up etter 5 hull'],
    ['side 2 leder', -1, 3, null, '1up', 'Bjørn 1up etter 3 hull'],
    ['likt', 0, 4, null, 'AS', 'AS etter 4 hull'],
    ['ingenting avgjort ennå', 0, 0, null, 'AS', 'Ingen hull er avgjort ennå.'],
    ['mat-em', 3, 16, decided('side1', '3&2'), '3&2', 'Anna vant 3&2'],
    ['vunnet på siste', -2, 18, decided('side2', '2up'), '2up', 'Bjørn vant 2up'],
    ['delt etter 18', 0, 18, decided('tied', 'AS'), 'AS', 'Matchen endte AS'],
  ])('%s', (_label, holesUp, holesPlayed, result, label, line) => {
    const standing = matchStanding({ holesUp, result });
    expect(standing.label).toBe(label);
    expect(standing.decided).toBe(result != null);
    expect(
      matchStandingLine({ standing, holesPlayed, side1Name: 'Anna', side2Name: 'Bjørn' }),
    ).toBe(line);
  });

  it('setter ord på det MOTOREN sier — ikke på tall skrevet for hånd her', () => {
    // Fire hull spilt: side 1 tok to, side 2 tok ett, ett delt. Alt under
    // regnes av den delte motoren; testen sjekker bare etiketten.
    const bundle: GameBundle = {
      game: {
        id: 'game-1',
        name: 'Duellen',
        status: 'active',
        gameMode: 'singles_matchplay',
        modeConfig: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        requirePeerApproval: false,
        scheduledTeeOffAt: null,
        holeSegment: 'full',
        sourceGameId: null,
        createdBy: 'a',
        scoreVisibility: 'live',
        tournamentId: null,
        leagueRoundId: null,
        foursomesSide1TeeStarterUserId: null,
        foursomesSide2TeeStarterUserId: null,
        sideTournamentEnabled: false,
        sideLdCount: 0,
        sideCtpCount: 0,
        sideDisabledCategories: [],
      },
      players: [
        player({ userId: 'a', nickname: 'Anna', teamNumber: 1 }),
        player({ userId: 'b', nickname: 'Bjørn', teamNumber: 2 }),
      ],
      courseName: 'Testbanen',
      teeBoxName: 'Gul',
      holes: Array.from({ length: 18 }, (_, i) => ({
        holeNumber: i + 1,
        parMens: 4,
        parLadies: 4,
        parJuniors: 4,
        strokeIndex: i + 1,
      })),
      fetchedAt: '2026-08-30T10:00:00.000Z',
    };
    const scores: LocalScore[] = [
      ['a', 1, 4],
      ['b', 1, 5],
      ['a', 2, 5],
      ['b', 2, 4],
      ['a', 3, 4],
      ['b', 3, 4],
      ['a', 4, 4],
      ['b', 4, 5],
    ].map(([userId, holeNumber, strokes]) => ({
      id: `game-1:${userId}:${holeNumber}`,
      gameId: 'game-1',
      userId: userId as string,
      holeNumber: holeNumber as number,
      strokes: strokes as number,
      putts: null,
      enteredBy: 'a',
      clientUpdatedAt: '2026-08-30T10:00:00.000Z',
      serverUpdatedAt: null,
    }));

    const outcome = computeGameLeaderboard(bundle, scores);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.result.kind !== 'singles_matchplay') {
      throw new Error('forventet et singles_matchplay-resultat fra motoren');
    }
    const result = outcome.result;

    // Én celle per hull på banen: de fire spilte først, så de fjorten som
    // gjenstår som tomme ruter — samme lengde som webbens stripe.
    expect(matchStrip(result.holes)).toEqual([
      { holeNumber: 1, outcome: 'W' },
      { holeNumber: 2, outcome: 'L' },
      { holeNumber: 3, outcome: 'T' },
      { holeNumber: 4, outcome: 'W' },
      ...Array.from({ length: 14 }, (_, i) => ({ holeNumber: i + 5, outcome: '—' })),
    ]);

    const standing = matchStanding(result);
    expect(standing).toEqual({ label: '1up', leader: 'side1', decided: false });
    expect(
      matchStandingLine({
        standing,
        holesPlayed: result.holesPlayed,
        side1Name: 'Anna',
        side2Name: 'Bjørn',
      }),
    ).toBe('Anna 1up etter 4 hull');
  });
});

describe('potter', () => {
  it('sier hva som skjer med skinsene som henger igjen', () => {
    expect(carriedPotLine(0, 'active')).toBeNull();
    expect(carriedPotLine(3, 'active')).toBe('3 skins står i potten til neste hull.');
    // Motoren kjenner ikke status og gir bare tallet — labelen avgjøres her.
    expect(carriedPotLine(3, 'finished')).toBe('3 skins ble aldri vunnet.');
  });

  it('sier at en delt Nassau-seksjon IKKE gir poeng', () => {
    const nameOf = nameLookup([player({ userId: 'a', nickname: 'Anna' })]);
    expect(nassauSectionLine({ winnerUserIds: ['a'], isPending: false }, nameOf)).toBe(
      'Vinner: Anna',
    );
    expect(
      nassauSectionLine({ winnerUserIds: ['a', 'b'], isPending: false }, nameOf),
    ).toBe('Delt — ingen poeng');
    expect(nassauSectionLine({ winnerUserIds: [], isPending: true }, nameOf)).toBe(
      'Ikke avgjort ennå',
    );
  });
});

describe('grossLines', () => {
  const scoreRows = [
    { userId: 'a', strokes: 5 },
    { userId: 'a', strokes: 4 },
    { userId: 'a', strokes: null },
    { userId: 'b', strokes: 6 },
  ];

  it('summerer kun hull med slag, og holder roster-rekkefølgen', () => {
    const lines = grossLines(
      [
        player({ userId: 'a', nickname: 'Anna' }),
        player({ userId: 'b', nickname: 'Bjørn' }),
        player({ userId: 'c', nickname: 'Cato' }),
      ],
      scoreRows,
    );

    // Rekkefølgen er rosterets. En sortering på brutto ville vært en
    // rangering — nettopp det reveal-runden holder tilbake.
    expect(lines).toEqual([
      { userId: 'a', name: 'Anna', totalGross: 9, holesPlayed: 2 },
      { userId: 'b', name: 'Bjørn', totalGross: 6, holesPlayed: 1 },
      { userId: 'c', name: 'Cato', totalGross: 0, holesPlayed: 0 },
    ]);
  });

  it('holder trukne spillere ute', () => {
    const lines = grossLines(
      [
        player({ userId: 'a', nickname: 'Anna' }),
        player({ userId: 'b', nickname: 'Bjørn', withdrawnAt: '2026-08-30T09:00:00Z' }),
      ],
      scoreRows,
    );
    expect(lines.map((line) => line.userId)).toEqual(['a']);
  });
});

describe('wolf-etikettene', () => {
  const nameOf = (userId: string) => (userId === 'b' ? 'Bjørn' : 'Anna');

  it('setter partnerens navn i valget, og lar de andre valgene stå alene', () => {
    expect(wolfChoiceLabel('partner', 'b', nameOf)).toBe('Partner: Bjørn');
    expect(wolfChoiceLabel('lone', null, nameOf)).toBe('Lone Wolf');
    expect(wolfChoiceLabel('blind', null, nameOf)).toBe('Blind Wolf');
    // Ikke valgt ennå og «Venter» på utfallet er to ulike ting på samme linje.
    expect(wolfChoiceLabel(null, null, nameOf)).toBe('Ikke valgt ennå');
    expect(wolfOutcomeLabel('pending')).toBe('Venter');
    expect(wolfOutcomeLabel('wolf_side_wins')).toBe('Wolf vant');
  });

  it('lister bare spillerne som faktisk fikk poeng på hullet', () => {
    // Motoren fyller raden med 0 for alle andre; en linje med «+0» sier ingenting.
    expect(wolfHolePointsLine({ a: 2, b: 2, c: 0 }, nameOf)).toBe('Anna +2 · Bjørn +2');
    expect(wolfHolePointsLine({ a: 0, b: 0 }, nameOf)).toBeNull();
    expect(wolfHolePointsLine({}, nameOf)).toBeNull();
  });

  it('skiller hull med noe å fortelle fra hull der ingenting har skjedd ennå', () => {
    // Avgjort: wolfen valgte, og hullet er spilt ferdig.
    expect(wolfHoleHasStory({ choice: 'lone', outcome: 'wolf_side_wins' })).toBe(true);
    // Valgt, men ikke ferdigspilt — hullet har fortsatt noe å fortelle.
    expect(wolfHoleHasStory({ choice: 'partner', outcome: 'pending' })).toBe(true);
    // Ingen valg og ikke avgjort: bare et hull som venter.
    expect(wolfHoleHasStory({ choice: null, outcome: 'pending' })).toBe(false);
  });
});

describe('wolfCatchUpRuleLine (#2314)', () => {
  const players = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ userId: `p${i}` })) as unknown as WolfResult['players'];

  it.each([
    [3, 'Hull 16–18:', 3],
    [4, 'Hull 17–18:', 4],
    [5, 'Hull 16–18:', 5],
  ])('n=%i gir «%s» og terskel %i', (n, lead, threshold) => {
    expect(wolfCatchUpRuleLine({ rotation: 'catch_up', players: players(n) })).toEqual({
      lead,
      rest: `Ligger den som er sist, minst ${threshold} poeng bak lederen, blir den ulv. Ellers går rundgangen videre.`,
    });
  });

  it('spill fra før #2314 har ingen linje', () => {
    expect(wolfCatchUpRuleLine({ rotation: 'random_with_trailing', players: players(4) })).toBeNull();
  });
});

// #2752, kriterium 4: samme spill gir samme stilling og samme skjulte hull i appen
// og på nettet. Fasiten er de delte funksjonene nettets tavle kaller.
describe('en halvdel av en delt cup-dag', () => {
  const players = (team: number, userId: string): BundlePlayer =>
    player({ userId, teamNumber: team, courseHandicap: 0, name: userId });
  const roster = [players(1, 'a'), players(1, 'b'), players(2, 'c'), players(2, 'd')];
  const holes = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    parMens: 4,
    parLadies: 4,
    parJuniors: 4,
    strokeIndex: i + 1,
  }));
  const bundle = (holeSegment: string, status = 'active'): GameBundle =>
    ({
      game: {
        id: 'g',
        name: 'Best ball',
        status,
        gameMode: 'best_ball',
        modeConfig: { kind: 'best_ball' },
        holeSegment,
        sourceGameId: null,
        scoreVisibility: 'live',
      },
      players: roster,
      holes,
      courseName: null,
      teeBoxName: null,
      fetchedAt: '',
    }) as unknown as GameBundle;
  const stroke = (userId: string, holeNumber: number, strokes = 4): LocalScore => ({
    id: `g#${userId}#${holeNumber}`,
    gameId: 'g',
    userId,
    holeNumber,
    strokes,
    putts: null,
    enteredBy: 'a',
    clientUpdatedAt: '',
    serverUpdatedAt: null,
  });
  const allPlayed = (from: number, to: number) =>
    ['a', 'b', 'c', 'd'].flatMap((userId) =>
      Array.from({ length: to - from + 1 }, (_, i) => stroke(userId, from + i)),
    );

  it.each([
    ['full', [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ['front9', [1, 2, 3, 4, 5]],
    ['back9', [10, 11, 12, 13, 14]],
  ] as const)('%s åpner og viser det nettets port regner ut', (segment, open) => {
    expect(firstHalfHoleNumbersForSegment(segment)).toEqual(open);
    const [from, to] = [open[0], open[open.length - 1]];

    const scope = firstHalfScope(bundle(segment), allPlayed(from, to));

    expect(scope.view).toBe('first-half');
    expect(scope.bundle.holes.map((h) => h.holeNumber)).toEqual(open);
    expect([...new Set(scope.scores.map((s) => s.holeNumber))].sort((a, b) => a - b)).toEqual(open);
  });

  it('venter til første halvdel av SEGMENTET er spilt, ikke hull 1–9', () => {
    expect(firstHalfScope(bundle('back9'), allPlayed(10, 13)).view).toBe('waiting');
    expect(firstHalfScope(bundle('back9'), allPlayed(10, 14)).view).toBe('first-half');
  });

  it('skjuler resten av segmentet til arrangøren avslutter', () => {
    expect(hiddenHoleNumbersForSegment('back9')).toEqual([15, 16, 17, 18]);
    const scope = firstHalfScope(bundle('back9'), allPlayed(10, 18));
    expect(scope.scores.some((s) => s.holeNumber > 14)).toBe(false);

    expect(firstHalfScope(bundle('back9', 'finished'), allPlayed(10, 18)).scores).toHaveLength(36);
  });

  it('motoren regner bare hullene i segmentet, som nettets tavle', () => {
    // Web: `buildModeResultFromData` klipper hullene med `hole_segment`. Slag
    // utenfor segmentet (en feilført rad) skal ikke telle.
    const shared = buildModeResultFromData(
      {
        id: 'g',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball' } as never,
        course_id: 'c',
        hole_segment: 'back9',
      },
      roster.map((p) => ({
        user_id: p.userId,
        team_number: p.teamNumber,
        flight_number: null,
        course_handicap: p.courseHandicap,
        tee_gender: 'mens' as const,
        withdrawn_at: null,
        users: { name: p.name, nickname: null },
      })),
      holes.map((h) => ({
        hole_number: h.holeNumber,
        par_mens: h.parMens,
        par_ladies: h.parLadies,
        par_juniors: h.parJuniors,
        stroke_index: h.strokeIndex,
      })) as never,
      allPlayed(10, 18).map((s) => ({
        user_id: s.userId,
        hole_number: s.holeNumber,
        strokes: s.strokes,
      })),
    );
    const app = computeGameLeaderboard(bundle('back9', 'finished'), [
      ...allPlayed(10, 18),
      stroke('a', 3, 9),
    ]);

    expect(app.ok && app.result).toEqual(shared);
  });
});
