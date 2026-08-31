// Native sideturnering (#1850): monteringen, ikke matematikken.
//
// Poengreglene er dekket av 1176 tester i `lib/scoring` — de gjentas ikke her.
// Det som kan gå galt på APP-siden er kartleggingen: hvilke spillere som er
// med, hvordan de samles til lag, at netto regnes med riktig slag-indeks, at
// to LD-slots til samme spiller gir to premier, og at inputen vi bygger er den
// samme som et håndbygd kall til motoren.
import type { ModeResult } from '../../../../lib/scoring/modes/types';
import {
  calculateSideTournament,
  type SideTournamentInput,
} from '../../../../lib/scoring/sideTournament';
import type { LocalScore } from '../data/db';
import type { BundleHole, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { SideWinnerRow } from '../data/sideWinners';
import { buildSideTournament, resolveTeamGrouping } from './sideTournament';

const GAME = 'game-1';

// Billige `ModeResult`-literaler. `resolveTeamGrouping` leser KUN
// `kind`/`variant`, så radene under trenger ingen ekte tabell.
const SOLO_STABLEFORD: ModeResult = {
  kind: 'stableford',
  variant: 'solo',
  players: [],
  holes: [],
};
const TEAM_STABLEFORD: ModeResult = {
  kind: 'stableford',
  variant: 'team',
  teams: [],
};
const BEST_BALL: ModeResult = { kind: 'best_ball', teams: [] };

function player(overrides: Partial<BundlePlayer> = {}): BundlePlayer {
  return {
    userId: 'user-a',
    name: 'Anna Berg',
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

/** 18 hull, par 4, slag-indeks = hullnummeret. `skip` utelater hull-RADER. */
function courseHoles(skip: readonly number[] = []): BundleHole[] {
  return Array.from({ length: 18 }, (_, i) => i + 1)
    .filter((holeNumber) => !skip.includes(holeNumber))
    .map((holeNumber) => ({
      holeNumber,
      parMens: 4,
      parLadies: 4,
      parJuniors: 4,
      strokeIndex: holeNumber,
    }));
}

function bundle(overrides: {
  gameMode?: string;
  players?: BundlePlayer[];
  holes?: BundleHole[];
  sideLdCount?: number;
  sideCtpCount?: number;
  sideDisabledCategories?: string[];
  sideTournamentEnabled?: boolean;
}): GameBundle {
  return {
    game: {
      id: GAME,
      name: 'Testrunden',
      status: 'finished',
      gameMode: overrides.gameMode ?? 'best_ball',
      modeConfig: { kind: 'best_ball', team_size: 2 },
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: false,
      scheduledTeeOffAt: null,
      holeSegment: 'full',
      sourceGameId: null,
      createdBy: 'user-a',
      scoreVisibility: 'live',
      tournamentId: null,
      foursomesSide1TeeStarterUserId: null,
      foursomesSide2TeeStarterUserId: null,
      sideTournamentEnabled: overrides.sideTournamentEnabled ?? true,
      sideLdCount: overrides.sideLdCount ?? 0,
      sideCtpCount: overrides.sideCtpCount ?? 0,
      sideDisabledCategories: overrides.sideDisabledCategories ?? [],
    },
    players: overrides.players ?? [player()],
    courseName: 'Testbanen',
    teeBoxName: 'Gul',
    holes: overrides.holes ?? courseHoles(),
    fetchedAt: '2026-08-31T10:00:00.000Z',
  };
}

/** Slag for én spiller, `{ hullnummer: slag }`. */
function scoresFor(
  userId: string,
  strokesByHole: Record<number, number>,
): LocalScore[] {
  return Object.entries(strokesByHole).map(([hole, strokes]) => ({
    id: `${GAME}:${userId}:${hole}`,
    gameId: GAME,
    userId,
    holeNumber: Number(hole),
    strokes,
    putts: null,
    enteredBy: userId,
    clientUpdatedAt: '2026-08-31T10:00:00.000Z',
    serverUpdatedAt: null,
  }));
}

function ldWinner(position: number, userId: string | null): SideWinnerRow {
  return { category: 'longest_drive', position, winner_user_id: userId };
}

/** Alle premier ett lag fikk i én kategori. */
function awardsFor(
  data: ReturnType<typeof buildSideTournament>,
  teamId: number,
  category: string,
) {
  const standing = data.result.teamStandings.find((t) => t.teamId === teamId);
  return (standing?.awards ?? []).filter((a) => a.category === category);
}

// ---------------------------------------------------------------------------
// 1. Slot-fixturen: samme spiller vinner BEGGE LD-hullene.
// ---------------------------------------------------------------------------

describe('LD-slots', () => {
  // `position` er hvilket LD-HULL raden gjelder, ikke en plassering. Vinner
  // samme spiller begge hullene, er det to separate premier — ikke en dublett
  // som skal slås sammen. Dette er kontraktens viktigste enkeltcase.
  const twoSlotGame = () =>
    buildSideTournament({
      bundle: bundle({
        gameMode: 'best_ball',
        sideLdCount: 2,
        players: [
          player({ userId: 'user-a', name: 'Anna Berg', teamNumber: 1 }),
          player({ userId: 'user-b', name: 'Bjørn Dal', teamNumber: 1 }),
          player({ userId: 'user-c', name: 'Cato Eng', teamNumber: 2 }),
          player({ userId: 'user-d', name: 'Dina Foss', teamNumber: 2 }),
        ],
      }),
      scores: [],
      sideWinnerRows: [ldWinner(1, 'user-a'), ldWinner(2, 'user-a')],
      result: BEST_BALL,
    });

  it('gives the same player two separate awards, one per slot', () => {
    const awards = awardsFor(twoSlotGame(), 1, 'longest_drive');
    expect(awards).toHaveLength(2);
    expect(awards.map((a) => a.detail)).toEqual(['Slot 1', 'Slot 2']);
  });

  it('adds both slots to the team total (2p x 2)', () => {
    const awards = awardsFor(twoSlotGame(), 1, 'longest_drive');
    expect(awards.reduce((sum, a) => sum + a.points, 0)).toBe(4);
  });

  it('leaves the other team without a longest-drive award', () => {
    expect(awardsFor(twoSlotGame(), 2, 'longest_drive')).toHaveLength(0);
  });

  it('passes rows with no winner through untouched (arrangøren kåret ingen)', () => {
    const data = buildSideTournament({
      bundle: bundle({
        sideLdCount: 2,
        players: [
          player({ userId: 'user-a', teamNumber: 1 }),
          player({ userId: 'user-c', teamNumber: 2 }),
        ],
      }),
      scores: [],
      sideWinnerRows: [ldWinner(1, 'user-a'), ldWinner(2, null)],
      result: BEST_BALL,
    });
    expect(awardsFor(data, 1, 'longest_drive')).toHaveLength(1);
    // Raden er fortsatt med i visnings-lista, den ga bare ingen poeng.
    expect(data.sideWinners).toEqual([
      { category: 'longest_drive', position: 1, winnerUserId: 'user-a' },
      { category: 'longest_drive', position: 2, winnerUserId: null },
    ]);
  });

  it('ignores a slot beyond the configured ldCount', () => {
    const data = buildSideTournament({
      bundle: bundle({
        sideLdCount: 1,
        players: [player({ userId: 'user-a', teamNumber: 1 })],
      }),
      scores: [],
      sideWinnerRows: [ldWinner(1, 'user-a'), ldWinner(2, 'user-a')],
      result: BEST_BALL,
    });
    expect(awardsFor(data, 1, 'longest_drive')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. WD-filteret
// ---------------------------------------------------------------------------

describe('withdrawn players', () => {
  const withWithdrawn = () =>
    buildSideTournament({
      bundle: bundle({
        gameMode: 'solo_strokeplay',
        sideLdCount: 1,
        players: [
          player({ userId: 'user-a', name: 'Anna Berg' }),
          player({
            userId: 'user-b',
            name: 'Bjørn Dal',
            withdrawnAt: '2026-08-31T12:00:00.000Z',
          }),
        ],
      }),
      scores: [],
      sideWinnerRows: [ldWinner(1, 'user-b')],
      result: SOLO_STABLEFORD,
    });

  it('drops the withdrawn player from every team', () => {
    const data = withWithdrawn();
    expect(data.teams).toHaveLength(1);
    expect(data.teams.flatMap((t) => t.members.map((m) => m.userId))).toEqual([
      'user-a',
    ]);
  });

  it('lets no team collect an award the withdrawn player won', () => {
    const data = withWithdrawn();
    const allAwards = data.result.teamStandings.flatMap((t) => t.awards);
    expect(allAwards.filter((a) => a.category === 'longest_drive')).toHaveLength(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. team_number null / 0
// ---------------------------------------------------------------------------

describe('byTeamNumber grouping', () => {
  it('skips players with no team number (null or 0)', () => {
    const data = buildSideTournament({
      bundle: bundle({
        gameMode: 'best_ball',
        players: [
          player({ userId: 'user-a', teamNumber: 1 }),
          player({ userId: 'user-b', teamNumber: null }),
          player({ userId: 'user-c', teamNumber: 0 }),
          player({ userId: 'user-d', teamNumber: 2 }),
        ],
      }),
      scores: [],
      sideWinnerRows: [],
      result: BEST_BALL,
    });
    expect(data.teams.map((t) => t.teamId)).toEqual([1, 2]);
    expect(data.teams.flatMap((t) => t.members.map((m) => m.userId))).toEqual([
      'user-a',
      'user-d',
    ]);
  });

  it('sorts teams by ascending team number and labels them «Lag N»', () => {
    const data = buildSideTournament({
      bundle: bundle({
        players: [
          player({ userId: 'user-c', teamNumber: 3 }),
          player({ userId: 'user-a', teamNumber: 1 }),
          player({ userId: 'user-b', teamNumber: 2 }),
        ],
      }),
      scores: [],
      sideWinnerRows: [],
      result: BEST_BALL,
    });
    expect(data.teams.map((t) => t.label)).toEqual(['Lag 1', 'Lag 2', 'Lag 3']);
  });
});

// ---------------------------------------------------------------------------
// 4. solo- vs. byTeamNumber-gruppering
// ---------------------------------------------------------------------------

describe('solo grouping', () => {
  const soloData = () =>
    buildSideTournament({
      bundle: bundle({
        gameMode: 'skins',
        players: [
          player({ userId: 'user-a', name: 'Anna Berg', teamNumber: 1 }),
          player({ userId: 'user-b', name: 'Bjørn Dal', teamNumber: 1 }),
          player({ userId: 'user-c', name: null, teamNumber: 2 }),
        ],
      }),
      scores: [],
      sideWinnerRows: [],
      result: SOLO_STABLEFORD,
    });

  it('makes one team of one per player, with a running team id', () => {
    const data = soloData();
    expect(data.teams.map((t) => t.teamId)).toEqual([1, 2, 3]);
    expect(data.teams.map((t) => t.members.map((m) => m.userId))).toEqual([
      ['user-a'],
      ['user-b'],
      ['user-c'],
    ]);
  });

  it('labels each row with the first name, «(ukjent)» when the name is missing', () => {
    expect(soloData().teams.map((t) => t.label)).toEqual([
      'Anna',
      'Bjørn',
      '(ukjent)',
    ]);
  });

  it('keeps nickname formatting in the member display name', () => {
    const data = buildSideTournament({
      bundle: bundle({
        gameMode: 'skins',
        players: [
          player({ userId: 'user-a', name: 'Anna Berg', nickname: 'Ninja' }),
        ],
      }),
      scores: [],
      sideWinnerRows: [],
      result: SOLO_STABLEFORD,
    });
    expect(data.teams[0]!.members[0]).toEqual({
      userId: 'user-a',
      displayName: 'Anna "Ninja" Berg',
      firstName: 'Anna',
    });
  });
});

// ---------------------------------------------------------------------------
// 4b. teamGrouping utledes fra de delte predikatene
// ---------------------------------------------------------------------------

describe('resolveTeamGrouping', () => {
  // Fasiten er webbens 14 renderer-kall (`teamGrouping: '…'` i
  // `leaderboard/formats/*.tsx` + `renderMatchplaySideSection`). Listene under
  // er den fasiten, mode for mode — driver predikatet fra webben, feiler dette.
  const BY_TEAM_NUMBER = [
    'best_ball',
    'singles_matchplay',
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
    'texas_scramble',
    'ambrose',
    'florida_scramble',
    'shamble',
    'patsome',
  ];

  const SOLO = [
    'solo_strokeplay',
    'wolf',
    'nassau',
    'skins',
    'bingo_bango_bongo',
    'nines',
    'round_robin',
    'acey_deucey',
  ];

  // `result` leses KUN for stableford-familien, så literalet er vilkårlig her.
  it.each(BY_TEAM_NUMBER)('groups %s by team number', (mode) => {
    expect(resolveTeamGrouping(mode, BEST_BALL)).toBe('byTeamNumber');
  });

  it.each(SOLO)('groups %s as solo', (mode) => {
    expect(resolveTeamGrouping(mode, BEST_BALL)).toBe('solo');
  });

  // Stableford-familien er den ene «flexible» greina: motorens egen variant
  // avgjør. `modified_stableford` har ingen egen regel — den arver.
  it.each(['stableford', 'modified_stableford'])(
    '%s follows the engine variant: team → byTeamNumber',
    (mode) => {
      expect(resolveTeamGrouping(mode, TEAM_STABLEFORD)).toBe('byTeamNumber');
    },
  );

  it.each(['stableford', 'modified_stableford'])(
    '%s follows the engine variant: solo → solo',
    (mode) => {
      expect(resolveTeamGrouping(mode, SOLO_STABLEFORD)).toBe('solo');
    },
  );

  it('falls back to solo for a mode this app version does not know', () => {
    expect(resolveTeamGrouping('framtidsformat', BEST_BALL)).toBe('solo');
  });
});

// ---------------------------------------------------------------------------
// 5. Netto-regningen og slag-indeks-fallbacken
// ---------------------------------------------------------------------------

describe('netto per hole', () => {
  // Hull 5 mangler som RAD i bundelen, så slag-indeksen må falle tilbake.
  // Fallbacken er 18 (som web), IKKE hullnummeret — og de to gir ulikt svar:
  //   si 18 → strokesForHole(5, 18) = 0 slag  → Anna netto 5, Bjørn netto 4
  //   si  5 → strokesForHole(5, 5)  = 1 slag  → begge netto 4, uavgjort
  // Hull-seieren går derfor til Bjørn KUN med riktig fallback.
  const missingHoleFive = () =>
    buildSideTournament({
      bundle: bundle({
        gameMode: 'skins',
        holes: courseHoles([5]),
        players: [
          player({ userId: 'user-a', name: 'Anna Berg', courseHandicap: 5 }),
          player({ userId: 'user-b', name: 'Bjørn Dal', courseHandicap: 0 }),
        ],
      }),
      scores: [...scoresFor('user-a', { 5: 5 }), ...scoresFor('user-b', { 5: 4 })],
      sideWinnerRows: [],
      result: SOLO_STABLEFORD,
    });

  it('resolves a missing stroke index to 18, not to the hole number', () => {
    const holeWins = missingHoleFive()
      .result.teamStandings.flatMap((t) => t.awards)
      .filter((a) => a.category === 'hole_win');
    expect(holeWins).toHaveLength(1);
    expect(holeWins[0]!.holeNumber).toBe(5);
    // Lag 2 = Bjørn i solo-grupperingen (løpende teamId).
    expect(holeWins[0]!.teamId).toBe(2);
  });

  it('leaves unplayed holes null, never 0', () => {
    // Ingen andre hull har slag, så ingen andre hull kan vinnes. Ville et
    // uspilt hull blitt lest som netto 0, hadde alle 17 gitt en hull-seier.
    const holeWins = missingHoleFive()
      .result.teamStandings.flatMap((t) => t.awards)
      .filter((a) => a.category === 'hole_win');
    expect(holeWins.map((a) => a.holeNumber)).toEqual([5]);
  });
});

// ---------------------------------------------------------------------------
// 6. Motor-paritet: samme standings som et håndbygd kall
// ---------------------------------------------------------------------------

describe('engine parity', () => {
  it('produces the same teamStandings as a hand-built input', () => {
    const players = [
      player({ userId: 'user-a', name: 'Anna Berg', teamNumber: 1 }),
      player({ userId: 'user-b', name: 'Bjørn Dal', teamNumber: 1 }),
      player({ userId: 'user-c', name: 'Cato Eng', teamNumber: 2 }),
      player({ userId: 'user-d', name: 'Dina Foss', teamNumber: 2 }),
    ];
    const scores = [
      ...scoresFor('user-a', { 1: 4, 2: 5, 3: 3 }),
      ...scoresFor('user-b', { 1: 5, 2: 4, 3: 4 }),
      ...scoresFor('user-c', { 1: 3, 2: 4, 3: 5 }),
      ...scoresFor('user-d', { 1: 4, 2: 4, 3: 4 }),
    ];

    const data = buildSideTournament({
      bundle: bundle({ gameMode: 'best_ball', sideLdCount: 1, players }),
      scores,
      sideWinnerRows: [ldWinner(1, 'user-c')],
      result: BEST_BALL,
    });

    // Alle banehandicap er 0, så netto == brutto og tallene kan skrives rett
    // ned — parity-testen skal låse MONTERINGEN, ikke gjenta netto-regningen
    // (den eies av testen over).
    const firstThree = (
      a: number,
      b: number,
      c: number,
    ): Array<number | null> => {
      const holes: Array<number | null> = new Array(18).fill(null);
      holes[0] = a;
      holes[1] = b;
      holes[2] = c;
      return holes;
    };

    const handBuilt: SideTournamentInput = {
      config: {
        enabled: true,
        ldCount: 1,
        ctpCount: 0,
        disabledCategories: [],
      },
      teams: [
        { teamId: 1, userIds: ['user-a', 'user-b'] },
        { teamId: 2, userIds: ['user-c', 'user-d'] },
      ],
      coursePars: new Array(18).fill(4),
      courseStrokeIndices: Array.from({ length: 18 }, (_, i) => i + 1),
      playerScoresPerHole: [
        {
          userId: 'user-a',
          perHoleGross: firstThree(4, 5, 3),
          perHoleNetto: firstThree(4, 5, 3),
        },
        {
          userId: 'user-b',
          perHoleGross: firstThree(5, 4, 4),
          perHoleNetto: firstThree(5, 4, 4),
        },
        {
          userId: 'user-c',
          perHoleGross: firstThree(3, 4, 5),
          perHoleNetto: firstThree(3, 4, 5),
        },
        {
          userId: 'user-d',
          perHoleGross: firstThree(4, 4, 4),
          perHoleNetto: firstThree(4, 4, 4),
        },
      ],
      // Best ball per hull: MIN av lagets to nettoer.
      nettoBestBallPerHole: [
        { teamId: 1, perHoleNetto: firstThree(4, 4, 3) },
        { teamId: 2, perHoleNetto: firstThree(3, 4, 4) },
      ],
      sideWinners: [
        { category: 'longest_drive', position: 1, winnerUserId: 'user-c' },
      ],
    };

    expect(data.result.teamStandings).toEqual(
      calculateSideTournament(handBuilt).teamStandings,
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Konfig-feltene ut igjen
// ---------------------------------------------------------------------------

describe('config passthrough', () => {
  it('narrows the slot counts to 0 | 1 | 2 and drops unknown categories', () => {
    const data = buildSideTournament({
      bundle: bundle({
        sideLdCount: 2,
        sideCtpCount: 7,
        sideDisabledCategories: ['hole_win', 'ikke_en_kategori'],
        players: [player({ userId: 'user-a', teamNumber: 1 })],
      }),
      scores: [],
      sideWinnerRows: [],
      result: BEST_BALL,
    });
    expect(data.ldCount).toBe(2);
    expect(data.ctpCount).toBe(0);
    expect(data.disabledCategories).toEqual(['hole_win']);
  });

  it('awards nothing when the side tournament is switched off', () => {
    const data = buildSideTournament({
      bundle: bundle({
        sideTournamentEnabled: false,
        sideLdCount: 1,
        players: [player({ userId: 'user-a', teamNumber: 1 })],
      }),
      scores: [],
      sideWinnerRows: [ldWinner(1, 'user-a')],
      result: BEST_BALL,
    });
    expect(data.result.teamStandings).toEqual([
      { teamId: 1, totalPoints: 0, awards: [] },
    ]);
  });

  it('returns the 18-element par array', () => {
    const data = buildSideTournament({
      bundle: bundle({ players: [player({ userId: 'user-a', teamNumber: 1 })] }),
      scores: [],
      sideWinnerRows: [],
      result: BEST_BALL,
    });
    expect(data.coursePars).toHaveLength(18);
    expect(data.coursePars.every((par) => par === 4)).toBe(true);
  });
});
