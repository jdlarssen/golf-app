import { describe, it, expect } from 'vitest';
import { buildCupMatchEntry, type CupMatchEntryInput } from './cupMatchEntry';

// Type-A unit-test for én cup-kamps utledning, trukket ut av getCupSnapshot
// (#1522). Låser wiringen rundt kampen: segment-filtrering (#1441 D1/D2),
// side-splitt + navne-labels, leverings-flaggene (#1488/#1502), spiller-ID-ene
// per side (#1497) og hvilke spill som havner i prestasjons-inputen (#1508).

const UNKNOWN = 'Ukjent spiller';

function courseHoles(count = 18) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

/** a1/a2 scorer 4 på alle 18 hull, b1/b2 scorer 5 → side 1 vinner. */
function scores() {
  return Array.from({ length: 18 }, (_, i) => i + 1).flatMap((hole) => [
    { user_id: 'a1', hole_number: hole, strokes: 4 },
    { user_id: 'a2', hole_number: hole, strokes: 4 },
    { user_id: 'b1', hole_number: hole, strokes: 5 },
    { user_id: 'b2', hole_number: hole, strokes: 5 },
  ]);
}

function entryInput(overrides: Partial<CupMatchEntryInput> = {}): CupMatchEntryInput {
  return {
    game: {
      id: 'g1',
      status: 'finished',
      game_mode: 'fourball_matchplay',
      mode_config: null,
      tournament_match_label: 'Kamp 1',
      hole_segment: 'full',
      source_game_id: null,
      score_visibility: 'live',
    },
    players: [
      { user_id: 'a1', team_number: 1, course_handicap: 0, users: { name: 'Per', nickname: null } },
      { user_id: 'a2', team_number: 1, course_handicap: 0, users: { name: 'Kari', nickname: null } },
      { user_id: 'b1', team_number: 2, course_handicap: 0, users: { name: 'Ola', nickname: null } },
      { user_id: 'b2', team_number: 2, course_handicap: 0, users: { name: 'Ida', nickname: null } },
    ],
    scores: scores(),
    courseHoles: courseHoles(),
    submission: { allScorecardsSubmitted: true, allPlayersWithdrawn: false },
    unknownLabel: UNKNOWN,
    ...overrides,
  };
}

describe('buildCupMatchEntry — match-input', () => {
  it('bygger kampens leaderboard-input med labels, sider og status', () => {
    const { match } = buildCupMatchEntry(entryInput());
    expect(match).toMatchObject({
      gameId: 'g1',
      matchLabel: 'Kamp 1',
      team1PlayerName: 'Per/Kari',
      team2PlayerName: 'Ola/Ida',
      gameMode: 'fourball_matchplay',
      status: 'finished',
      sourceGameId: null,
      allScorecardsSubmitted: true,
      allPlayersWithdrawn: false,
      team1UserIds: ['a1', 'a2'],
      team2UserIds: ['b1', 'b2'],
    });
    expect(match.result?.winnerSide).toBe(1);
  });

  it('leverings-flaggene kommer rått fra submission-statusen (#1488 K4/K5)', () => {
    const { match } = buildCupMatchEntry(
      entryInput({ submission: { allScorecardsSubmitted: false, allPlayersWithdrawn: true } }),
    );
    expect(match).toMatchObject({
      allScorecardsSubmitted: false,
      allPlayersWithdrawn: true,
    });
  });

  it('tom side rendres som unknownLabel (defensivt, #217)', () => {
    const { match } = buildCupMatchEntry(entryInput({ players: [] }));
    expect(match).toMatchObject({
      team1PlayerName: UNKNOWN,
      team2PlayerName: UNKNOWN,
      team1UserIds: [],
      team2UserIds: [],
      result: null,
    });
  });

  it('ukjent game_mode faller til singles-stil i visningen', () => {
    const { match } = buildCupMatchEntry(
      entryInput({ game: { ...entryInput().game, game_mode: 'stableford' } }),
    );
    expect(match.gameMode).toBe('singles_matchplay');
    expect(match.result).toBeNull();
  });

  it('blind kamp som pågår viser ikke resultat (#1441 D12)', () => {
    const { match } = buildCupMatchEntry(
      entryInput({
        game: { ...entryInput().game, score_visibility: 'reveal', status: 'active' },
      }),
    );
    expect(match.result).toBeNull();
  });
});

describe('buildCupMatchEntry — segment-filtrering (#1441 D1/D2)', () => {
  it.each<[string, number]>([
    ['full', 18],
    ['front9', 9],
    ['back9', 9],
  ])('%s gir %s hull i prestasjons-inputen', (segment, expectedHoles) => {
    const { performance } = buildCupMatchEntry(
      entryInput({ game: { ...entryInput().game, hole_segment: segment } }),
    );
    expect(performance?.holes).toHaveLength(expectedHoles);
  });

  it('back9 scorer kun hull 10–18', () => {
    const { performance } = buildCupMatchEntry(
      entryInput({ game: { ...entryInput().game, hole_segment: 'back9' } }),
    );
    expect(performance?.holes.map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  // `hole_segment` er NOT NULL DEFAULT 'full' i DB; `?? 'full'` er en defensiv
  // lesing av en manglende verdi, ikke en validering av ukjente strenger (en
  // ukjent segment-streng ville falt gjennom `holesForSegment`s switch). Samme
  // smalhet som før utdraget — DB-CHECK-en er det som holder verdien i unionen.
  it('manglende segment leses defensivt som full', () => {
    const { performance } = buildCupMatchEntry(
      entryInput({
        game: { ...entryInput().game, hole_segment: null as unknown as string },
      }),
    );
    expect(performance?.holes).toHaveLength(18);
  });

  // Arvet matchplay-oppførsel: null spilte hull = «all square». Ikke innført
  // her — samme resultat som før utdraget. Et spill uten bane finnes ikke i
  // praksis (banen er påkrevd ved oppretting).
  it('spill uten bane gir tom hull-liste og AS-resultat', () => {
    const { match, performance } = buildCupMatchEntry(entryInput({ courseHoles: [] }));
    expect(performance?.holes).toEqual([]);
    expect(match.result).toEqual({ winnerSide: 'tied', formatted: 'AS' });
  });
});

describe('buildCupMatchEntry — prestasjons-input (#1508)', () => {
  it.each<[string, boolean]>([
    ['singles_matchplay', true],
    ['fourball_matchplay', true],
    ['best_ball', true],
    ['foursomes_matchplay', false],
    ['greensome_matchplay', false],
    ['chapman_matchplay', false],
    ['gruesome_matchplay', false],
  ])('%s → personlig ført: %s', (gameMode, included) => {
    const { performance } = buildCupMatchEntry(
      entryInput({ game: { ...entryInput().game, game_mode: gameMode } }),
    );
    expect(performance !== null).toBe(included);
  });

  it('en AVLEDET kamp gir ingen prestasjons-input (unngår dobbeltelling, #1441 D3)', () => {
    const { performance } = buildCupMatchEntry(
      entryInput({ game: { ...entryInput().game, source_game_id: 'host-game' } }),
    );
    expect(performance).toBeNull();
  });

  it('prestasjons-inputen bærer banehandicap og rå slag', () => {
    const { performance } = buildCupMatchEntry(
      entryInput({
        players: [
          {
            user_id: 'a1',
            team_number: 1,
            course_handicap: 12,
            users: { name: 'Per', nickname: null },
          },
          { user_id: 'a2', team_number: 2, course_handicap: null, users: null },
        ],
        scores: [
          { user_id: 'a1', hole_number: 1, strokes: 5 },
          { user_id: 'a2', hole_number: 1, strokes: null },
        ],
      }),
    );
    expect(performance?.players).toEqual([
      { userId: 'a1', courseHandicap: 12 },
      // Manglende banehandicap leses som 0 — aldri null videre i kjeden.
      { userId: 'a2', courseHandicap: 0 },
    ]);
    expect(performance?.scores).toEqual([
      { userId: 'a1', holeNumber: 1, strokes: 5 },
      { userId: 'a2', holeNumber: 1, strokes: null },
    ]);
  });
});

describe('buildCupMatchEntry — avledet kamp leser host-ens scores', () => {
  it('singles på back9 av host-ens scorer bygger et resultat', () => {
    const { match } = buildCupMatchEntry(
      entryInput({
        game: {
          ...entryInput().game,
          id: 'derived',
          game_mode: 'singles_matchplay',
          hole_segment: 'back9',
          source_game_id: 'host-game',
        },
        players: [
          {
            user_id: 'a1',
            team_number: 1,
            course_handicap: 0,
            users: { name: 'Per', nickname: null },
          },
          {
            user_id: 'b1',
            team_number: 2,
            course_handicap: 0,
            users: { name: 'Ola', nickname: null },
          },
        ],
      }),
    );
    expect(match).toMatchObject({
      gameId: 'derived',
      sourceGameId: 'host-game',
      gameMode: 'singles_matchplay',
      team1PlayerName: 'Per',
      team2PlayerName: 'Ola',
    });
    expect(match.result?.winnerSide).toBe(1);
  });
});
