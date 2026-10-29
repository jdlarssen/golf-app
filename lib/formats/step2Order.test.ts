import { describe, it, expect } from 'vitest';
import { compareStep2, moveWithinSection, step2Sections, step2SortOrder } from './step2Order';
import type { FormatWithMappings, MappingEntry } from './types';

function fmt(
  slug: string,
  kompis: MappingEntry | null,
  { active = true, klubb = null, solo = null }: {
    active?: boolean;
    klubb?: MappingEntry | null;
    solo?: MappingEntry | null;
  } = {},
): FormatWithMappings {
  return { slug, icon_key: slug, is_active: active, mappings: { kompis, klubb, solo } };
}
const primary = (sort_order: number): MappingEntry => ({ is_visible: true, is_primary: true, sort_order });
const secondary = (sort_order: number): MappingEntry => ({ is_visible: true, is_primary: false, sort_order });
const hiddenRow = (sort_order: number): MappingEntry => ({ is_visible: false, is_primary: false, sort_order });
const slugs = (list: FormatWithMappings[]) => list.map((f) => f.slug);

describe('compareStep2', () => {
  it('puts primary first, then sort_order, then slug — the order getFormatsForIntent asks the DB for', () => {
    const rows = [
      { slug: 'c', is_primary: false, sort_order: 10 },
      { slug: 'b', is_primary: true, sort_order: 100 },
      { slug: 'a', is_primary: true, sort_order: 100 },
      { slug: 'd', is_primary: true, sort_order: 5 },
    ];
    expect([...rows].sort(compareStep2).map((r) => r.slug)).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('step2Sections', () => {
  it('is empty for no formats', () => {
    expect(step2Sections([], 'kompis')).toEqual({ primary: [], secondary: [], hidden: [], inactive: [] });
  });

  it('breaks equal sort_order ties on slug', () => {
    const sections = step2Sections(
      [fmt('florida_scramble', primary(100)), fmt('ambrose', primary(100)), fmt('chapman_matchplay', primary(100))],
      'kompis',
    );
    expect(slugs(sections.primary)).toEqual(['ambrose', 'chapman_matchplay', 'florida_scramble']);
  });

  it('splits a staging-like catalogue the way step 2 shows it (Kompis 9/13/0, Klubb 8/1/13, Solo 3/0/19)', () => {
    // Kompis, Klubb and Solo on torny-staging, read 29.10.
    const kompisPrimary: Array<[string, number]> = [
      ['best_ball', 1], ['stableford', 2], ['wolf', 3], ['skins', 4], ['bingo_bango_bongo', 90],
      ['acey_deucey', 95], ['ambrose', 100], ['chapman_matchplay', 100], ['florida_scramble', 100],
    ];
    const kompisSecondary: Array<[string, number]> = [
      ['texas_scramble', 30], ['singles_matchplay', 40], ['nassau', 60], ['nines', 71],
      ['modified_stableford', 80], ['fourball_matchplay', 100], ['foursomes_matchplay', 100],
      ['greensome_matchplay', 100], ['patsome', 100], ['round_robin', 100], ['shamble', 100],
      ['solo_strokeplay', 100], ['gruesome_matchplay', 110],
    ];
    const klubb: Record<string, MappingEntry> = {
      stableford: primary(10), best_ball: primary(20), texas_scramble: primary(30),
      florida_scramble: primary(37), solo_strokeplay: primary(40), modified_stableford: primary(80),
      patsome: primary(90), shamble: primary(90), ambrose: secondary(35),
    };
    const solo: Record<string, MappingEntry> = {
      stableford: primary(10), solo_strokeplay: primary(20), modified_stableford: primary(80),
    };
    const kompis: Record<string, MappingEntry> = Object.fromEntries([
      ...kompisPrimary.map(([s, o]) => [s, primary(o)] as const),
      ...kompisSecondary.map(([s, o]) => [s, secondary(o)] as const),
    ]);
    // Reverse slug order so the helper cannot pass by keeping input order.
    const all = Object.keys(kompis)
      .sort()
      .reverse()
      .map((s) => fmt(s, kompis[s] ?? null, { klubb: klubb[s] ?? null, solo: solo[s] ?? null }));

    const k = step2Sections(all, 'kompis');
    expect(slugs(k.primary)).toEqual(kompisPrimary.map(([s]) => s));
    expect(slugs(k.secondary)).toEqual(kompisSecondary.map(([s]) => s));
    expect(k.hidden).toEqual([]);

    const kl = step2Sections(all, 'klubb');
    expect(slugs(kl.primary)).toEqual([
      'stableford', 'best_ball', 'texas_scramble', 'florida_scramble', 'solo_strokeplay',
      'modified_stableford', 'patsome', 'shamble',
    ]);
    expect(slugs(kl.secondary)).toEqual(['ambrose']);
    // The 13 without a Klubb row count as hidden, in slug order.
    expect(kl.hidden).toHaveLength(13);
    expect(slugs(kl.hidden)).toEqual([...slugs(kl.hidden)].sort());

    const so = step2Sections(all, 'solo');
    expect(slugs(so.primary)).toEqual(['stableford', 'solo_strokeplay', 'modified_stableford']);
    expect(so.secondary).toEqual([]);
    expect(so.hidden).toHaveLength(19);
  });

  it('keeps inactive formats out of the step-2 groups, whatever their mapping says', () => {
    const sections = step2Sections(
      [fmt('wolf', primary(1), { active: false }), fmt('skins', hiddenRow(5)), fmt('nassau', null)],
      'kompis',
    );
    expect(sections.primary).toEqual([]);
    expect(slugs(sections.hidden)).toEqual(['nassau', 'skins']);
    expect(slugs(sections.inactive)).toEqual(['wolf']);
  });
});

describe('moveWithinSection', () => {
  const group = ['best_ball', 'stableford', 'wolf'];

  it('moves one place down', () => {
    expect(moveWithinSection(group, 'best_ball', 'down')).toEqual({
      slugs: ['stableford', 'best_ball', 'wolf'],
      from: 0,
      to: 1,
    });
  });

  it('numbers a group (i+1)*10, so a move clears any equal sort_order', () => {
    const moved = moveWithinSection(['ambrose', 'chapman_matchplay', 'florida_scramble'], 'florida_scramble', 'up');
    expect(moved?.slugs.map((slug, i) => [slug, step2SortOrder(i)])).toEqual([
      ['ambrose', 10],
      ['florida_scramble', 20],
      ['chapman_matchplay', 30],
    ]);
  });

  it('moves one place up', () => {
    expect(moveWithinSection(group, 'wolf', 'up')).toEqual({
      slugs: ['best_ball', 'wolf', 'stableford'],
      from: 2,
      to: 1,
    });
  });

  it('is null at the edges, for one format, for an unknown slug and for an empty group', () => {
    expect(moveWithinSection(group, 'best_ball', 'up')).toBeNull();
    expect(moveWithinSection(group, 'wolf', 'down')).toBeNull();
    expect(moveWithinSection(['solo'], 'solo', 'down')).toBeNull();
    expect(moveWithinSection(group, 'nassau', 'up')).toBeNull();
    expect(moveWithinSection([], 'nassau', 'down')).toBeNull();
  });

  it('does not change the list it was given', () => {
    const input = [...group];
    moveWithinSection(input, 'best_ball', 'down');
    expect(input).toEqual(group);
  });
});
