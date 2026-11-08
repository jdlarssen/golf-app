/**
 * Stien til «legg til meg»-siden for en venne-kode (#369): ett hjem for
 * nettsidens rute (`app/[locale]/venner/legg-til/[code]`), lista over lenker
 * som åpner appen (`lib/appLinks/appLinkPaths.ts`, #2627) og appens egne lenker
 * (delelenka, QR-koden på bag-taggen og lenka som åpner «Bli venn med …»).
 *
 * Ren og uten importer, så appen kan lese den uten å dra servermoduler inn i
 * bundelen (samme grep som `friendStatus.ts`).
 */
export const FRIEND_LINK_PREFIX = '/venner/legg-til/';

/** «/venner/legg-til/<kode>». */
export function friendLinkPath(code: string): string {
  return `${FRIEND_LINK_PREFIX}${code}`;
}

/**
 * Locale-prefiksene lenka finnes under: `''` for norsk (standardspråket, uten
 * prefiks) og `/en`, slik `i18n/routing.ts` setter dem (`localePrefix:
 * 'as-needed'`). Står her og ikke hentet fra routingen, fordi fila skal være
 * uten importer; `friendLinkPath.test.ts` sjekker at lista dekker
 * `routing.locales`.
 */
export const FRIEND_LINK_LOCALE_PREFIXES = ['', '/en'] as const;
