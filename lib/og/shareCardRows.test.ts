import { describe, expect, it } from 'vitest';
import type { ShareCardModel, ShareCardRow } from '@/lib/games/buildShareCardData';
import { matchRows, placementRows } from './shareCardRows';
import { headlineWordLines, keepGoldTogether, lineText, osloDate, type Word } from './shareCardHeadline';

// Type A (#2756): the card's rules, moved out of the PNG route so the app reads
// the same ones.

const row = (rank: number, name: string, value: number): ShareCardRow => ({
  rank,
  name,
  memberNames: [name],
  score: { kind: 'points', value },
  isSharer: false,
});

const model = (over: Partial<ShareCardModel>): ShareCardModel => ({
  band: 'placement',
  podium: [],
  winners: [],
  sharerStrip: null,
  match: null,
  sideTournaments: [],
  ...over,
});

describe('placementRows', () => {
  const podium = [row(1, 'Marte L.', 38), row(2, 'Jonas B.', 36), row(3, 'Sigrid A.', 34), row(4, 'Ola N.', 30)];

  it('gives three rows, and gold to the winner', () => {
    const rows = placementRows(model({ podium, winners: [podium[0]] }), false);
    expect(rows.map((r) => [r.rank, r.name, r.figure, r.winner])).toEqual([
      [1, 'Marte L.', '38', true],
      [2, 'Jonas B.', '36', false],
      [3, 'Sigrid A.', '34', false],
    ]);
  });

  it('a skins round nobody won has no gold', () => {
    const rows = placementRows(model({ band: 'skins', podium: [row(1, 'A', 0), row(1, 'B', 0)], winners: [] }), false);
    expect(rows.every((r) => !r.winner)).toBe(true);
  });

  it('a league round played alone has no medallion and no gold (#2712)', () => {
    const only = row(1, 'Siri S.', 34);
    const [one] = placementRows(model({ podium: [only], winners: [only] }), true);
    expect(one).toMatchObject({ rank: null, winner: false, figure: '34' });
  });
});

describe('matchRows', () => {
  it('gives the margin to the winning side only', () => {
    const rows = matchRows(
      model({
        band: 'matchplay',
        match: {
          headline: { kind: 'winner', winnerName: 'Anna M.', margin: '3&2' },
          sides: [
            { memberNames: ['Anna M.'], won: true, isSharer: false },
            { memberNames: ['Per L.'], won: false, isSharer: false },
          ],
        } as unknown as ShareCardModel['match'],
      }),
    );
    expect(rows.map((r) => [r.rank, r.name, r.figure, r.winner])).toEqual([
      [null, 'Anna M.', '3&2', true],
      [null, 'Per L.', null, false],
    ]);
  });

  it('no match gives no rows', () => {
    expect(matchRows(model({ band: 'matchplay' }))).toEqual([]);
  });
});

describe('the headline words', () => {
  const words: Word[] = [
    { text: 'Marte', gold: false },
    { text: 'vant', gold: false },
    { text: 'med', gold: false },
    { text: '38', gold: true },
    { text: 'poeng', gold: true },
  ];

  it('keeps the gold words together', () => {
    expect(keepGoldTogether(words).map((w) => w.text)).toEqual(['Marte', 'vant', 'med', '38 poeng']);
  });

  it('breaks a result headline before its preposition', () => {
    const lines = headlineWordLines(words, { kind: 'won', names: ['Marte'], result: { kind: 'points', value: 38 } });
    expect(lineText(lines)).toBe('Marte vant\nmed 38 poeng');
  });

  it('runs other headlines as one block', () => {
    const lines = headlineWordLines([{ text: 'Godkjent', gold: false }], { kind: 'approved' });
    expect(lineText(lines)).toBe('Godkjent');
  });
});

describe('osloDate', () => {
  it('gives the Oslo date, also just after midnight there', () => {
    expect(osloDate('2026-09-26T22:30:00.000Z', 'nb-NO')).toBe('27. september');
  });

  it('leaves out a missing or unreadable date', () => {
    expect(osloDate(null, 'nb-NO')).toBeNull();
    expect(osloDate(undefined, 'nb-NO')).toBeNull();
    expect(osloDate('ikke en dato', 'nb-NO')).toBeNull();
  });
});
