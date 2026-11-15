import { describe, expect, it } from 'vitest';
import type { CupNamedPlayerRow } from './cupRoster';
import {
  buildCupSideReports,
  type BuildCupSideReportsInput,
  type CupGirClaimRow,
  type CupReportAward,
  type CupReportGame,
  type CupSideClaimRow,
} from './cupSideReports';

// Type A (#2283, E1): what the cup's matches reported, joined to the cup's
// matches for the organiser's boxes (drawings V3/V4). The lines, the sums and
// «does this match report on the hole» are tested in `sideClaimReports.test.ts`
// and `sideContest.test.ts`; this pins the join: the match as the sender, the
// matches that have not reported, and what a derived game or a split day does.

const row = (user_id: string, name: string, team_number: 1 | 2): CupNamedPlayerRow => ({
  user_id,
  team_number,
  users: { name, nickname: null },
  withdrawn_at: null,
});

// The drawing's cup: Rød (Jonas, Marte, Sigrid, Kristian) against Blå (Tore, Kari, Anders, Ingrid).
const fourball1: CupReportGame = {
  id: 'g1',
  matchLabel: 'Four-ball 1',
  status: 'active',
  gameMode: 'fourball_matchplay',
  holeSegment: 'full',
  sourceGameId: null,
  players: [row('jonas', 'Jonas Berg', 1), row('marte', 'Marte Lie', 1), row('tore', 'Tore Lunde', 2), row('kari', 'Kari Nilsen', 2)],
};
const fourball2: CupReportGame = {
  id: 'g2',
  matchLabel: 'Four-ball 2',
  status: 'active',
  gameMode: 'fourball_matchplay',
  holeSegment: 'full',
  sourceGameId: null,
  players: [row('sigrid', 'Sigrid Aas', 1), row('kristian', 'Kristian Holm', 1), row('anders', 'Anders Moe', 2), row('ingrid', 'Ingrid Dahl', 2)],
};

const CTP3: CupReportAward = { kind: 'ctp', holeNumber: 3 };
const LD9: CupReportAward = { kind: 'ld', holeNumber: 9 };
const GIR5: CupReportAward = { kind: 'gir', holeNumber: 5, maxPerTeam: 2 };

const side = (over: Partial<CupSideClaimRow> & Pick<CupSideClaimRow, 'game_id'>): CupSideClaimRow => ({
  category: 'closest_to_pin',
  hole_number: 3,
  flight_number: 0,
  winner_user_id: null,
  distance_m: null,
  ...over,
});
const gir = (game_id: string, user_id: string, hit: boolean, hole_number = 5): CupGirClaimRow => ({
  game_id,
  hole_number,
  user_id,
  hit,
});

const build = (over: Partial<BuildCupSideReportsInput> = {}) =>
  buildCupSideReports({
    awards: [CTP3, LD9, GIR5],
    games: [fourball1, fourball2],
    sideClaims: [],
    girClaims: [],
    ...over,
  });

describe('buildCupSideReports: closest to pin and longest drive', () => {
  it('names the match as the sender, the shortest distance first', () => {
    const { slots } = build({
      sideClaims: [
        side({ game_id: 'g1', winner_user_id: 'marte', distance_m: 2.4 }),
        side({ game_id: 'g2', winner_user_id: 'kristian', distance_m: 1.8 }),
      ],
    });
    expect(slots[0]).toEqual({
      kind: 'ctp',
      holeNumber: 3,
      lines: [
        { gameId: 'g2', matchLabel: 'Four-ball 2', name: 'Kristian', distanceM: 1.8 },
        { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Marte', distanceM: 2.4 },
      ],
      missing: [],
    });
  });

  it('«Ingen på fairway» is a line without a name; answers without a distance go last, by match', () => {
    const { slots } = build({
      sideClaims: [
        side({ game_id: 'g2', category: 'longest_drive', hole_number: 9, winner_user_id: null }),
        side({ game_id: 'g1', category: 'longest_drive', hole_number: 9, winner_user_id: 'jonas' }),
      ],
    });
    expect(slots[1]).toMatchObject({
      kind: 'ld',
      holeNumber: 9,
      lines: [
        { matchLabel: 'Four-ball 1', name: 'Jonas', distanceM: null },
        { matchLabel: 'Four-ball 2', name: null, distanceM: null },
      ],
    });
  });

  it('names the matches that have not reported, and when none has, only them', () => {
    const one = build({ sideClaims: [side({ game_id: 'g1', winner_user_id: 'marte', distance_m: 2.4 })] });
    expect(one.slots[0].missing).toEqual([{ gameId: 'g2', matchLabel: 'Four-ball 2' }]);

    const none = build();
    expect(none.slots[0].lines).toEqual([]);
    expect(none.slots[0].missing).toEqual([
      { gameId: 'g1', matchLabel: 'Four-ball 1' },
      { gameId: 'g2', matchLabel: 'Four-ball 2' },
    ]);
  });

  it('a report on another hole or category does not count for this slot', () => {
    const { slots } = build({
      sideClaims: [
        side({ game_id: 'g1', hole_number: 4, winner_user_id: 'marte' }),
        side({ game_id: 'g2', category: 'longest_drive', winner_user_id: 'sigrid' }),
      ],
    });
    expect(slots[0].lines).toEqual([]);
    expect(slots[0].missing).toHaveLength(2);
  });

  it('a derived single reports nothing and is never missing; its claim row is left out', () => {
    const derived: CupReportGame = {
      ...fourball1,
      id: 'd1',
      matchLabel: 'Singel 1',
      gameMode: 'singles_matchplay',
      sourceGameId: 'g1',
    };
    const { slots } = build({
      games: [fourball1, derived, fourball2],
      sideClaims: [
        side({ game_id: 'g1', winner_user_id: 'marte', distance_m: 2.4 }),
        side({ game_id: 'd1', winner_user_id: 'jonas', distance_m: 0.5 }),
      ],
    });
    expect(slots[0].lines.map((line) => line.matchLabel)).toEqual(['Four-ball 1']);
    expect(slots[0].missing.map((match) => match.matchLabel)).toEqual(['Four-ball 2']);
  });

  it('a match whose half of a split day does not include the hole is not missing', () => {
    const front9: CupReportGame = { ...fourball2, holeSegment: 'front9' };
    const { slots } = build({
      awards: [{ kind: 'ctp', holeNumber: 12 }],
      games: [fourball1, front9],
    });
    expect(slots[0].missing.map((match) => match.matchLabel)).toEqual(['Four-ball 1']);
  });

  it('an unnamed match keeps a null label for the surface to name', () => {
    const { slots } = build({ games: [{ ...fourball1, matchLabel: null }, fourball2] });
    expect(slots[0].missing[0]).toEqual({ gameId: 'g1', matchLabel: null });
  });

  it('shows the full name when another in the cup shares the first name', () => {
    const second: CupReportGame = {
      ...fourball2,
      players: [row('marte2', 'Marte Aas', 1), ...fourball2.players.slice(1)],
    };
    const { slots } = build({
      games: [fourball1, second],
      sideClaims: [side({ game_id: 'g1', winner_user_id: 'marte', distance_m: 2.4 })],
    });
    expect(slots[0].lines[0].name).toBe('Marte Lie');
  });

  it('one entry per kind and hole, however many winner slots the award has', () => {
    const { slots } = build({ awards: [CTP3, CTP3, { kind: 'ld', holeNumber: 3 }] });
    expect(slots.map((slot) => `${slot.kind}:${slot.holeNumber}`)).toEqual(['ctp:3', 'ld:3']);
  });
});

describe('buildCupSideReports: GIR', () => {
  // Fourball 1: Jonas, Marte and Tore on the green. Fourball 2: Sigrid on the green.
  const claims = [
    gir('g1', 'jonas', true),
    gir('g1', 'marte', true),
    gir('g1', 'tore', true),
    gir('g1', 'kari', false),
    gir('g2', 'sigrid', true),
    gir('g2', 'kristian', false),
    gir('g2', 'anders', false),
    gir('g2', 'ingrid', false),
    gir('g1', 'kari', true, 6), // another hole
  ];

  it('sums each team over the matches with the first names, and gives the max beside a higher count', () => {
    const { gir: holes } = build({ girClaims: claims });
    expect(holes).toEqual([
      {
        holeNumber: 5,
        maxPerTeam: 2,
        team1: { count: 3, names: ['Jonas', 'Marte', 'Sigrid'], overMax: true },
        team2: { count: 1, names: ['Tore'], overMax: false },
        reportedMatches: 2,
        missing: [],
      },
    ]);
    // Over max: the actual count stays 3; the surface writes «· maks 2 GIR».
    expect(holes[0].team1.count).toBeGreaterThan(holes[0].maxPerTeam);
  });

  it('exactly the max is not over it; one more is (the one home of the rule)', () => {
    const atMax = build({ girClaims: [gir('g1', 'jonas', true), gir('g1', 'marte', true), gir('g1', 'tore', false), gir('g1', 'kari', false)] });
    expect(atMax.gir[0].team1).toMatchObject({ count: 2, overMax: false });
    const overMax = build({
      girClaims: [gir('g1', 'jonas', true), gir('g1', 'marte', true), gir('g2', 'sigrid', true), gir('g1', 'tore', false)],
    });
    expect(overMax.gir[0].team1).toMatchObject({ count: 3, overMax: true });
  });

  it('a team with no hits is 0 with no names, and a match without a report is named', () => {
    const { gir: holes } = build({
      girClaims: [gir('g1', 'jonas', true), gir('g1', 'marte', false), gir('g1', 'tore', false), gir('g1', 'kari', false)],
    });
    expect(holes[0]).toMatchObject({
      team1: { count: 1, names: ['Jonas'], overMax: false },
      team2: { count: 0, names: [], overMax: false },
      reportedMatches: 1,
      missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }],
    });
  });

  it('nothing reported: zero reported matches and every match missing', () => {
    const { gir: holes } = build();
    expect(holes[0].reportedMatches).toBe(0);
    expect(holes[0].missing.map((match) => match.matchLabel)).toEqual(['Four-ball 1', 'Four-ball 2']);
  });

  it('a shared foursomes ball counts once and shows both players', () => {
    const foursomes: CupReportGame = {
      ...fourball1,
      gameMode: 'foursomes_matchplay',
    };
    const { gir: holes } = build({
      games: [foursomes, fourball2],
      girClaims: [gir('g1', 'jonas', true), gir('g1', 'marte', true), gir('g1', 'tore', false), gir('g1', 'kari', false)],
    });
    expect(holes[0].team1).toEqual({ count: 1, names: ['Jonas/Marte'], overMax: false });
  });

  it('a derived single is not a reporter', () => {
    const derived: CupReportGame = { ...fourball1, id: 'd1', matchLabel: 'Singel 1', gameMode: 'singles_matchplay', sourceGameId: 'g1' };
    const { gir: holes } = build({
      games: [fourball1, derived, fourball2],
      girClaims: [gir('d1', 'jonas', true)],
    });
    expect(holes[0].reportedMatches).toBe(0);
    expect(holes[0].missing.map((match) => match.matchLabel)).toEqual(['Four-ball 1', 'Four-ball 2']);
  });

  it('one entry per GIR hole', () => {
    const { gir: holes } = build({ awards: [GIR5, GIR5, { kind: 'gir', holeNumber: 7, maxPerTeam: 3 }] });
    expect(holes.map((hole) => hole.holeNumber)).toEqual([5, 7]);
  });
});

describe('buildCupSideReports: no awards', () => {
  it('is empty', () => {
    expect(build({ awards: [] })).toEqual({ slots: [], gir: [] });
  });
});
