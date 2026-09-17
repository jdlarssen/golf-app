import { describe, it, expect } from 'vitest';
import {
  foldTeamRows,
  type FoldRosterRow,
  type FoldScoreRow,
} from './foldTeamRows';

// #2067 — Type A-lås på regelen «lagets rader følger laget». I én-ball-
// formatene eier lag-kapteinen lagets rader. Trekkes kapteinen (kontosletting
// midt i runden, 0174), går eierskapet til neste medlem, men hullene som alt
// er ført, ligger igjen på den trukne. Foldingen legger dem på den nåværende
// eieren, slik at alle flatene leser ett sett rader.

const WD = '2026-09-17T10:00:00Z';

function roster(
  user_id: string,
  team_number: number | null,
  withdrawn_at: string | null = null,
): FoldRosterRow {
  return { user_id, team_number, withdrawn_at };
}

type Row = FoldScoreRow & { putts: number | null; enteredBy: string };

function row(
  userId: string,
  holeNumber: number,
  strokes: number | null,
  extra: Partial<Row> = {},
): Row {
  return { userId, holeNumber, strokes, putts: null, enteredBy: userId, ...extra };
}

/** Lag 1: kaptein `a` (trukket) + makker `b`. Lag 2: `c` + `d`, urørt. */
const ROSTER_CAPTAIN_WD: FoldRosterRow[] = [
  roster('a', 1, WD),
  roster('b', 1),
  roster('c', 2),
  roster('d', 2),
];

function holes(userId: string, from: number, to: number, strokes = 4): Row[] {
  const out: Row[] = [];
  for (let h = from; h <= to; h++) out.push(row(userId, h, strokes));
  return out;
}

function holeNumbersFor(rows: readonly FoldScoreRow[], userId: string): number[] {
  return rows
    .filter((r) => r.userId === userId)
    .map((r) => r.holeNumber)
    .sort((x, y) => x - y);
}

describe('foldTeamRows — ingen endring', () => {
  it('lar radene stå når formatet ikke deler lag-rad (best ball)', () => {
    const rows = [...holes('a', 1, 9), ...holes('b', 1, 9)];

    expect(
      foldTeamRows({ roster: ROSTER_CAPTAIN_WD, rows, mode: 'best_ball' }),
    ).toStrictEqual(rows);
  });

  it('lar radene stå når ingen på laget har trukket seg', () => {
    const rows = [...holes('a', 1, 9), ...holes('c', 1, 9)];

    expect(
      foldTeamRows({
        roster: [roster('a', 1), roster('b', 1), roster('c', 2), roster('d', 2)],
        rows,
        mode: 'texas_scramble',
      }),
    ).toStrictEqual(rows);
  });

  it('lar radene stå når hele laget har trukket seg (ingen eier å legge dem på)', () => {
    const rows = holes('a', 1, 9);

    expect(
      foldTeamRows({
        roster: [roster('a', 1, WD), roster('b', 1, WD)],
        rows,
        mode: 'texas_scramble',
      }),
    ).toStrictEqual(rows);
  });

  it('gir tom liste for tomme rader', () => {
    expect(
      foldTeamRows({ roster: ROSTER_CAPTAIN_WD, rows: [], mode: 'texas_scramble' }),
    ).toStrictEqual([]);
  });

  it('ignorerer spillere uten lag', () => {
    const rows = holes('x', 1, 3);

    expect(
      foldTeamRows({
        roster: [roster('x', null, WD), roster('y', null)],
        rows,
        mode: 'texas_scramble',
      }),
    ).toStrictEqual(rows);
  });
});

describe('foldTeamRows — trukket kaptein', () => {
  it('legger kapteinens førte hull på den nye eieren', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: holes('a', 1, 9),
      mode: 'texas_scramble',
    });

    expect(holeNumbersFor(folded, 'b')).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(holeNumbersFor(folded, 'a')).toStrictEqual([]);
  });

  it('slår sammen de gamle hullene med dem den nye eieren fører videre', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [...holes('a', 1, 9), ...holes('b', 10, 12, 5)],
      mode: 'texas_scramble',
    });

    expect(holeNumbersFor(folded, 'b')).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(folded.find((r) => r.holeNumber === 11)?.strokes).toBe(5);
  });

  it('lar en retting den nye eieren gjør, slå den gamle verdien', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [...holes('a', 1, 9), row('b', 5, 7)],
      mode: 'texas_scramble',
    });

    const hole5 = folded.filter((r) => r.holeNumber === 5);
    expect(hole5).toStrictEqual([row('b', 5, 7)]);
  });

  it('viser den gamle verdien når den nye eierens rad er tømt («Angre»)', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [row('a', 5, 4), row('b', 5, null)],
      mode: 'texas_scramble',
    });

    expect(folded).toStrictEqual([row('b', 5, 4, { enteredBy: 'a' })]);
  });

  it('bruker den gamle radens slag og den nye radens putter når den nye bare har putter', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [row('a', 5, 4, { putts: 1 }), row('b', 5, null, { putts: 2 })],
      mode: 'texas_scramble',
    });

    expect(folded).toStrictEqual([row('b', 5, 4, { putts: 2, enteredBy: 'a' })]);
  });

  it('lar putter følge den gamle raden når den nye raden verken har slag eller putter', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [row('a', 5, 4, { putts: 1 }), row('b', 5, null)],
      mode: 'texas_scramble',
    });

    expect(folded).toStrictEqual([row('b', 5, 4, { putts: 1, enteredBy: 'a' })]);
  });

  it('beholder radens øvrige felt', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [row('a', 3, 6, { putts: 2, enteredBy: 'b' })],
      mode: 'texas_scramble',
    });

    expect(folded).toStrictEqual([row('b', 3, 6, { putts: 2, enteredBy: 'b' })]);
  });

  it('rører ikke de andre lagene', () => {
    const other = holes('c', 1, 9, 3);
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [...holes('a', 1, 2), ...other],
      mode: 'texas_scramble',
    });

    expect(folded.filter((r) => r.userId === 'c')).toStrictEqual(other);
  });

  it('holder én rad per hull også når den gamle raden står etter den nye', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [row('b', 5, 7), row('a', 5, 4)],
      mode: 'texas_scramble',
    });

    expect(folded).toStrictEqual([row('b', 5, 7)]);
  });

  it.each([
    'ambrose',
    'florida_scramble',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ] as const)('gjelder også %s', (mode) => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: holes('a', 1, 3),
      mode,
    });

    expect(holeNumbersFor(folded, 'b')).toStrictEqual([1, 2, 3]);
  });
});

describe('foldTeamRows — patsome bytter form på hull 7', () => {
  it('lar kapteinens egen ball på hull 1–6 ligge, og folder hull 7 og utover', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [...holes('a', 1, 9), ...holes('b', 1, 6, 5)],
      mode: 'patsome',
    });

    expect(holeNumbersFor(folded, 'a')).toStrictEqual([1, 2, 3, 4, 5, 6]);
    expect(holeNumbersFor(folded, 'b')).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(folded.filter((r) => r.userId === 'b' && r.holeNumber <= 6)).toStrictEqual(
      holes('b', 1, 6, 5),
    );
  });
});

describe('foldTeamRows — flere trukne på samme lag', () => {
  it('lar den siste eieren (lex-største trukne) vinne over den første', () => {
    // a eide raden til a ble trukket, så b til b ble trukket, nå c.
    const folded = foldTeamRows({
      roster: [roster('a', 1, WD), roster('b', 1, WD), roster('c', 1)],
      rows: [row('a', 5, 4), row('b', 5, 6), row('a', 2, 3), row('b', 11, 5)],
      mode: 'texas_scramble',
    });

    expect(folded).toStrictEqual([
      row('c', 5, 6, { enteredBy: 'b' }),
      row('c', 2, 3, { enteredBy: 'a' }),
      row('c', 11, 5, { enteredBy: 'b' }),
    ]);
  });

  it('lar et trukket ikke-kapteins-medlem uten lag-rader stå urørt', () => {
    const rows = holes('a', 1, 9);

    expect(
      foldTeamRows({
        roster: [roster('a', 1), roster('b', 1, WD)],
        rows,
        mode: 'texas_scramble',
      }),
    ).toStrictEqual(rows);
  });
});

describe('foldTeamRows — onto: teamCaptain', () => {
  it('legger lagets rader på lagets kaptein blant ALLE medlemmer, også den trukne', () => {
    const folded = foldTeamRows({
      roster: ROSTER_CAPTAIN_WD,
      rows: [...holes('a', 1, 9), ...holes('b', 10, 12, 5), row('b', 5, 7)],
      mode: 'texas_scramble',
      onto: 'teamCaptain',
    });

    expect(holeNumbersFor(folded, 'a')).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(holeNumbersFor(folded, 'b')).toStrictEqual([]);
    expect(folded.find((r) => r.holeNumber === 5)?.strokes).toBe(7);
  });
});
