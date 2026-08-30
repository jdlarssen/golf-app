// Native N4 (#1828): lag-føringen.
//
// To ting testes her, og de er ulike i natur:
//
//  1. **Grupperingen** — ren mapping fra roster til kort. Kaptein-regelen selv
//     er delt (`teamScoreOwnerId`), så det som prøves er at appen mater den
//     riktig: trukkede med i grunnlaget, aktive i visningen, tomt lag ut.
//  2. **Badgen** — kjøres gjennom den EKTE motoren, ikke et håndbygd
//     `ModeResult`. Et hjemmesnekret resultat-objekt ville bevist at koden
//     leser feltet den selv fylte ut; her må tallet komme hele veien fra
//     `mode_config` gjennom `computeLeaderboard`. Det er hele poenget med at
//     appen ikke har sin egen handicap-formel.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import type { LocalScore } from '../data/db';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import { nameLookup } from './leaderboardModel';
import { computePrimaryCtaState, nextUnfilledHole } from './primaryCtaState';
import { toRoster } from './roster';
import { computeGameLeaderboard } from './scoringContext';
import {
  buildTeamCards,
  filledHolesForOwner,
  findMyTeamCard,
  foursomesTeeStarterId,
  myTeamCaptainId,
  teamExtraForHole,
} from './teamPlay';

const SCRAMBLE: GameMode = 'texas_scramble';
const FOURSOMES: GameMode = 'foursomes_matchplay';
const SOLO: GameMode = 'solo_strokeplay';

function player(
  overrides: Partial<BundlePlayer> & { userId: string },
): BundlePlayer {
  return {
    name: overrides.userId,
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

function game(overrides: Partial<BundleGame>): BundleGame {
  return {
    id: 'game-1',
    name: 'Testrunden',
    status: 'active',
    gameMode: SCRAMBLE,
    modeConfig: null,
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
    ...overrides,
  };
}

/** 18 hull med SI = hullnummer, så «SI n» og «hull n» er samme tall i testene. */
const HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  parMens: 4,
  parLadies: 5,
  parJuniors: 4,
  strokeIndex: i + 1,
}));

function bundle(
  gameOverrides: Partial<BundleGame>,
  players: BundlePlayer[],
): GameBundle {
  return {
    game: game(gameOverrides),
    players,
    courseName: 'Testbanen',
    teeBoxName: 'Gul',
    holes: HOLES,
    fetchedAt: '2026-08-30T10:00:00.000Z',
  };
}

function score(overrides: Partial<LocalScore> & { userId: string; holeNumber: number }): LocalScore {
  return {
    gameId: 'game-1',
    strokes: 5,
    putts: null,
    clientUpdatedAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  } as LocalScore;
}

describe('buildTeamCards', () => {
  const nameOf = nameLookup([
    player({ userId: 'anna', name: 'Anna Andersen' }),
    player({ userId: 'bjorn', name: 'Bjørn Berg' }),
    player({ userId: 'cato', name: 'Cato Carlsen' }),
    player({ userId: 'dina', name: 'Dina Dahl' }),
  ]);

  it('ett kort per lag, sortert på lagnummer, med kaptein = lex-min', () => {
    const roster = toRoster([
      player({ userId: 'dina', teamNumber: 2 }),
      player({ userId: 'bjorn', teamNumber: 1 }),
      player({ userId: 'cato', teamNumber: 2 }),
      player({ userId: 'anna', teamNumber: 1 }),
    ]);

    const cards = buildTeamCards(roster, nameOf);

    expect(cards.map((card) => card.teamNumber)).toEqual([1, 2]);
    expect(cards[0]!.captainId).toBe('anna');
    expect(cards[1]!.captainId).toBe('cato');
    expect(cards[0]!.memberIds).toEqual(['anna', 'bjorn']);
  });

  it('overskriften er «Lag N · Fornavn, Fornavn»', () => {
    const roster = toRoster([
      player({ userId: 'anna', teamNumber: 1 }),
      player({ userId: 'bjorn', teamNumber: 1 }),
    ]);

    expect(buildTeamCards(roster, nameOf)[0]!.label).toBe('Lag 1 · Anna, Bjørn');
  });

  it('et helt trukket lag faller ut — ingen kan taste på det', () => {
    const roster = toRoster([
      player({ userId: 'anna', teamNumber: 1 }),
      player({ userId: 'bjorn', teamNumber: 1 }),
      player({ userId: 'cato', teamNumber: 2, withdrawnAt: '2026-08-30T09:00:00.000Z' }),
      player({ userId: 'dina', teamNumber: 2, withdrawnAt: '2026-08-30T09:00:00.000Z' }),
    ]);

    expect(buildTeamCards(roster, nameOf).map((card) => card.teamNumber)).toEqual([1]);
  });

  it('en trukket makker teller ikke som kaptein og vises ikke på kortet', () => {
    const roster = toRoster([
      player({ userId: 'anna', teamNumber: 1, withdrawnAt: '2026-08-30T09:00:00.000Z' }),
      player({ userId: 'bjorn', teamNumber: 1 }),
    ]);

    const card = buildTeamCards(roster, nameOf)[0]!;
    expect(card.captainId).toBe('bjorn');
    expect(card.memberIds).toEqual(['bjorn']);
  });

  it('spillere uten lagnummer hører ikke hjemme i et lagkort', () => {
    const roster = toRoster([
      player({ userId: 'anna', teamNumber: 1 }),
      player({ userId: 'bjorn' }),
    ]);

    expect(buildTeamCards(roster, nameOf)[0]!.memberIds).toEqual(['anna']);
  });

  it('«levert» og «godkjent» er lagets stempel — ett medlem holder', () => {
    const roster = toRoster([
      player({ userId: 'anna', teamNumber: 1 }),
      player({
        userId: 'bjorn',
        teamNumber: 1,
        submittedAt: '2026-08-30T12:00:00.000Z',
        approvedAt: '2026-08-30T12:05:00.000Z',
      }),
    ]);

    const card = buildTeamCards(roster, nameOf)[0]!;
    expect(card.submittedAt).toBe('2026-08-30T12:00:00.000Z');
    expect(card.approvedAt).toBe('2026-08-30T12:05:00.000Z');
  });

  it('tomt roster gir ingen kort', () => {
    expect(buildTeamCards([], nameOf)).toEqual([]);
  });
});

describe('findMyTeamCard / myTeamCaptainId', () => {
  const roster = toRoster([
    player({ userId: 'anna', teamNumber: 1 }),
    player({ userId: 'bjorn', teamNumber: 1 }),
    player({ userId: 'cato', teamNumber: 2 }),
  ]);
  const nameOf = nameLookup([]);

  it('finner kortet jeg står på, ikke motstanderens', () => {
    const card = findMyTeamCard(buildTeamCards(roster, nameOf), 'bjorn');
    expect(card?.teamNumber).toBe(1);
  });

  it('kapteinen for mitt lag er den som eier radene', () => {
    expect(myTeamCaptainId(roster, 'bjorn')).toBe('anna');
  });

  it('uten lagnummer finnes ingen kaptein — jeg fører mine egne rader', () => {
    const flat = toRoster([player({ userId: 'anna' })]);
    expect(myTeamCaptainId(flat, 'anna')).toBeNull();
  });

  it('en som ikke er med i spillet har heller ingen kaptein', () => {
    expect(myTeamCaptainId(roster, 'ukjent')).toBeNull();
  });
});

describe('filledHolesForOwner', () => {
  const scores = [
    score({ userId: 'anna', holeNumber: 1 }),
    score({ userId: 'anna', holeNumber: 2 }),
    score({ userId: 'bjorn', holeNumber: 3 }),
    // Putter uten slag er ikke et ført hull.
    score({ userId: 'anna', holeNumber: 4, strokes: null, putts: 2 }),
  ];

  it('lag-format: hullene telles på KAPTEINENS rader, ikke mine', () => {
    expect(filledHolesForOwner(scores, SCRAMBLE, 'bjorn', 'anna')).toEqual([1, 2]);
  });

  it('solo-format: mine egne rader, selv om laget har en kaptein', () => {
    expect(filledHolesForOwner(scores, SOLO, 'bjorn', 'anna')).toEqual([3]);
  });

  it('uten kaptein faller alt tilbake til mine egne rader', () => {
    expect(filledHolesForOwner(scores, SCRAMBLE, 'bjorn', null)).toEqual([3]);
  });
});

describe('CTA-en på spill-hjem for et lagkort', () => {
  const roster = toRoster([
    player({ userId: 'anna', teamNumber: 1 }),
    player({ userId: 'bjorn', teamNumber: 1 }),
  ]);
  const nameOf = nameLookup([]);

  it('peker på lagets neste ufylte hull, ikke mitt eget', () => {
    // Kapteinen (anna) har ført hull 1–3; jeg (bjorn) har en gammel egen rad
    // på hull 1 som ikke lenger er lagets kort.
    const scores = [
      score({ userId: 'anna', holeNumber: 1 }),
      score({ userId: 'anna', holeNumber: 2 }),
      score({ userId: 'anna', holeNumber: 3 }),
      score({ userId: 'bjorn', holeNumber: 1 }),
    ];
    const filled = filledHolesForOwner(scores, SCRAMBLE, 'bjorn', 'anna');

    expect(filled).toEqual([1, 2, 3]);
    expect(nextUnfilledHole(filled)).toBe(4);
  });

  it('leverer én på laget, står CTA-en som levert for alle', () => {
    const submitted = toRoster([
      player({ userId: 'anna', teamNumber: 1, submittedAt: '2026-08-30T12:00:00.000Z' }),
      player({ userId: 'bjorn', teamNumber: 1 }),
    ]);
    const card = findMyTeamCard(buildTeamCards(submitted, nameOf), 'bjorn')!;

    expect(
      computePrimaryCtaState({
        strokesCount: 3,
        totalHoles: 18,
        submittedAt: card.submittedAt,
        approvedAt: card.approvedAt,
        requirePeerApproval: true,
      }),
    ).toBe('submitted_pending_approval');
  });

  it('uten lagets stempel går CTA-en videre som vanlig', () => {
    const card = findMyTeamCard(buildTeamCards(roster, nameOf), 'bjorn')!;

    expect(
      computePrimaryCtaState({
        strokesCount: 3,
        totalHoles: 18,
        submittedAt: card.submittedAt,
        approvedAt: card.approvedAt,
        requirePeerApproval: true,
      }),
    ).toBe('in_progress');
  });
});

// ---------------------------------------------------------------------------
// Badgen — hele veien gjennom den delte motoren
// ---------------------------------------------------------------------------

/**
 * 2×2 scramble. Lag 1 har combined CH 40, lag 2 har 10; `team_handicap_pct`
 * 25 gir lag-handicap 10 og 3 (motorens tall, ikke våre).
 */
const scrambleBundle = bundle(
  {
    gameMode: SCRAMBLE,
    modeConfig: {
      kind: 'texas_scramble',
      team_size: 2,
      teams_count: 2,
      team_handicap_pct: 25,
    },
  },
  [
    player({ userId: 'anna', teamNumber: 1, courseHandicap: 20 }),
    player({ userId: 'bjorn', teamNumber: 1, courseHandicap: 20 }),
    player({ userId: 'cato', teamNumber: 2, courseHandicap: 4 }),
    player({ userId: 'dina', teamNumber: 2, courseHandicap: 6 }),
  ],
);

/**
 * 2v2 foursomes. Side 1 har combined 40, side 2 har 10; `allowance_pct` 50 gir
 * høysiden 15 slag og lavsiden 0.
 */
const foursomesBundle = bundle(
  {
    gameMode: FOURSOMES,
    modeConfig: {
      kind: 'foursomes_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    },
  },
  [
    player({ userId: 'anna', teamNumber: 1, courseHandicap: 20 }),
    player({ userId: 'bjorn', teamNumber: 1, courseHandicap: 20 }),
    player({ userId: 'cato', teamNumber: 2, courseHandicap: 4 }),
    player({ userId: 'dina', teamNumber: 2, courseHandicap: 6 }),
  ],
);

/**
 * 2v2 greensome — formatet N4 faktisk må bære (epic #1816). Samme resultat-form
 * som foursomes (`kind: 'foursomes_matchplay'`), men lag-handicapet regnes
 * 60/40 på side-nivå i stedet for som sum. Nettopp derfor kan appen ikke ha
 * sin egen formel: to formater i samme familie, to ulike regnestykker, ett
 * felles svar fra motoren.
 */
const greensomeBundle = bundle(
  {
    gameMode: 'greensome_matchplay',
    modeConfig: {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    },
  },
  [
    player({ userId: 'anna', teamNumber: 1, courseHandicap: 24 }),
    player({ userId: 'bjorn', teamNumber: 1, courseHandicap: 16 }),
    player({ userId: 'cato', teamNumber: 2, courseHandicap: 4 }),
    player({ userId: 'dina', teamNumber: 2, courseHandicap: 6 }),
  ],
);

describe('teamExtraForHole', () => {
  it('scramble: lagets teamHandicap fra motoren, fordelt med delt SI-allokering', () => {
    const outcome = computeGameLeaderboard(scrambleBundle, [
      score({ userId: 'anna', holeNumber: 1, strokes: 4 }),
      score({ userId: 'cato', holeNumber: 1, strokes: 5 }),
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.result.kind !== 'texas_scramble') {
      throw new Error('forventet et scramble-resultat fra motoren');
    }
    const [team1, team2] = outcome.result.teams.sort(
      (a, b) => a.teamNumber - b.teamNumber,
    );

    // Fasiten er motorens egne tall — testen skal falle hvis app-siden begynner
    // å regne selv.
    expect(teamExtraForHole(outcome, 1, 1, 1)).toBe(
      strokesForHole(team1!.teamHandicap, 1),
    );
    expect(teamExtraForHole(outcome, 2, 1, 1)).toBe(
      strokesForHole(team2!.teamHandicap, 1),
    );
    // …og de tallene er ulike, så testen kan ikke passere på en tilfeldighet.
    expect(teamExtraForHole(outcome, 1, 1, 1)).toBe(1);
    expect(teamExtraForHole(outcome, 1, 12, 12)).toBe(0);
  });

  it('alternate shot: hullets per-side-extra, høysiden får slagene', () => {
    const outcome = computeGameLeaderboard(foursomesBundle, [
      score({ userId: 'anna', holeNumber: 1, strokes: 5 }),
      score({ userId: 'cato', holeNumber: 1, strokes: 4 }),
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.result.kind !== 'foursomes_matchplay') {
      throw new Error('forventet et foursomes-resultat fra motoren');
    }
    const row = outcome.result.holes.find((hole) => hole.holeNumber === 1)!;

    expect(teamExtraForHole(outcome, 1, 1, 1)).toBe(row.side1Extra);
    expect(teamExtraForHole(outcome, 2, 1, 1)).toBe(row.side2Extra);
    expect(row.side1Extra).toBe(1);
    expect(row.side2Extra).toBe(0);
    // Hull 16 ligger utenfor de 15 slagene høysiden fikk.
    expect(teamExtraForHole(outcome, 1, 16, 16)).toBe(0);
  });

  it('greensome: 60/40-siden fra motoren, ikke foursomes-summen', () => {
    const outcome = computeGameLeaderboard(greensomeBundle, [
      score({ userId: 'anna', holeNumber: 1, strokes: 5 }),
      score({ userId: 'cato', holeNumber: 1, strokes: 4 }),
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.result.kind !== 'foursomes_matchplay') {
      throw new Error('forventet et foursomes-formet resultat fra motoren');
    }
    const row = outcome.result.holes.find((hole) => hole.holeNumber === 1)!;

    expect(teamExtraForHole(outcome, 1, 1, 1)).toBe(row.side1Extra);
    expect(teamExtraForHole(outcome, 2, 1, 1)).toBe(row.side2Extra);
    // 60/40: side 1 = 0,6×16 + 0,4×24 = 19, side 2 = 0,6×4 + 0,4×6 = 5.
    // Differansen 14 × 50 % = 7 slag til høysiden, fordelt på SI 1–7.
    expect(row.side1Extra).toBe(1);
    expect(row.side2Extra).toBe(0);
    expect(teamExtraForHole(outcome, 1, 7, 7)).toBe(1);
    expect(teamExtraForHole(outcome, 1, 8, 8)).toBe(0);
  });

  it('greensome med manuelt tastede lag-slag: motoren bestemmer, appen speiler', () => {
    // #1447: arrangøren kan overstyre side-handicapene. Regnet appen selv,
    // ville den ignorert overstyringen og vist feil badge hele runden.
    const outcome = computeGameLeaderboard(
      bundle(
        {
          gameMode: 'greensome_matchplay',
          modeConfig: {
            kind: 'greensome_matchplay',
            team_size: 2,
            teams_count: 2,
            allowance_pct: 100,
            team_strokes_override: { team1: 30, team2: 6 },
          },
        },
        greensomeBundle.players,
      ),
      [],
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.result.kind !== 'foursomes_matchplay') {
      throw new Error('forventet et foursomes-formet resultat fra motoren');
    }

    // Overstyringen gir differanse 24 til høysiden — ikke 14 som formelen over.
    expect(teamExtraForHole(outcome, 1, 6, 6)).toBe(2);
    expect(teamExtraForHole(outcome, 2, 6, 6)).toBe(0);
  });

  it('et lag motoren ikke kjenner gir ingen badge', () => {
    const outcome = computeGameLeaderboard(scrambleBundle, []);
    expect(teamExtraForHole(outcome, 7, 1, 1)).toBeNull();
  });

  it('et hull utenfor banen gir ingen badge', () => {
    const outcome = computeGameLeaderboard(foursomesBundle, []);
    expect(teamExtraForHole(outcome, 1, 99, 1)).toBeNull();
  });

  it('kan ikke motoren svare, vises ingen badge — aldri et gjettet null', () => {
    // Wolf er gatet nettopp fordi halve regnestykket ligger i en tabell appen
    // ikke henter; adapteren svarer `needs-choices`.
    const outcome = computeGameLeaderboard(
      bundle({ gameMode: 'wolf', modeConfig: { kind: 'wolf' } }, [
        player({ userId: 'anna', teamNumber: 1 }),
      ]),
      [],
    );
    expect(outcome.ok).toBe(false);
    expect(teamExtraForHole(outcome, 1, 1, 1)).toBeNull();
  });

  it('et format uten lag-badge (solo) gir ingen badge', () => {
    const outcome = computeGameLeaderboard(
      bundle(
        { gameMode: SOLO, modeConfig: { kind: 'solo_strokeplay', team_size: 1 } },
        [player({ userId: 'anna', courseHandicap: 12 })],
      ),
      [score({ userId: 'anna', holeNumber: 1, strokes: 5 })],
    );
    expect(outcome.ok).toBe(true);
    expect(teamExtraForHole(outcome, 1, 1, 1)).toBeNull();
  });
});

describe('foursomesTeeStarterId', () => {
  const base = {
    gameMode: FOURSOMES,
    game: {
      foursomesSide1TeeStarterUserId: 'anna',
      foursomesSide2TeeStarterUserId: 'cato',
    },
    teamNumber: 1,
    memberIds: ['anna', 'bjorn'],
  };

  it('odde hull: den siden valgte', () => {
    expect(foursomesTeeStarterId({ ...base, holeNumber: 7 })).toBe('anna');
  });

  it('like hull: makkeren', () => {
    expect(foursomesTeeStarterId({ ...base, holeNumber: 8 })).toBe('bjorn');
  });

  it('hver side leser sin egen kolonne', () => {
    expect(
      foursomesTeeStarterId({
        ...base,
        teamNumber: 2,
        memberIds: ['cato', 'dina'],
        holeNumber: 1,
      }),
    ).toBe('cato');
  });

  it('uten valg: ingen hint', () => {
    expect(
      foursomesTeeStarterId({
        ...base,
        game: {
          foursomesSide1TeeStarterUserId: null,
          foursomesSide2TeeStarterUserId: null,
        },
        holeNumber: 1,
      }),
    ).toBeNull();
  });

  it('den valgte står ikke lenger på laget: ingen hint', () => {
    expect(
      foursomesTeeStarterId({ ...base, memberIds: ['cato', 'dina'], holeNumber: 1 }),
    ).toBeNull();
  });

  it('rotasjonen er foursomes-eksklusiv — greensome har den ikke', () => {
    expect(
      foursomesTeeStarterId({
        ...base,
        gameMode: 'greensome_matchplay',
        holeNumber: 1,
      }),
    ).toBeNull();
  });
});
