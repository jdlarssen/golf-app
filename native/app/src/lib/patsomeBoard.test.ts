// #2751: Patsome-tavla (Type A). Tallene er tegningens, kjørt gjennom den ekte
// motoren: netto med handicap 0, så slagene gir nøyaktig poengene under.
import type { LocalScore } from '../data/db';
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import { homeBundle, homePlayer } from '../test/homeFixtures';
import { patsomeBoardFor } from './patsomeBoard';
import { teamBoardBand } from './teamBoard';

const PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const TEAMS = {
  1: { ids: ['ingrid', 'marius'], pts: [2, 2, 3, 2, 2, 3, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1] },
  2: { ids: ['jonas', 'me'], pts: [2, 3, 3, 2, 3, 3, 2, 1, 2, 2, 2, 1, 2, 2, 1, 2, 2, 2] },
  3: { ids: ['eirik', 'hanne'], pts: [3, 2, 4, 3, 2, 3, 2, 2, 3, 1, 2, 2, 2, 1, 2, 3, 2, 2] },
  4: { ids: ['kari', 'ola'], pts: [3, 3, 2, 3, 2, 2, 2, 2, 2, 1, 3, 1, 1, 3, 1, 3, 1, 2] },
} as const;
const NAMES: Record<string, string> = {
  ingrid: 'Ingrid',
  marius: 'Marius',
  jonas: 'Jonas',
  me: 'Meg Selv',
  eirik: 'Eirik',
  hanne: 'Hanne',
  kari: 'Kari',
  ola: 'Ola',
};

function row(userId: string, holeNumber: number, strokes: number): LocalScore {
  return {
    id: `g#${userId}#${holeNumber}`,
    gameId: 'g-live',
    userId,
    holeNumber,
    strokes,
    putts: null,
    enteredBy: userId,
    clientUpdatedAt: '2026-11-01T10:00:00.000Z',
    serverUpdatedAt: null,
  };
}

/** Slagene for ett lag fram til `holes`: egne på 1–6, kapteinens rad på 7–18. */
function teamScores(team: keyof typeof TEAMS, holes: number): LocalScore[] {
  const { ids, pts } = TEAMS[team];
  const rows: LocalScore[] = [];
  for (let hole = 1; hole <= holes; hole++) {
    const strokes = PAR[hole - 1]! + 2 - pts[hole - 1]!;
    if (hole <= 6) {
      rows.push(row(ids[0], hole, strokes), row(ids[1], hole, strokes + 1));
    } else {
      rows.push(row(ids[0], hole, strokes));
    }
  }
  return rows;
}

function bundle(status: 'active' | 'finished', overrides: Partial<GameBundle['game']> = {}): GameBundle {
  const players: BundlePlayer[] = Object.entries(TEAMS).flatMap(([team, { ids }]) =>
    ids.map((userId) => homePlayer({ userId, name: NAMES[userId]!, teamNumber: Number(team), courseHandicap: 0 })),
  );
  const base = homeBundle({
    game: {
      status,
      gameMode: 'patsome',
      modeConfig: { kind: 'patsome', team_size: 2, teams_count: 4, patsome_scoring: 'net' },
      ...overrides,
    },
    players,
  });
  return {
    ...base,
    holes: PAR.map((par, index) => ({
      holeNumber: index + 1,
      parMens: par,
      parLadies: par,
      parJuniors: par,
      strokeIndex: index + 1,
    })),
  };
}

const FINISHED_SCORES = [...teamScores(1, 18), ...teamScores(2, 18), ...teamScores(3, 18), ...teamScores(4, 18)];
const LIVE_SCORES = [...teamScores(1, 11), ...teamScores(2, 9), ...teamScores(3, 11), ...teamScores(4, 9)];

const compact = (model: NonNullable<ReturnType<typeof patsomeBoardFor>>) =>
  model.rows.map((r) => [r.name, r.place, r.total, r.under, r.segments.map((s) => s.value).join('/')]);

describe('patsomeBoardFor, mot tegningen', () => {
  it('ferdig: rekkefølge, plass, delsummer, vinner og delt plass', () => {
    const model = patsomeBoardFor({ bundle: bundle('finished'), scores: FINISHED_SCORES, userId: 'me' })!;

    expect(model.variant).toBe('finished');
    expect(model.pill).toEqual({ text: 'Sluttresultat · 18 hull', live: false });
    expect(compact(model)).toEqual([
      ['Lag 3', '1', '41', 'poeng', '17/12/12'],
      ['Lag 2', 'T2', '37', 'poeng', '16/10/11'],
      ['Lag 4', 'T2', '37', 'poeng', '15/11/11'],
      ['Lag 1', '4', '32', 'poeng', '14/9/9'],
    ]);
    expect(model.rows.map((r) => r.leader)).toEqual([true, false, false, false]);
    expect(model.rows.map((r) => r.you)).toEqual([false, true, false, false]);
    expect(model.rows[1]!.members).toBe('Deg, Jonas');
    expect(model.rows[0]!.members).toBe('Eirik, Hanne');
    // T2 er helt likt: ingen «avgjort på» mellom dem.
    expect(model.rows.map((r) => r.note)).toEqual([null, null, null, null]);
    expect(model.strip).toEqual({
      kicker: 'Laget ditt',
      place: 'Delt 2. plass',
      detail: '4 poeng bak Lag 3',
      action: { kind: 'scorecard', label: 'Scorekortet' },
    });
  });

  it('live: pillen, hull per lag, «—» på en del uten hull, og avstanden etter 9 mot 11 hull', () => {
    const model = patsomeBoardFor({ bundle: bundle('active'), scores: LIVE_SCORES, userId: 'me' })!;

    expect(model.variant).toBe('live');
    expect(model.pill).toEqual({ text: 'Live · etter 11 hull', live: true });
    expect(compact(model)).toEqual([
      ['Lag 3', '1', '27', 'poeng · hull 11', '17/10/—'],
      ['Lag 1', '2', '21', 'poeng · hull 11', '14/7/—'],
      ['Lag 2', 'T3', '21', 'poeng · hull 9', '16/5/—'],
      ['Lag 4', 'T3', '21', 'poeng · hull 9', '15/6/—'],
    ]);
    expect(model.strip).toEqual({
      kicker: 'Laget ditt',
      place: 'Delt 3. plass',
      detail: '6 poeng bak Lag 3',
      action: { kind: 'hole', holeNumber: 10, label: 'Hull 10' },
    });
  });

  it('tabellen: lagene i tavlas rekkefølge, tre deler, og uspilte hull som «—»', () => {
    const model = patsomeBoardFor({ bundle: bundle('active'), scores: LIVE_SCORES, userId: 'me' })!;

    expect(model.columns).toEqual([
      { teamNumber: 3, label: 'Lag 3', you: false },
      { teamNumber: 1, label: 'Lag 1', you: false },
      { teamNumber: 2, label: 'Lag 2', you: true },
      { teamNumber: 4, label: 'Lag 4', you: false },
    ]);
    expect(model.groups.map((g) => [g.label, g.holes.map((h) => h.holeNumber)])).toEqual([
      ['4BBB · hull 1–6', [1, 2, 3, 4, 5, 6]],
      ['Greensome · hull 7–12', [7, 8, 9, 10, 11, 12]],
      ['Foursomes · hull 13–18', [13, 14, 15, 16, 17, 18]],
    ]);
    const hole = (n: number) => model.groups.flatMap((g) => g.holes).find((h) => h.holeNumber === n)!;
    expect(hole(1)).toMatchObject({ par: 4, cells: ['3', '2', '2', '3'] });
    expect(hole(10)).toMatchObject({ par: 4, cells: ['1', '2', '—', '—'] });
    expect(hole(18)).toMatchObject({ par: 4, cells: ['—', '—', '—', '—'] });
    expect(hole(10).a11y).toBe('Hull 10, par 4. Lag 3, 1 poeng. Lag 1, 2 poeng. Lag 2, ikke spilt. Lag 4, ikke spilt');
  });
});

describe('patsomeBoardFor, grensetilfeller', () => {
  it('lik sum skilt av siste ni: «Likt med …» på raden under, bare på den ferdige tavla', () => {
    // Lag 2 og 4 har 37, men Lag 4 tar ett poeng mer på inn enn Lag 2.
    const decide = (scores: LocalScore[]) =>
      scores.map((s) => {
        if (s.userId === 'kari' && s.holeNumber === 13) return { ...s, strokes: s.strokes! - 1 };
        if ((s.userId === 'kari' || s.userId === 'ola') && s.holeNumber === 1) return { ...s, strokes: s.strokes! + 1 };
        return s;
      });

    const model = patsomeBoardFor({ bundle: bundle('finished'), scores: decide(FINISHED_SCORES), userId: 'me' })!;
    expect(model.rows.map((r) => [r.name, r.place, r.total, r.note])).toEqual([
      ['Lag 3', '1', '41', null],
      ['Lag 4', '2', '37', null],
      ['Lag 2', '3', '37', 'Likt med Lag 4 · avgjort på siste ni'],
      ['Lag 1', '4', '32', null],
    ]);
    const live = patsomeBoardFor({ bundle: bundle('active'), scores: decide(FINISHED_SCORES), userId: 'me' })!;
    expect(live.rows.every((r) => r.note === null)).toBe(true);
  });

  it('et lag uten hull har «—» som sum, og «—» på alle delene', () => {
    const model = patsomeBoardFor({ bundle: bundle('active'), scores: teamScores(2, 3), userId: 'me' })!;
    const empty = model.rows.find((r) => r.name === 'Lag 1')!;
    expect(empty.total).toBe('—');
    expect(empty.under).toBe('poeng · hull 0');
    expect(empty.segments.map((s) => s.value)).toEqual(['—', '—', '—']);
  });

  it('ferdig med ulikt antall hull: hullene står under summen', () => {
    const model = patsomeBoardFor({
      bundle: bundle('finished'),
      scores: [...teamScores(1, 18), ...teamScores(2, 12), ...teamScores(3, 18), ...teamScores(4, 18)],
      userId: 'me',
    })!;
    expect(model.rows.find((r) => r.name === 'Lag 2')!.under).toBe('poeng · hull 12');
  });

  it('seeren er ikke på et lag: ingen stripe og ingen «ditt lag»', () => {
    const model = patsomeBoardFor({ bundle: bundle('finished'), scores: FINISHED_SCORES, userId: 'arrangoren' })!;
    expect(model.strip).toBeNull();
    expect(model.viewerTeam).toBeNull();
    expect(model.columns.some((c) => c.you)).toBe(false);
  });

  it('jeg leder: stripa har bare plassen', () => {
    const model = patsomeBoardFor({ bundle: bundle('finished'), scores: FINISHED_SCORES, userId: 'eirik' })!;
    expect(model.strip).toMatchObject({ place: '1. plass', detail: null });
  });

  it('lik sum på første plass: «bak ledelsen», ikke ett av lagene', () => {
    const scores = FINISHED_SCORES.filter((s) => s.userId !== 'ingrid' && s.userId !== 'marius');
    const tiedLead = [...scores.filter((s) => !['eirik', 'hanne'].includes(s.userId)), ...teamScores(1, 3)];
    const model = patsomeBoardFor({
      bundle: bundle('finished'),
      scores: tiedLead,
      userId: 'ingrid',
    })!;
    expect(model.strip?.detail).toMatch(/^\d+ poeng bak ledelsen$/);
  });

  it('svarer null: blind runde, stengt runde, ingen slag og andre formater', () => {
    expect(patsomeBoardFor({ bundle: bundle('active', { scoreVisibility: 'reveal' }), scores: LIVE_SCORES, userId: 'me' })).toBeNull();
    expect(patsomeBoardFor({ bundle: bundle('active', { holeSegment: 'front9' }), scores: LIVE_SCORES, userId: 'me' })).toBeNull();
    expect(patsomeBoardFor({ bundle: bundle('active'), scores: [], userId: 'me' })).toBeNull();
    expect(
      patsomeBoardFor({
        bundle: bundle('active', {
          gameMode: 'texas_scramble',
          modeConfig: { kind: 'texas_scramble', team_size: 2, teams_count: 4, team_handicap_pct: 25 },
        }),
        scores: LIVE_SCORES,
        userId: 'me',
      }),
    ).toBeNull();
  });

  it('aldri «mot par», heller ikke når spillet ble stemplet med net_to_par (#2738)', () => {
    const stamped = bundle('active', {
      modeConfig: { kind: 'patsome', team_size: 2, teams_count: 4, patsome_scoring: 'net', ranking: 'net_to_par' },
    });
    const model = patsomeBoardFor({ bundle: stamped, scores: LIVE_SCORES, userId: 'me' })!;
    expect(JSON.stringify(model)).not.toMatch(/mot par/i);
    expect(compact(model)[0]).toEqual(['Lag 3', '1', '27', 'poeng · hull 11', '17/10/—']);
  });
});

describe('teamBoardBand, Patsome', () => {
  it('«Patsome · 4 lag à 2 · netto», og brutto når spillet er brutto', () => {
    expect(teamBoardBand(bundle('active'))).toEqual({
      kicker: bundle('active').game.name,
      subtitle: 'Patsome · 4 lag à 2 · netto',
    });
    expect(
      teamBoardBand(
        bundle('active', { modeConfig: { kind: 'patsome', team_size: 2, teams_count: 4, patsome_scoring: 'gross' } }),
      ).subtitle,
    ).toBe('Patsome · 4 lag à 2 · brutto');
  });
});
