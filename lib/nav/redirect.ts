import { redirect as nextRedirect } from 'next/navigation';

/**
 * `redirect` for server-handlinger som bruker rå stier (#2746). I en
 * server-handling legger Next-ens egen `redirect` en ny side i historikken, så
 * nettleserens tilbake ga skjemaet du nettopp sendte (regel 3 i
 * `docs/user-flows.md` §Tilbake). Her er `'replace'` standard, som i
 * `i18n/navigation.ts`. En testskanner i `i18n/navigation.test.ts` passer på at
 * ingen server-handling henter den fra `next/navigation`.
 */
export function redirect(url: string, type: 'replace' | 'push' = 'replace'): never {
  return nextRedirect(url, type as Parameters<typeof nextRedirect>[1]);
}
