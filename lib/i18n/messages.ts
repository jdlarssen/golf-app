import { routing, type AppLocale } from '@/i18n/routing';
// The default catalog is imported statically, and only here: a dynamic
// import() never settles inside Vitest's fake clock, which hung the mail
// tempo tests (lib/mail/__tests__/resend-contract.test.ts). Change this import
// if `routing.defaultLocale` changes — messages.test.ts fails until you do.
import defaultCatalog from '../../messages/no.json';

/** The catalog shape — the default-locale catalog is the canonical structure. */
export type Catalog = typeof defaultCatalog;
type AnyRecord = Record<string, unknown>;

/**
 * Catalog fallback: merge the requested locale ON TOP of the default-locale
 * catalog, so a key missing in e.g. `en` renders the `no` string — never the
 * raw key. (next-intl's documented fallback mechanism is exactly this merge.)
 */
export function mergeMessages(base: AnyRecord, overlay: AnyRecord): AnyRecord {
  const out: AnyRecord = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = mergeMessages(existing as AnyRecord, value as AnyRecord);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function importCatalog(locale: AppLocale): Promise<AnyRecord> {
  return (await import(`../../messages/${locale}.json`)).default as AnyRecord;
}

/**
 * The merged catalog for a locale — the one home for loading messages
 * (`i18n/request.ts`, mail, `app/global-not-found.tsx`). Other locales are
 * loaded by dynamic import, so a new `messages/<code>.json` is picked up with
 * no edit here (the N-locale rule in `i18n/routing.ts`). A locale whose catalog
 * file is missing gets the default catalog, never a raw key.
 */
export async function loadMessages(locale: AppLocale): Promise<Catalog> {
  if (locale === routing.defaultLocale) return defaultCatalog;
  try {
    return mergeMessages(defaultCatalog, await importCatalog(locale)) as Catalog;
  } catch {
    return defaultCatalog;
  }
}
