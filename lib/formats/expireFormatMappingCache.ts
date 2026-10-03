import { revalidateTag } from 'next/cache';

/**
 * The one home for "a change in Format-styring reaches the wizard at once"
 * (#2336). It expires the tag `getFormatsForIntent` caches under.
 *
 * - `revalidateTag(tag, 'max')` is stale-while-revalidate: the first reader
 *   after the write still gets the old format list.
 * - `updateTag(tag)` expires at once but throws outside Server Actions.
 * - `revalidateTag(tag, { expire: 0 })` expires at once and works in both.
 *
 * `lib/games/expireGameCache.test.ts` fails when this tag is revalidated
 * anywhere else.
 */
export function expireFormatMappingCache(): void {
  revalidateTag('format-mapping', { expire: 0 });
}
