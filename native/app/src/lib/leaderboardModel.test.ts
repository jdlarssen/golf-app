// Native N4 (#1828): teksten og radene leaderboardet viser.
//
// Ingen av disse testene regner golf. De låser to ting:
//  1. at reveal-runden skjuler riktig mye — for lite er en lekkasje, for mye er
//     en tom skjerm i et vanlig spill;
//  2. at match-etikettene sier det motoren mener. Fasiten kommer derfor FRA
//     motoren i den siste testen, ikke fra tall skrevet for hånd her.
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import type { LocalScore } from '../data/db';
import {
  carriedPotLine,
  grossLines,
  leaderboardVisibility,
  matchStanding,
  matchStandingLine,
  matchStrip,
  nameLookup,
  nassauSectionLine,
  teamLabel,
  wolfChoiceLabel,
  wolfHolePointsLine,
  wolfHolesWithStory,
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
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
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
  it('tar bare med hull som faktisk er avgjort, sett fra side 1', () => {
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
      { holeNumber: 5, outcome: 'W' },
    ]);
  });

  it('er tom før noe er avgjort', () => {
    expect(matchStrip([{ holeNumber: 1, result: 'unplayed' }])).toEqual([]);
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
        foursomesSide1TeeStarterUserId: null,
        foursomesSide2TeeStarterUserId: null,
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

    expect(matchStrip(result.holes)).toEqual([
      { holeNumber: 1, outcome: 'W' },
      { holeNumber: 2, outcome: 'L' },
      { holeNumber: 3, outcome: 'T' },
      { holeNumber: 4, outcome: 'W' },
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

  it('viser hull som er valgt eller avgjort, og hopper over de tomme', () => {
    const holes = [
      { holeNumber: 1, choice: 'lone' as const, outcome: 'wolf_side_wins' as const },
      // Valgt, men ikke ferdigspilt — hullet har fortsatt noe å fortelle.
      { holeNumber: 2, choice: 'partner' as const, outcome: 'pending' as const },
      { holeNumber: 3, choice: null, outcome: 'pending' as const },
    ];
    expect(wolfHolesWithStory(holes).map((hole) => hole.holeNumber)).toEqual([1, 2]);
  });
});
