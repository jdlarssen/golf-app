// #2756: setningen og kortet. Type A — hvem som nevnes, hvilket tall og hvilken
// ordlyd, regnet fra motorens resultat.
import type { ModeResult } from '../../../../lib/scoring/modes/types';
import { homeBundle, homePlayer } from '../test/homeFixtures';
import { resultHeroFor, templateWords } from './resultHero';

const NAMES: Record<string, string> = {
  a: 'Marte Lie',
  b: 'Jonas Berg',
  c: 'Sigrid Aas',
  d: 'Kari Moe',
  e: 'Ola Holm',
};

function bundle(ids: string[], game: Parameters<typeof homeBundle>[0]['game'] = {}) {
  return {
    ...homeBundle({
      game: { status: 'finished', endedAt: '2026-09-26T22:30:00.000Z', ...game },
      players: ids.map((id) =>
        homePlayer({ userId: id, name: NAMES[id] ?? id, teamNumber: null }),
      ),
    }),
    courseName: 'Byneset',
  };
}

const stableford = (rows: [string, number, number][]): ModeResult =>
  ({
    kind: 'stableford',
    variant: 'solo',
    holes: [],
    players: rows.map(([userId, totalPoints, rank]) => ({
      userId,
      totalPoints,
      rank,
      holesPlayed: 18,
      tiedWith: [],
      decidedBy: null,
    })),
  }) as unknown as ModeResult;

const text = (lines: { text: string }[][]) => lines.map((line) => line.map((w) => w.text).join(' '));

function hero(result: ModeResult, b = bundle(['a', 'b', 'c', 'd', 'e']), userId: string | null = 'c') {
  return resultHeroFor({ bundle: b, result, userId });
}

describe('setningen', () => {
  it('én vinner: fornavnet og poengene, med brudd foran «med»', () => {
    const model = hero(stableford([['a', 38, 1], ['b', 34, 2], ['c', 34, 2]]));
    expect(text(model.lines)).toEqual(['Marte vant', 'med 38 poeng']);
    expect(model.lines[1].find((word) => word.gold)?.text).toBe('38 poeng');
    expect(model).toMatchObject({ goldItalic: true, celebrates: true, resultInSentence: true, members: null });
    expect(model.a11y).toBe('Marte vant med 38 poeng');
  });

  it('delt seier: navnene, «delte seieren» og tallet på hver sin linje', () => {
    const model = hero(stableford([['a', 36, 1], ['b', 36, 1], ['c', 34, 3]]));
    // Alfabetisk, som kortets rekkefølge på delt plass.
    expect(text(model.lines)).toEqual(['Jonas og Marte', 'delte seieren', 'med 36 poeng']);
    expect(model.celebrates).toBe(true);
  });

  it('flere enn fire på delt seier: «Delt seier»', () => {
    const model = hero(stableford([['a', 36, 1], ['b', 36, 1], ['c', 36, 1], ['d', 36, 1], ['e', 36, 1]]));
    expect(text(model.lines)).toEqual(['Delt seier', 'med 36 poeng']);
  });

  it('lag: lagets navn og tavlas tall, ikke kortets mot par', () => {
    const b = bundle(['a', 'b', 'c', 'd']);
    const result = {
      kind: 'texas_scramble',
      holes: [],
      teams: [
        { teamNumber: 3, rank: 1, totalNet: 62, toPar: -10, teamHandicap: 7, members: [{ userId: 'a' }, { userId: 'b' }], holes: [{}], missingHoles: [], decidedBy: null },
        { teamNumber: 1, rank: 2, totalNet: 63, toPar: -9, teamHandicap: 8, members: [{ userId: 'c' }, { userId: 'd' }], holes: [{}], missingHoles: [], decidedBy: null },
      ],
    } as unknown as ModeResult;
    const model = hero(result, b, 'c');
    expect(text(model.lines)).toEqual(['Lag 3 vant', 'på 62 netto']);
    expect(model.members).toBe('Jonas og Marte');
  });

  it('to lag på delt seier: ingen medlemslinje', () => {
    const result = {
      kind: 'texas_scramble',
      holes: [],
      teams: [
        { teamNumber: 3, rank: 1, totalNet: 62, toPar: -10, teamHandicap: 7, members: [{ userId: 'a' }], holes: [{}], missingHoles: [], decidedBy: null },
        { teamNumber: 1, rank: 1, totalNet: 62, toPar: -10, teamHandicap: 8, members: [{ userId: 'c' }], holes: [{}], missingHoles: [], decidedBy: null },
      ],
    } as unknown as ModeResult;
    const model = hero(result);
    expect(text(model.lines)).toEqual(['Lag 1 og Lag 3', 'delte seieren', 'på 62 netto']);
    expect(model.members).toBeNull();
  });

  it('slagspill mot par: «på −4», og «på par» når det står likt', () => {
    const result = (netToPar: number) =>
      ({
        kind: 'solo_strokeplay',
        ranking: 'net_to_par',
        holes: [],
        players: [{ userId: 'a', rank: 1, holesPlayed: 18, totalNetStrokes: 68, netToPar, tiedWith: [], decidedBy: null }],
      }) as unknown as ModeResult;
    expect(text(hero(result(-4)).lines)).toEqual(['Marte vant', 'på −4']);
    expect(text(hero(result(0)).lines)).toEqual(['Marte vant', 'på par']);
  });

  it('skins og round robin: tallet med sitt eget ord', () => {
    const skins = { kind: 'skins', scoring: 'net', players: [{ userId: 'a', rank: 1, totalSkins: 6, holesWon: 5 }] } as unknown as ModeResult;
    expect(text(hero(skins).lines)).toEqual(['Marte vant', 'med 6 skins']);
    const rr = { kind: 'round_robin', players: [{ userId: 'a', rank: 1, totalHoleWins: 7 }] } as unknown as ModeResult;
    expect(text(hero(rr).lines)).toEqual(['Marte vant', 'med 7 hull']);
  });

  it('ingen tok et skin: den rolige linja, ingen feiring', () => {
    const skins = {
      kind: 'skins',
      scoring: 'net',
      players: [
        { userId: 'a', rank: 1, totalSkins: 0, holesWon: 0 },
        { userId: 'b', rank: 1, totalSkins: 0, holesWon: 0 },
      ],
    } as unknown as ModeResult;
    const model = hero(skins);
    expect(text(model.lines)).toEqual(['Spillet er ferdig']);
    expect(model.celebrates).toBe(false);
  });

  it('ligaflight på to: «Godkjent», ingen feiring, ingen plass (#2850)', () => {
    const model = hero(stableford([['a', 34, 1], ['b', 30, 2]]), bundle(['a', 'b'], { leagueRoundId: 'round-1' }));
    expect(text(model.lines)).toEqual(['Godkjent']);
    expect(model.celebrates).toBe(false);
    expect(model.card.rows.map((r) => [r.rank, r.winner])).toEqual([[null, false], [null, false]]);
  });

  it('to utenfor en liga: vinneren feires som før', () => {
    const model = hero(stableford([['a', 34, 1], ['b', 30, 2]]), bundle(['a', 'b']));
    expect(text(model.lines)).not.toEqual(['Godkjent']);
    expect(model.card.rows[0]).toMatchObject({ rank: 1, winner: true });
  });

  it('ligarunde alene: «Godkjent», ingen feiring (#2712)', () => {
    const model = hero(stableford([['a', 34, 1]]), bundle(['a'], { leagueRoundId: 'round-1' }));
    expect(text(model.lines)).toEqual(['Godkjent']);
    expect(model.celebrates).toBe(false);
    expect(model.card.rows[0]).toMatchObject({ rank: null, winner: false });
  });

  const match = (result: unknown) =>
    ({
      kind: 'singles_matchplay',
      sides: [{ userId: 'a' }, { userId: 'b' }],
      holes: [],
      holesUp: 3,
      holesPlayed: 16,
      result,
    }) as unknown as ModeResult;

  it('matchplay: marginen i setningen, rett, og kortet sier det samme', () => {
    const model = hero(match({ winner: 'side1', formatted: '3&2' }), bundle(['a', 'b']));
    expect(text(model.lines)).toEqual(['Marte vant 3&2']);
    expect(model.lines[0].find((word) => word.gold)?.text).toBe('3&2');
    expect(model).toMatchObject({ goldItalic: false, celebrates: true, resultInSentence: true });
    expect(model.card.rows.map((row) => [row.rank, row.figure])).toEqual([
      [null, '3&2'],
      [null, null],
    ]);
  });

  it('matchplay delt: «Uavgjort», ingen feiring', () => {
    const model = hero(match({ winner: 'tied', formatted: 'AS' }), bundle(['a', 'b']));
    expect(text(model.lines)).toEqual(['Uavgjort']);
    expect(model).toMatchObject({ celebrates: false, resultInSentence: true });
  });

  it('matchplay uten avgjørelse: den rolige linja, og kortet viser stillingen', () => {
    const model = hero(match(null), bundle(['a', 'b']));
    expect(text(model.lines)).toEqual(['Spillet er ferdig']);
    expect(model.resultInSentence).toBe(false);
  });
});

describe('kortet', () => {
  it('sier det samme som nettets: overskrift, metalinje og dato i Oslo-tid', () => {
    const { card } = hero(stableford([['a', 38, 1], ['b', 36, 2], ['c', 34, 3], ['d', 30, 4]]));
    expect(text(card.headline.lines)).toEqual(['Marte vant', 'med 38 poeng']);
    expect(card.kicker).toBe('Torsdagsrunden · Byneset');
    expect(card.meta).toBe('Stableford · 5 spillere · 27. september');
    expect(card.rows.map((row) => [row.rank, row.name, row.figure, row.winner])).toEqual([
      [1, 'Marte L.', '38', true],
      [2, 'Jonas B.', '36', false],
      [3, 'Sigrid A.', '34', false],
    ]);
    expect(card.height).toBe(1350);
    expect(text([card.tagline])[0]).toBe('Fyr opp golfturneringen på et par minutter');
    expect(card.tagline.find((word) => word.gold)?.text).toBe('par');
  });

  it('holder kortets mot par på lagformat, som på nettet', () => {
    const result = {
      kind: 'texas_scramble',
      ranking: 'net_to_par',
      holes: [],
      teams: [
        { teamNumber: 3, rank: 1, totalNet: 62, toPar: -10, teamHandicap: 7, members: [{ userId: 'a' }, { userId: 'b' }], holes: [{}], missingHoles: [], decidedBy: null },
      ],
    } as unknown as ModeResult;
    expect(text(hero(result).card.headline.lines)).toEqual(['Marte og Jonas vant', 'på −10']);
  });

  it('uten dato utelates den, og ni hull står på metalinja', () => {
    const b = { ...bundle(['a'], { endedAt: undefined, holeSegment: 'front9' }) };
    const { card } = hero(stableford([['a', 18, 1]]), b);
    expect(card.meta).toBe('Stableford · 1 spiller · 9 hull');
  });

  it('variantene har formatets eget navn', () => {
    const b = bundle(['a'], { gameMode: 'shamble', modeConfig: { kind: 'shamble', shamble_variant: 'champagne' } });
    expect(hero(stableford([['a', 18, 1]]), b).card.meta.startsWith('Champagne Scramble ·')).toBe(true);
  });
});

describe('templateWords', () => {
  it('fyller malen og merker gull', () => {
    expect(templateWords('{names} vant med <gold>{result}</gold>', { names: 'Marte', result: '38 poeng' })).toEqual([
      { text: 'Marte', gold: false },
      { text: 'vant', gold: false },
      { text: 'med', gold: false },
      { text: '38', gold: true },
      { text: 'poeng', gold: true },
    ]);
  });
});
