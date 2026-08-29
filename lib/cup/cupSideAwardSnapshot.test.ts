import { describe, it, expect } from 'vitest';
import {
  buildCupSideAwards,
  type CupSideAwardRow,
  type CupSideAwardTeams,
} from './cupSideAwardSnapshot';

// Type-A unit-test for sidepoeng-utfoldingen trukket ut av getCupSnapshot
// (#1522). Tre kontrakter: slot-telling for «1 av 3»-nummereringen (#1489),
// GIR-radenes utfolding til ett poeng-innslag per klarte GIR, og
// vinner→lag-oppslaget via rosteret (#1441 D9).

const TEAMS: CupSideAwardTeams = {
  team1UserIds: new Set(['a1', 'a2']),
  team2UserIds: new Set(['b1']),
};

function ctp(overrides: Partial<CupSideAwardRow> = {}): CupSideAwardRow {
  return {
    id: 'sa1',
    kind: 'ctp',
    hole_number: 7,
    points: 1,
    winner_user_id: null,
    no_winner: false,
    slot: 1,
    gir_max_per_team: null,
    gir_team1_count: null,
    gir_team2_count: null,
    ...overrides,
  };
}

function gir(overrides: Partial<CupSideAwardRow> = {}): CupSideAwardRow {
  return ctp({
    id: 'sa-gir',
    kind: 'gir',
    hole_number: 3,
    points: 0.5,
    gir_max_per_team: 2,
    gir_team1_count: null,
    gir_team2_count: null,
    ...overrides,
  });
}

describe('buildCupSideAwards — vinner → lag (#1441 D9)', () => {
  it.each<[string, string | null, 1 | 2 | null]>([
    ['uregistrert vinner', null, null],
    ['spiller på lag 1', 'a1', 1],
    ['annen spiller på lag 1', 'a2', 1],
    ['spiller på lag 2', 'b1', 2],
    ['vinner utenfor rosteret (defensivt)', 'ghost', null],
  ])('%s → winnerTeam %s', (_desc, winnerUserId, expected) => {
    const { sideAwards, leaderboardInputs } = buildCupSideAwards(
      [ctp({ winner_user_id: winnerUserId })],
      TEAMS,
    );
    expect(sideAwards[0]).toMatchObject({ winnerTeam: expected, winnerUserId });
    expect(leaderboardInputs[0]).toEqual({
      kind: 'ctp',
      holeNumber: 7,
      points: 1,
      winnerTeam: expected,
    });
  });
});

describe('buildCupSideAwards — kind-normalisering', () => {
  it.each<[string, 'ctp' | 'ld']>([
    ['ctp', 'ctp'],
    ['ld', 'ld'],
  ])('%s beholdes', (kind, expected) => {
    const { sideAwards } = buildCupSideAwards([ctp({ kind })], TEAMS);
    expect(sideAwards[0].kind).toBe(expected);
  });

  it('ukjent kind normaliseres til ctp (typesikker fallback)', () => {
    const { sideAwards } = buildCupSideAwards([ctp({ kind: 'mystery' })], TEAMS);
    expect(sideAwards[0].kind).toBe('ctp');
  });
});

describe('buildCupSideAwards — slotCount (#1489)', () => {
  it('søsken-slots på samme (kind, hull, points) teller hverandre', () => {
    const rows = [
      ctp({ id: 's1', slot: 1 }),
      ctp({ id: 's2', slot: 2 }),
      ctp({ id: 's3', slot: 3 }),
    ];
    const { sideAwards } = buildCupSideAwards(rows, TEAMS);
    expect(sideAwards.map((a) => 'slotCount' in a && a.slotCount)).toEqual([3, 3, 3]);
    expect(sideAwards.map((a) => a.id)).toEqual(['s1', 's2', 's3']);
  });

  it('gammel cup uten slots får slotCount 1', () => {
    const { sideAwards } = buildCupSideAwards([ctp()], TEAMS);
    expect(sideAwards[0]).toMatchObject({ slotCount: 1, slot: 1 });
  });

  it.each<[string, Partial<CupSideAwardRow>]>([
    ['ulikt hull', { hole_number: 9 }],
    ['ulik kind', { kind: 'ld' }],
    ['ulik points (umulig DB-tilstand)', { points: 2 }],
  ])('%s grupperes IKKE sammen', (_desc, differing) => {
    const { sideAwards } = buildCupSideAwards(
      [ctp({ id: 's1' }), ctp({ id: 's2', ...differing })],
      TEAMS,
    );
    expect(sideAwards.map((a) => 'slotCount' in a && a.slotCount)).toEqual([1, 1]);
  });

  it('gir-rader teller ikke inn i slot-grupperingen', () => {
    const { sideAwards } = buildCupSideAwards([ctp({ id: 's1' }), gir()], TEAMS);
    expect(sideAwards[0]).toMatchObject({ slotCount: 1 });
  });
});

describe('buildCupSideAwards — noWinner (#1530)', () => {
  it.each<[string, boolean, boolean]>([
    ['arrangøren har svart «ingen vant»', true, true],
    ['ikke tastet ennå', false, false],
  ])('%s', (_desc, noWinner, expected) => {
    const { sideAwards } = buildCupSideAwards([ctp({ no_winner: noWinner })], TEAMS);
    expect(sideAwards[0]).toMatchObject({ noWinner: expected });
  });

  it('rad uten flagget (pre-0157) leses som «ikke tastet ennå»', () => {
    const row = ctp();
    delete (row as Partial<CupSideAwardRow>).no_winner;
    const { sideAwards } = buildCupSideAwards([row], TEAMS);
    expect(sideAwards[0]).toMatchObject({ noWinner: false });
  });
});

describe('buildCupSideAwards — GIR-utfolding (#1489)', () => {
  it.each<[string, number | null, number | null, number, number]>([
    ['uregistrert (null/null)', null, null, 0, 0],
    ['eksplisitt null GIR', 0, 0, 0, 0],
    ['to på lag 1, ett på lag 2', 2, 1, 2, 1],
    ['kun lag 2', null, 2, 0, 2],
  ])('%s → %s+%s innslag', (_desc, team1Count, team2Count, expect1, expect2) => {
    const { leaderboardInputs } = buildCupSideAwards(
      [gir({ gir_team1_count: team1Count, gir_team2_count: team2Count })],
      TEAMS,
    );
    expect(leaderboardInputs.filter((i) => i.winnerTeam === 1)).toHaveLength(expect1);
    expect(leaderboardInputs.filter((i) => i.winnerTeam === 2)).toHaveLength(expect2);
    expect(leaderboardInputs.every((i) => i.kind === 'gir' && i.points === 0.5)).toBe(true);
  });

  it('gir-snapshotet beholder tellerne rått og defaulter maxPerTeam til 1', () => {
    const { sideAwards } = buildCupSideAwards(
      [gir({ gir_max_per_team: null, gir_team1_count: 0, gir_team2_count: null })],
      TEAMS,
    );
    expect(sideAwards[0]).toEqual({
      id: 'sa-gir',
      kind: 'gir',
      holeNumber: 3,
      points: 0.5,
      maxPerTeam: 1,
      team1Count: 0,
      team2Count: null,
    });
  });
});

describe('buildCupSideAwards — rekkefølge og tomme input', () => {
  it('tom liste gir to tomme lister', () => {
    expect(buildCupSideAwards([], TEAMS)).toEqual({ sideAwards: [], leaderboardInputs: [] });
  });

  it('snapshot-rekkefølgen følger radrekkefølgen på tvers av kinds', () => {
    const rows = [ctp({ id: 's1' }), gir({ id: 's2' }), ctp({ id: 's3', kind: 'ld' })];
    const { sideAwards } = buildCupSideAwards(rows, TEAMS);
    expect(sideAwards.map((a) => a.id)).toEqual(['s1', 's2', 's3']);
    expect(sideAwards.map((a) => a.kind)).toEqual(['ctp', 'gir', 'ld']);
  });
});
