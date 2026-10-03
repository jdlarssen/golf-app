import { describe, expect, it } from 'vitest';

import type { ShareCardModel, ShareCardRow } from '@/lib/games/buildShareCardData';

import { CHARS_PER_LINE, computeCardHeight, estimateLines } from './shareCardHeight';

function row(rank: number, name: string): ShareCardRow {
  return { rank, name, score: { kind: 'vsPar', label: '−2' }, isSharer: false };
}

/** A placement card: the first `winnerCount` podium rows share rank 1. */
function placement(names: string[], winnerCount: number): ShareCardModel {
  const podium = names.map((n, i) => row(i < winnerCount ? 1 : i + 1, n));
  return {
    band: 'placement',
    podium,
    winners: podium.slice(0, winnerCount),
    sharerStrip: null,
    match: null,
    sideTournaments: [],
  };
}

const OPTS = { nameLines: 1, hasMeta: true };
/** Height of one winner block past the first, gap included. */
const EXTRA_WINNER = 16 + 236;
/** Height of a one-line runner-up row. */
const ROW = 116;

describe('estimateLines', () => {
  it('a short name is one line', () => {
    expect(estimateLines('Kristian Strand', CHARS_PER_LINE.winner)).toBe(1);
  });

  it('a two-player team name wraps in the hero block', () => {
    expect(estimateLines('Benjamin Løkken / Martin Aas', CHARS_PER_LINE.winner)).toBe(2);
  });

  it('a four-player Texas team name takes three hero lines', () => {
    expect(
      estimateLines('Kristian Strand / Jonas Rud / Lars Vik / Ola Kompis', CHARS_PER_LINE.winner),
    ).toBe(3);
  });

  it('one unbroken token longer than a line is split', () => {
    expect(estimateLines('x'.repeat(50), 23)).toBe(3);
  });

  it('empty text still takes one line', () => {
    expect(estimateLines('', 23)).toBe(1);
  });
});

describe('computeCardHeight', () => {
  const single = computeCardHeight(placement(['Alice', 'Bob', 'Charlie'], 1), OPTS);

  it('a single winner keeps the height it had before #2318', () => {
    // 72+76 header, 36+80+58 title and meta, 42 divider, 8+196 hero,
    // 2×116 rows, 130 footer, 72 bottom pad.
    expect(single).toBe(1002);
  });

  it('two winners count the second hero block at full height', () => {
    const h = computeCardHeight(placement(['Alice', 'Bob', 'Charlie'], 2), OPTS);
    expect(h).toBe(single + EXTRA_WINNER - ROW);
  });

  it('three winners count both extra hero blocks at full height', () => {
    const h = computeCardHeight(placement(['Alice', 'Bob', 'Charlie'], 3), OPTS);
    expect(h).toBe(single + 2 * (EXTRA_WINNER - ROW));
  });

  it('a long team name in a hero block adds a 67px line', () => {
    const short = computeCardHeight(placement(['Alice / Bob', 'Carl / Dina'], 2), OPTS);
    const long = computeCardHeight(
      placement(['Benjamin Løkken / Martin Aas', 'Carl / Dina'], 2),
      OPTS,
    );
    expect(long).toBe(short + 67);
  });

  it('a long runner-up name grows its row', () => {
    const short = computeCardHeight(placement(['Alice', 'Bob'], 1), OPTS);
    const long = computeCardHeight(
      placement(['Alice', 'Philip "Johnnymaddog" Moen / Martin "Mattin" Flasnes'], 1),
      OPTS,
    );
    expect(long).toBe(short + (2 * 48 - 64));
  });

  it('no winners (a skins round nobody won) draws rows only', () => {
    const none = computeCardHeight(placement(['Alice', 'Bob', 'Charlie'], 0), OPTS);
    expect(none).toBe(single - 196 + ROW);
  });

  it('a matchplay headline that wraps adds a 77px line', () => {
    const match: ShareCardModel = {
      band: 'matchplay',
      podium: [],
      winners: [],
      sharerStrip: null,
      match: { sharerOutcome: null, headline: { kind: 'undecided' } },
      sideTournaments: [],
    };
    const one = computeCardHeight(match, { ...OPTS, headline: 'Alice vant 2&1' });
    const two = computeCardHeight(match, { ...OPTS, headline: 'Martin Aas / Benjamin Løkken vant 2&1' });
    expect(two).toBe(one + 77);
  });
});
