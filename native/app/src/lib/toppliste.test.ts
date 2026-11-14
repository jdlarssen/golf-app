// #2259 PR 2: det Topplista viser, regnet ut av svaret fra serveren. Type A.
//
// Rekkefølgen og plassene er låst i `lib/stats/aeresbrett.test.ts`, og serverens
// svar i `app/api/aeresbrett/route.test.ts`. Her: hva skjermen gjør med dem —
// lederkortet, «Du er på …»-linja, strekene, medaljene og tekstene i hver
// tilstand.
import type { AeresbrettView } from '../../../../lib/stats/appAeresbrettView';
import { buildTopplisteModel, countText, formatTopplisteCount } from './toppliste';

const row = (place: number, name: string, count: number, isViewer = false) => ({
  place,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  count,
  isViewer,
});

const WINS = [row(1, 'Marte L.', 6), row(2, 'Jonas B.', 5), row(3, 'Ingrid S.', 4), row(4, 'Anders M.', 3)];

function view(over: Partial<AeresbrettView['boards']> = {}, top: Partial<AeresbrettView> = {}): AeresbrettView {
  return {
    seasonYear: 2026,
    seasonOver: false,
    boards: {
      wins: { rows: WINS, me: null, leader: null },
      birdies: { rows: [row(1, 'Jonas B.', 14)], me: null },
      rounds: { rows: [row(1, 'Per K.', 31)], me: null },
      ...over,
    },
    ...top,
  };
}

describe('countText', () => {
  it.each([
    ['wins', 1, '1 seier'],
    ['wins', 6, '6 seire'],
    ['birdies', 1, '1 birdie'],
    ['birdies', 14, '14 birdier'],
    ['rounds', 1, '1 runde'],
    ['rounds', 31, '31 runder'],
  ] as const)('%s %i → «%s»', (tab, n, text) => {
    expect(countText(tab, n)).toBe(text);
  });
});

describe('formatTopplisteCount', () => {
  it('keeps the tabular figure and the unit apart', () => {
    expect(formatTopplisteCount('wins', 6)).toEqual({ value: '6', unit: 'seire' });
    expect(formatTopplisteCount('wins', 1)).toEqual({ value: '1', unit: 'seier' });
  });
});

describe('buildTopplisteModel: a season', () => {
  it('has no season: the empty card, no tabs', () => {
    const model = buildTopplisteModel(view({}, { seasonYear: null }), 'wins', { now: new Date('2026-03-01T12:00:00Z') });
    expect(model).toEqual({
      kind: 'empty',
      subtitle: 'Hele Tørny · sesongen 2026',
      heading: 'Ingen runder ennå',
      body: 'Vinneren av den første står her.',
    });
  });

  it('gives the rows medals on places 1–3 and a number from place 4', () => {
    const model = buildTopplisteModel(view(), 'wins');
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.rows.map((r) => [r.place, r.medal])).toEqual([
      [1, 'gold'],
      [2, 'silver'],
      [3, 'bronze'],
      [4, null],
    ]);
  });

  it('gives a shared place the same medal, and the next one skips', () => {
    const model = buildTopplisteModel(
      view({ wins: { rows: [row(1, 'A', 5), row(1, 'B', 5), row(3, 'C', 4)], me: null, leader: null } }),
      'wins',
    );
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.rows.map((r) => [r.place, r.medal])).toEqual([
      [1, 'gold'],
      [1, 'gold'],
      [3, 'bronze'],
    ]);
    expect(model.leader).toBeNull();
  });

  it('measures the bar against the leader, at least 4 %', () => {
    const model = buildTopplisteModel(
      view({ wins: { rows: [row(1, 'A', 6), row(2, 'B', 5), row(3, 'C', 4), row(4, 'D', 1)], me: null, leader: null } }),
      'wins',
    );
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.rows.map((r) => r.barPercent)).toEqual([100, 83, 67, 17]);
    const tiny = buildTopplisteModel(
      view({ wins: { rows: [row(1, 'A', 100), row(2, 'B', 1)], me: null, leader: null } }),
      'wins',
    );
    if (tiny.kind !== 'board') throw new Error('expected a board');
    expect(tiny.rows[1].barPercent).toBe(4);
  });

  it('has a leader card only when one player holds place 1, on every tab', () => {
    const wins = buildTopplisteModel(view(), 'wins');
    if (wins.kind !== 'board') throw new Error('expected a board');
    expect(wins.leader).toEqual({
      label: 'Leder sesongen',
      name: 'Marte L.',
      initials: 'MA',
      value: '6',
      unit: 'seire',
    });
    const birdies = buildTopplisteModel(view(), 'birdies');
    if (birdies.kind !== 'board') throw new Error('expected a board');
    expect(birdies.leader).toMatchObject({ name: 'Jonas B.', value: '14', unit: 'birdier' });
  });

  it('calls the leader «Årets spiller» when the season is over', () => {
    const model = buildTopplisteModel(view({}, { seasonYear: 2025, seasonOver: true }), 'wins');
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.leader?.label).toBe('Årets spiller 2025');
  });

  it('writes the row for the screen reader: place, name, count, and «deg» on your own', () => {
    const model = buildTopplisteModel(
      view({ wins: { rows: [row(1, 'Marte L.', 6), row(2, 'Sigrid A.', 1, true)], me: null, leader: null } }),
      'wins',
    );
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.rows.map((r) => r.spoken)).toEqual(['1. plass, Marte L., 6 seire', '2. plass, Sigrid A., 1 seier, deg']);
  });

  it('subtitle names the season', () => {
    const model = buildTopplisteModel(view(), 'wins');
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.subtitle).toBe('Hele Tørny · sesongen 2026');
  });
});

describe('buildTopplisteModel: «Din plass»', () => {
  const me = (place: number, count: number, toTop5: number | null) => ({ place, count, toTop5 });

  it('in the top 5: only the count', () => {
    const model = buildTopplisteModel(view({ wins: { rows: WINS, me: me(4, 3, null), leader: null } }), 'wins');
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.you).toMatchObject({ title: 'Du er på 4. plass', detail: '3 seire' });
  });

  it('outside the top 5: the count and the way up', () => {
    const model = buildTopplisteModel(view({ wins: { rows: WINS, me: me(7, 1, 2), leader: null } }), 'wins');
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.you).toMatchObject({ title: 'Du er på 7. plass', detail: '1 seier · 2 seire til topp 5' });
  });

  it('uses the tab’s unit', () => {
    const model = buildTopplisteModel(
      view({ birdies: { rows: [row(1, 'Jonas B.', 14)], me: me(9, 3, 4) } }),
      'birdies',
    );
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.you?.detail).toBe('3 birdier · 4 birdier til topp 5');
  });

  it('says nothing about the top 5 once the season is over', () => {
    const model = buildTopplisteModel(
      view({ wins: { rows: WINS, me: me(7, 1, 2), leader: null } }, { seasonYear: 2025, seasonOver: true }),
      'wins',
    );
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.you?.detail).toBe('1 seier');
  });

  it('has no wins: «Ingen seire ennå», and a nudge', () => {
    const model = buildTopplisteModel(view(), 'wins');
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.you).toMatchObject({ title: 'Ingen seire ennå', detail: 'Vinn en runde, så er du med.' });
  });

  it('has no wins in a season that is over: no «ennå»', () => {
    const model = buildTopplisteModel(view({}, { seasonYear: 2025, seasonOver: true }), 'wins');
    if (model.kind !== 'board') throw new Error('expected a board');
    expect(model.you).toMatchObject({ title: 'Ingen seire i 2025', detail: 'Sesongen er over.' });
  });

  it('takes your initials from your own row, else from the profile', () => {
    const own = buildTopplisteModel(
      view({ wins: { rows: [row(1, 'Marte L.', 6), row(2, 'Sigrid A.', 1, true)], me: me(2, 1, null), leader: null } }),
      'wins',
      { selfInitials: 'XX' },
    );
    if (own.kind !== 'board') throw new Error('expected a board');
    expect(own.you?.initials).toBe('SI');
    const outside = buildTopplisteModel(view({ wins: { rows: WINS, me: me(12, 1, 2), leader: null } }), 'wins', {
      selfInitials: 'SA',
    });
    if (outside.kind !== 'board') throw new Error('expected a board');
    expect(outside.you?.initials).toBe('SA');
  });
});

describe('buildTopplisteModel: the birdie tab when only it failed', () => {
  it('is a failed board with its own text; the other tabs are fine', () => {
    const v = view({ birdies: null });
    expect(buildTopplisteModel(v, 'birdies')).toEqual({
      kind: 'birdiesFailed',
      subtitle: 'Hele Tørny · sesongen 2026',
      heading: 'Fikk ikke hentet birdiene',
      body: 'Seire og runder virker som vanlig.',
    });
    expect(buildTopplisteModel(v, 'wins').kind).toBe('board');
    expect(buildTopplisteModel(v, 'rounds').kind).toBe('board');
  });
});
