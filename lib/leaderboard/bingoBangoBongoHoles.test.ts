import { describe, expect, it } from 'vitest';
import type { BingoBangoBongoHoleRow, BingoBangoBongoResult } from '@/lib/scoring/modes/types';
import { bingoBangoBongoHoleCards } from './bingoBangoBongoHoles';

// #2255 PR 3c: «Hull for hull» for Bingo Bango Bongo. Regnestykket bor her, så
// webbens visning og appens skjerm tegner de samme kortene.

/**
 * Ett hull. Poengene som motoren gir dem: ett per prestasjon til en kjent
 * spiller (`known`), i rekkefølgen bingo, bango, bongo. Ukjente får ingen.
 */
function hole(
  holeNumber: number,
  bingoUserId: string | null,
  bangoUserId: string | null,
  bongoUserId: string | null,
  known: readonly string[] = ['per', 'kari', 'ola', 'nils'],
): BingoBangoBongoHoleRow {
  const pointsByPlayer: Record<string, number> = {};
  for (const uid of [bingoUserId, bangoUserId, bongoUserId]) {
    if (uid != null && known.includes(uid)) pointsByPlayer[uid] = (pointsByPlayer[uid] ?? 0) + 1;
  }
  return { holeNumber, bingoUserId, bangoUserId, bongoUserId, pointsByPlayer };
}

/** Samme hull med nøklene i `pointsByPlayer` i motsatt rekkefølge. */
function reversedPoints(row: BingoBangoBongoHoleRow): BingoBangoBongoHoleRow {
  return { ...row, pointsByPlayer: Object.fromEntries(Object.entries(row.pointsByPlayer).reverse()) };
}

function result(holes: BingoBangoBongoHoleRow[]): BingoBangoBongoResult {
  return { kind: 'bingo_bango_bongo', holes, players: [] };
}

const card = (row: BingoBangoBongoHoleRow) => bingoBangoBongoHoleCards(result([row])).holes[0]!;
const rowsOf = (row: BingoBangoBongoHoleRow) =>
  card(row).rows.map((r) => [r.category, r.hintKey, r.userId, r.isSweeper]);

describe('bingoBangoBongoHoleCards', () => {
  it('de tre prestasjonene i fast rekkefølge, med hint-nøkkel og hvem som tok dem', () => {
    const c = card(hole(1, 'per', 'kari', 'ola'));
    expect(c.pending).toBe(false);
    expect(c.sweptAll).toBe(false);
    expect(rowsOf(hole(1, 'per', 'kari', 'ola'))).toEqual([
      ['bingo', 'firstOnGreen', 'per', false],
      ['bango', 'nearestPin', 'kari', false],
      ['bongo', 'firstInHole', 'ola', false],
    ]);
  });

  it('en prestasjon som mangler står som ikke satt, og hullet venter ikke', () => {
    const c = card(hole(3, 'kari', null, null));
    expect(c.pending).toBe(false);
    expect(c.rows.map((r) => [r.category, r.userId])).toEqual([
      ['bingo', 'kari'],
      ['bango', null],
      ['bongo', null],
    ]);
  });

  it('et hull uten noen av de tre venter: ingen rader, ingen feiing', () => {
    const c = card(hole(4, null, null, null));
    expect(c.pending).toBe(true);
    expect(c.sweptAll).toBe(false);
    expect(c.rows).toEqual([]);
  });

  it('to av tre til samme spiller: de to radene er hans, uten «Feiet!»', () => {
    expect(rowsOf(hole(5, 'nils', 'per', 'nils'))).toEqual([
      ['bingo', 'firstOnGreen', 'nils', true],
      ['bango', 'nearestPin', 'per', false],
      ['bongo', 'firstInHole', 'nils', true],
    ]);
    expect(card(hole(5, 'nils', 'per', 'nils')).sweptAll).toBe(false);
  });

  it('alle tre til samme spiller: «Feiet!», og alle radene er hans', () => {
    const c = card(hole(2, 'ola', 'ola', 'ola'));
    expect(c.sweptAll).toBe(true);
    expect(c.pending).toBe(false);
    expect(c.rows.map((r) => r.isSweeper)).toEqual([true, true, true]);
  });

  it('tre ulike: ingen feier, uansett rekkefølgen i motorens poeng', () => {
    // Bare én kan ha to av tre, så ingen likhet trenger en regel. Rekkefølgen
    // i `pointsByPlayer` skal ikke kunne velge en feier.
    const row = hole(1, 'per', 'kari', 'ola');
    for (const r of [row, reversedPoints(row)]) {
      expect(card(r).rows.map((x) => x.isSweeper)).toEqual([false, false, false]);
      expect(card(r).sweptAll).toBe(false);
    }
  });

  it('feieren er den samme uansett rekkefølgen i motorens poeng', () => {
    const row = hole(6, 'kari', 'nils', 'nils');
    expect(card(row).rows.map((r) => r.isSweeper)).toEqual([false, true, true]);
    expect(card(reversedPoints(row)).rows.map((r) => r.isSweeper)).toEqual([false, true, true]);
  });

  it('en ukjent spiller får ingen poeng av motoren, og blir ikke feier', () => {
    const c = card(hole(7, 'spøkelse', 'spøkelse', null));
    expect(c.pending).toBe(false);
    expect(c.sweptAll).toBe(false);
    expect(c.rows.map((r) => [r.userId, r.isSweeper])).toEqual([
      ['spøkelse', false],
      ['spøkelse', false],
      [null, false],
    ]);
  });

  it('hullene i motorens rekkefølge', () => {
    const cards = bingoBangoBongoHoleCards(
      result([hole(1, 'per', null, null), hole(2, null, null, null), hole(3, 'ola', 'ola', 'ola')]),
    );
    expect(cards.holes.map((h) => [h.holeNumber, h.pending, h.sweptAll])).toEqual([
      [1, false, false],
      [2, true, false],
      [3, false, true],
    ]);
  });
});
