// Client-safe: Format-styring (#2347) and its server action share these, so the
// optimistic view and the write agree on the order step 2 shows.
import type { FormatWithMappings, MappingIntent } from './types';

type Step2Sortable = { slug: string; is_primary: boolean; sort_order: number };

/**
 * The order of step 2: primary first, then `sort_order`, then slug. The same
 * keys as the `.order(...)` chain in `getFormatsForIntent`, whose test locks
 * the two together.
 */
export function compareStep2(a: Step2Sortable, b: Step2Sortable): number {
  if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export type Step2Sections = {
  /** «Vanligst»: active, visible and starred, in step-2 order. */
  primary: FormatWithMappings[];
  /** «Flere muligheter»: active and visible, no star. */
  secondary: FormatWithMappings[];
  /** Active, but not in step 2: `is_visible` off or no mapping row. By slug. */
  hidden: FormatWithMappings[];
  /** `is_active` off: in no intent's step 2. By slug. */
  inactive: FormatWithMappings[];
};

/**
 * Splits the catalogue into the groups Format-styring shows for one intent.
 * `primary` followed by `secondary` is exactly `getFormatsForIntent(intent)`.
 */
export function step2Sections(
  formats: FormatWithMappings[],
  intent: MappingIntent,
): Step2Sections {
  const shown: Array<{ format: FormatWithMappings } & Step2Sortable> = [];
  const hidden: FormatWithMappings[] = [];
  const inactive: FormatWithMappings[] = [];
  for (const f of formats) {
    const mapping = f.mappings[intent];
    if (!f.is_active) inactive.push(f);
    else if (mapping?.is_visible) {
      shown.push({ format: f, slug: f.slug, is_primary: mapping.is_primary, sort_order: mapping.sort_order });
    } else hidden.push(f);
  }
  shown.sort(compareStep2);
  const bySlug = (a: FormatWithMappings, b: FormatWithMappings) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  return {
    primary: shown.filter((s) => s.is_primary).map((s) => s.format),
    secondary: shown.filter((s) => !s.is_primary).map((s) => s.format),
    hidden: hidden.sort(bySlug),
    inactive: inactive.sort(bySlug),
  };
}

/** The `sort_order` a group's format at `index` gets after a move. */
export function step2SortOrder(index: number): number {
  return (index + 1) * 10;
}

/**
 * Moves `slug` one place within its group. Null when it is already at that
 * edge or not in the group. Number the result with `step2SortOrder`, so the
 * first move clears every equal `sort_order` in the group.
 */
export function moveWithinSection(
  slugs: readonly string[],
  slug: string,
  direction: 'up' | 'down',
): { slugs: string[]; from: number; to: number } | null {
  const from = slugs.indexOf(slug);
  if (from === -1) return null;
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= slugs.length) return null;
  const next = [...slugs];
  next[from] = slugs[to]!;
  next[to] = slug;
  return { slugs: next, from, to };
}
