import { revalidatePath as nextRevalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';

/**
 * Locale-aware drop-in for `revalidatePath`.
 *
 * Routes live under `app/[locale]/`, so the internally cached path for
 * today's URLs is locale-prefixed (`/no/klubber/1`) even though the public
 * URL is unprefixed (`as-needed`). Revalidating only the bare path would
 * silently stop invalidating after the #475 restructure — this hits the bare
 * path plus every locale variant so mutations bust the cache for all locales.
 */
export function revalidatePath(
  path: string,
  type?: 'page' | 'layout',
): void {
  // Preserve exact call arity — passing an explicit `undefined` type changes
  // the observable call shape (and Next may treat the arg differently).
  if (type === undefined) {
    nextRevalidatePath(path);
    for (const locale of routing.locales) {
      nextRevalidatePath(`/${locale}${path}`);
    }
  } else {
    nextRevalidatePath(path, type);
    for (const locale of routing.locales) {
      nextRevalidatePath(`/${locale}${path}`, type);
    }
  }
}
