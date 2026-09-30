import { describe, expect, it } from 'vitest';
import { computeLeaderboard, type LbHole, type LbPlayer, type LbScore } from '@/lib/leaderboard';
import {
  bestBallDrilldown,
  bestBallHoleWinners,
  bestBallRevealMeta,
  formatVsPar,
  vsParTone,
} from './bestBallHoles';

// #2255 PR 3d: «Hull for hull» for best ball. Regnestykket bak webbens
// drilldown bor her, så webben og appen tegner det samme laget likt.

const player = (userId: string, teamNumber: number, name: string, extra: Partial<LbPlayer> = {}): LbPlayer => ({
  userId,
  name,
  nickname: null,
  teamNumber,
  courseHandicap: 0,
  ...extra,
});

const hole = (holeNumber: number, par = 4, extra: Partial<LbHole> = {}): LbHole => ({
  holeNumber,
  par,
  strokeIndex: holeNumber,
  ...extra,
});

const score = (userId: string, holeNumber: number, strokes: number | null): LbScore => ({ userId, holeNumber, strokes });

/** Lag 1 (Ola, Kari) og lag 2 (Per, Lise) over hullene, med slag per spiller. */
function lines(
  holes: LbHole[],
  strokes: Record<string, (number | null)[]>,
  players: LbPlayer[] = [
    player('ola', 1, 'Ola Nordmann'),
    player('kari', 1, 'Kari Holm'),
    player('per', 2, 'Per Berg'),
    player('lise', 2, 'Lise Dahl'),
  ],
) {
  const scores = Object.entries(strokes).flatMap(([userId, list]) =>
    list.map((s, i) => score(userId, holes[i]!.holeNumber, s)),
  );
  return computeLeaderboard({ mode: 'netto', players, holes, scores });
}

describe('vsParTone og formatVsPar', () => {
  it('tonen følger webbens trinn: under, par, én over, to eller flere over', () => {
    expect([-2, -1, 0, 1, 2, 5].map(vsParTone)).toEqual(['under', 'under', 'par', 'over1', 'over2', 'over2']);
  });

  it('mot par skrives «E» for par, med fortegn ellers, og «—» uten verdi', () => {
    expect([0, 3, -2, null].map(formatVsPar)).toEqual(['E', '+3', '-2', '—']);
  });
});

describe('bestBallDrilldown', () => {
  const twoHoles = [hole(1), hole(2)];

  it('uten lag er det ingenting å vise', () => {
    expect(bestBallDrilldown({ lines: [], requestedTeam: null, coursePar: 72 })).toBeNull();
  });

  it('lederen vises når ingen lag er valgt, og et ukjent lag faller tilbake til lederen', () => {
    // Lag 2 har best ball 3 + 3, lag 1 har 4 + 4.
    const l = lines(twoHoles, { ola: [4, 5], kari: [5, 4], per: [3, 6], lise: [6, 3] });
    expect(bestBallDrilldown({ lines: l, requestedTeam: null, coursePar: 8 })!.teamNumber).toBe(2);
    expect(bestBallDrilldown({ lines: l, requestedTeam: 9, coursePar: 8 })!.teamNumber).toBe(2);
    const one = bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 8 })!;
    expect([one.teamNumber, one.rank, one.isLeader, one.total, one.totalVsPar]).toEqual([1, 2, false, 8, 0]);
  });

  it('forrige og neste lag følger plassen, så lagnummeret ved delt plass', () => {
    // Tre lag: lag 3 vinner, lag 1 og 2 deler andreplassen.
    const players = [
      player('ola', 1, 'Ola Nordmann'),
      player('per', 2, 'Per Berg'),
      player('kim', 3, 'Kim Lie'),
    ];
    const l = lines(twoHoles, { ola: [4, 4], per: [4, 4], kim: [3, 3] }, players);
    // Rekkefølgen inn skal ikke bety noe.
    const shuffled = [l[1]!, l[2]!, l[0]!];
    const mid = bestBallDrilldown({ lines: shuffled, requestedTeam: 1, coursePar: 8 })!;
    expect(mid.prev).toEqual({ teamNumber: 3, rank: 1 });
    expect(mid.next).toEqual({ teamNumber: 2, rank: 2 });
    const first = bestBallDrilldown({ lines: shuffled, requestedTeam: 3, coursePar: 8 })!;
    expect(first.prev).toBeNull();
    expect(first.teamCount).toBe(3);
    const last = bestBallDrilldown({ lines: shuffled, requestedTeam: 2, coursePar: 8 })!;
    expect(last.next).toBeNull();
  });

  it('hull vunnet teller bare hull laget vant alene', () => {
    // Hull 1: lag 1 alene (3 mot 4). Hull 2: delt (4 mot 4). Hull 3: lag 2.
    const holes = [hole(1), hole(2), hole(3)];
    const l = lines(holes, { ola: [3, 4, 5], kari: [5, 5, 5], per: [4, 4, 3], lise: [6, 6, 6] });
    const team1 = l.find((x) => x.teamNumber === 1)!;
    const ordered = [...l].sort((a, b) => a.rank - b.rank || a.teamNumber - b.teamNumber);
    expect(bestBallHoleWinners(ordered, team1)).toEqual([1, null, 2]);
    expect(bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 12 })!.holesWon).toBe(1);
  });

  it('ut og inn deles på hull 9, med sum, par og mot par for hver ni', () => {
    const holes = Array.from({ length: 18 }, (_, i) => hole(i + 1, i < 9 ? 4 : 3));
    const four = Array.from({ length: 18 }, () => 4);
    const l = lines(holes, { ola: four, kari: four, per: four, lise: four });
    const d = bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 63 })!;
    expect(d.nines.map((n) => [n.key, n.rows.length, n.par, n.net, n.vsPar, n.tone])).toEqual([
      ['front', 9, 36, 36, 0, 'par'],
      ['back', 9, 27, 36, 9, 'over2'],
    ]);
  });

  it('et spill på de ni siste har bare inn-delen', () => {
    const holes = Array.from({ length: 9 }, (_, i) => hole(i + 10));
    const four = Array.from({ length: 9 }, () => 4);
    const l = lines(holes, { ola: four, kari: four, per: four, lise: four });
    expect(bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 36 })!.nines.map((n) => n.key)).toEqual(['back']);
  });

  it('en ni uten ett spilt hull har ingen mot par, men tonen for par', () => {
    const holes = [hole(1), hole(10)];
    const l = lines(holes, { ola: [null, 4], kari: [null, 5], per: [4, 4], lise: [4, 4] });
    const front = bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 8 })!.nines[0]!;
    expect([front.key, front.net, front.vsPar, front.tone]).toEqual(['front', 0, null, 'par']);
  });

  it('et uspilt hull telles ikke med i niens mot par', () => {
    // Hull 1 spilt på par, hull 2 uten score: mot par er 0, ikke -4.
    const l = lines(twoHoles, { ola: [4, null], kari: [5, null], per: [4, 4], lise: [4, 4] });
    const front = bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 8 })!.nines[0]!;
    expect([front.net, front.par, front.vsPar]).toEqual([4, 8, 0]);
  });

  it('cellene: brukt netto, initialer, tekst og mot par etter spillerens egen par', () => {
    // Kari får ett slag på hull 1 (hcp 18), så hennes netto 4 er lagets ball.
    const players = [
      player('ola', 1, 'Ola Nordmann'),
      player('kari', 1, 'Kari Holm', { courseHandicap: 18, teeGender: 'ladies' }),
    ];
    const holes = [hole(1, 4, { parByGender: { mens: 4, ladies: 5, juniors: 4 } })];
    const l = lines(holes, { ola: [5], kari: [5] }, players);
    const row = bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 4 })!.nines[0]!.rows[0]!;
    expect(row.parAside).toBe(true);
    expect([row.teamNet, row.teamVsPar, row.teamTone]).toEqual([4, 0, 'par']);
    expect(
      row.players.map((c) => [c.initial, c.grossText, c.netText, c.isBestNet, c.netVsPar, c.netTone, c.extraStrokes]),
    ).toEqual([
      ['ON', '5', '5', false, 1, 'over1', 0],
      ['KH', '5', '4', true, -1, 'under', 1],
    ]);
  });

  it('en spiller uten slag: strek, ingen mot par og ingen tone', () => {
    const l = lines([hole(1)], { ola: [4], kari: [null], per: [4], lise: [4] });
    const row = bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 4 })!.nines[0]!.rows[0]!;
    const kari = row.players.find((c) => c.userId === 'kari')!;
    expect([kari.grossText, kari.netText, kari.isBestNet, kari.netVsPar, kari.netTone]).toEqual(['–', '–', false, null, null]);
    expect(row.parAside).toBe(false);
  });

  it('et hull uten lagscore har ingen mot par og ingen tone', () => {
    const l = lines([hole(1)], { ola: [null], kari: [null], per: [4], lise: [4] });
    const row = bestBallDrilldown({ lines: l, requestedTeam: 1, coursePar: 4 })!.nines[0]!.rows[0]!;
    expect([row.teamNet, row.teamVsPar, row.teamTone]).toEqual([null, null, null]);
  });
});

describe('bestBallRevealMeta', () => {
  it('navnene som på webben i et avsluttet spill, med kallenavn, skilt med «·»', () => {
    expect(
      bestBallRevealMeta([
        player('ola', 1, 'Ola Nordmann', { nickname: 'Kompis' }),
        player('kari', 1, 'Kari Holm'),
      ]),
    ).toBe('Ola "Kompis" Nordmann · Kari Holm');
  });
});
