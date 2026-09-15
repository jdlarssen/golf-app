import { describe, it, expect } from 'vitest';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';
import {
  bingoBangoBongoCategoryColumn,
  isBingoBangoBongoNoOp,
  mergeCategory,
  type BingoBangoBongoCategoryKey,
} from './mergeBingoBangoBongoCategory';

function hole(
  holeNumber: number,
  bingoUserId: string | null,
  bangoUserId: string | null,
  bongoUserId: string | null,
): BingoBangoBongoHoleInput {
  return { holeNumber, bingoUserId, bangoUserId, bongoUserId };
}

describe('mergeCategory', () => {
  it.each<
    [
      string,
      BingoBangoBongoHoleInput[],
      number,
      BingoBangoBongoCategoryKey,
      string | null,
      BingoBangoBongoHoleInput[],
    ]
  >([
    // #1950: Ola's bingo arrived over realtime while Kari saved her bango. A
    // whole-row replace with Kari's click-time snapshot wiped Ola's bingo off
    // her screen.
    [
      'flight-kameratens kategori fra realtime står når egen kategori lagres',
      [hole(5, 'ola', null, null)],
      5,
      'bangoUserId',
      'kari',
      [hole(5, 'ola', 'kari', null)],
    ],
    [
      'første registrering på hullet lager raden med de to andre tomme, sortert inn',
      [hole(3, 'a', null, null), hole(8, null, 'b', null)],
      5,
      'bongoUserId',
      'c',
      [hole(3, 'a', null, null), hole(5, null, null, 'c'), hole(8, null, 'b', null)],
    ],
    [
      '«Ingen» tømmer bare den ene kategorien',
      [hole(5, 'ola', 'kari', 'per')],
      5,
      'bingoUserId',
      null,
      [hole(5, null, 'kari', 'per')],
    ],
  ])('%s', (_label, prev, holeNumber, key, userId, expected) => {
    expect(mergeCategory(prev, holeNumber, key, userId)).toEqual(expected);
  });

  // The hole entry re-syncs its chips when `savedHole` changes identity, so the
  // merged hole must be a new object and the previous state must stay intact.
  it('muterer ikke forrige tilstand og gir hullet en ny rad', () => {
    const prev = [hole(5, 'ola', null, null)];
    const before = structuredClone(prev);

    const next = mergeCategory(prev, 5, 'bangoUserId', 'kari');

    expect(prev).toEqual(before);
    expect(next[0]).not.toBe(prev[0]);
  });
});

describe('isBingoBangoBongoNoOp', () => {
  // #2090: the screen can show an old snapshot (app polling, web realtime lag).
  // «Ingen» on a category that already shows empty must never reach the DB, or
  // it writes NULL over a flight-mate's registration the player never saw.
  it.each<[string, string | null, string | null, boolean]>([
    ['«Ingen» på en kategori som alt er tom', null, null, true],
    ['samme spiller som alt står', 'ola', 'ola', true],
    ['tømming av en valgt spiller skrives', 'ola', null, false],
    ['ny spiller i en tom kategori skrives', null, 'ola', false],
    ['bytte til en annen spiller skrives', 'ola', 'kari', false],
  ])('%s', (_label, shown, tapped, expected) => {
    expect(isBingoBangoBongoNoOp(hole(5, shown, 'per', null), 'bingoUserId', tapped)).toBe(
      expected,
    );
  });

  it('ser bare på den trykte kategorien', () => {
    const current = hole(5, 'ola', null, 'per');
    expect(isBingoBangoBongoNoOp(current, 'bangoUserId', null)).toBe(true);
    expect(isBingoBangoBongoNoOp(current, 'bongoUserId', null)).toBe(false);
  });
});

describe('bingoBangoBongoCategoryColumn', () => {
  // #1950: a key outside the type would otherwise fall out of the switch as
  // undefined, and a spread of undefined is a payload without any category.
  it('kaster på en nøkkel utenfor typen i stedet for å gi et fragment uten kategori', () => {
    expect(() =>
      bingoBangoBongoCategoryColumn('wolfUserId' as unknown as BingoBangoBongoCategoryKey, 'u-1'),
    ).toThrow();
  });
});
