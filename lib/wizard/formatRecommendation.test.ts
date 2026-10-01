import { describe, it, expect } from 'vitest';
import { splitFormatsForCount } from './formatRecommendation';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';

// #2260: the Kompis catalogue on torny-staging after 0198_kompis_format_order,
// in getFormatsForIntent order (is_primary desc, sort_order, format_slug).
const KOMPIS: ReadonlyArray<[string, boolean, number]> = [
  ['best_ball', true, 1],
  ['stableford', true, 2],
  ['wolf', true, 3],
  ['skins', true, 4],
  ['bingo_bango_bongo', true, 90],
  ['acey_deucey', true, 95],
  ['ambrose', true, 100],
  ['chapman_matchplay', true, 100],
  ['florida_scramble', true, 100],
  ['texas_scramble', false, 30],
  ['singles_matchplay', false, 40],
  ['nassau', false, 60],
  ['nines', false, 71],
  ['modified_stableford', false, 80],
  ['fourball_matchplay', false, 100],
  ['foursomes_matchplay', false, 100],
  ['greensome_matchplay', false, 100],
  ['patsome', false, 100],
  ['round_robin', false, 100],
  ['shamble', false, 100],
  ['solo_strokeplay', false, 100],
  ['gruesome_matchplay', false, 110],
];

const CATALOG: FormatForIntent[] = KOMPIS.map(([slug, is_primary, sort_order]) => ({
  slug,
  icon_key: slug,
  is_primary,
  sort_order,
}));

const slugs = (formats: FormatForIntent[]) => formats.map((f) => f.slug);

describe('splitFormatsForCount — anbefalt, tre andre og resten (#2260)', () => {
  it.each([
    [1, 'stableford', ['modified_stableford', 'solo_strokeplay'], []],
    [
      2,
      'best_ball',
      ['stableford', 'skins', 'bingo_bango_bongo'],
      ['singles_matchplay', 'nassau', 'modified_stableford', 'solo_strokeplay'],
    ],
    [
      3,
      'stableford',
      ['wolf', 'skins', 'bingo_bango_bongo'],
      ['nassau', 'nines', 'modified_stableford', 'solo_strokeplay'],
    ],
    [
      4,
      'best_ball',
      ['stableford', 'wolf', 'skins'],
      [
        'bingo_bango_bongo',
        'acey_deucey',
        'ambrose',
        'chapman_matchplay',
        'texas_scramble',
        'nassau',
        'modified_stableford',
        'fourball_matchplay',
        'foursomes_matchplay',
        'greensome_matchplay',
        'patsome',
        'round_robin',
        'solo_strokeplay',
        'gruesome_matchplay',
      ],
    ],
    [
      5,
      'stableford',
      ['wolf', 'skins', 'bingo_bango_bongo'],
      ['nassau', 'modified_stableford', 'solo_strokeplay'],
    ],
    [
      8,
      'best_ball',
      ['stableford', 'skins', 'bingo_bango_bongo'],
      [
        'ambrose',
        'florida_scramble',
        'texas_scramble',
        'nassau',
        'modified_stableford',
        'patsome',
        'shamble',
        'solo_strokeplay',
      ],
    ],
  ])('n=%i → %s, så %j', (n, recommended, others, rest) => {
    const split = splitFormatsForCount(CATALOG, n, undefined);
    expect(split.recommended?.slug).toBe(recommended);
    expect(slugs(split.others)).toEqual(others);
    expect(slugs(split.rest)).toEqual(rest);
  });

  it('4 spillere: 18 som passer, 14 bak lenka', () => {
    const split = splitFormatsForCount(CATALOG, 4, undefined);
    expect(split.rest).toHaveLength(14);
    expect(split.fittingCount).toBe(18);
  });

  it('uten antall: ingen anbefaling, hele katalogen i resten', () => {
    const split = splitFormatsForCount(CATALOG, undefined, 'wolf');
    expect(split.recommended).toBeUndefined();
    expect(split.others).toEqual([]);
    expect(slugs(split.rest)).toEqual(slugs(CATALOG));
    expect(split.fittingCount).toBe(22);
  });

  it('tom katalog: ingen anbefaling', () => {
    const split = splitFormatsForCount([], 4, undefined);
    expect(split.recommended).toBeUndefined();
    expect(split.others).toEqual([]);
    expect(split.rest).toEqual([]);
    expect(split.fittingCount).toBe(0);
  });

  it('ingenting passer: tomt overalt', () => {
    const only = CATALOG.filter((f) => f.slug === 'singles_matchplay');
    const split = splitFormatsForCount(only, 4, undefined);
    expect(split.recommended).toBeUndefined();
    expect(split.fittingCount).toBe(0);
  });

  it('et valgt format fra resten legges sist i «andre» og tas ut av resten', () => {
    const split = splitFormatsForCount(CATALOG, 4, 'bingo_bango_bongo');
    expect(slugs(split.others)).toEqual(['stableford', 'wolf', 'skins', 'bingo_bango_bongo']);
    expect(slugs(split.rest)).not.toContain('bingo_bango_bongo');
    expect(split.rest).toHaveLength(13);
    expect(split.fittingCount).toBe(18);
  });

  it('et valgt format som er anbefalt eller blant «andre», flyttes ikke', () => {
    expect(slugs(splitFormatsForCount(CATALOG, 4, 'best_ball').others)).toEqual([
      'stableford',
      'wolf',
      'skins',
    ]);
    expect(slugs(splitFormatsForCount(CATALOG, 4, 'wolf').others)).toEqual([
      'stableford',
      'wolf',
      'skins',
    ]);
  });

  it('et valgt format som ikke passer antallet, vises ikke', () => {
    const split = splitFormatsForCount(CATALOG, 4, 'nines');
    expect(slugs(split.others)).toEqual(['stableford', 'wolf', 'skins']);
    expect(slugs(split.rest)).not.toContain('nines');
  });
});
