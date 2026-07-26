/**
 * #1329 (del 2 av #1286): ekte 404 for ukjente `/baner/<slug>`-stier.
 *
 * Til forskjell fra spillformat-slugs (en statisk TS-konstant,
 * `proxy.ts`'s `VALID_SPILLFORMAT_SLUGS`) er bane-slugs DB-drevne — det
 * gyldige settet endrer seg hver gang en bane opprettes/publiseres. `proxy.ts`
 * kjører på Node.js-runtimen (Next 16-default, `proxy.md` §Runtime), men
 * Next sin egen anbefaling gjelder uansett: «Proxy is meant to be invoked
 * separately of your render code ... you should not attempt relying on
 * shared modules or globals» og «Keep proxy checks fast, and avoid fetching
 * full content there» (`proxy.md:19`, `loading.md:115`). Derfor importerer
 * proxyen ALDRI `'use cache'`-DB-hjelperen (`listPublicCourseSlugs`) direkte
 * — den henter et lite manifest fra `/api/public-course-slugs` (som pakker
 * inn den hjelperen) og holder resultatet i en modul-lokal, TTL'd cache.
 *
 * Design (kontraktens retning 1+3, jf. triage-notatet for #1329):
 *   - Cache-treff (slug finnes i et fortsatt ferskt cachet sett) → ingen
 *     fetch, rask sti.
 *   - Cache-bom (slug mangler, ELLER cachen er utløpt/tom) → fersk fetch
 *     før 404 erklæres — MEN en bom stoler på et manifest som er yngre enn
 *     `missTtlMs` (negativ cache). Uten det vinduet koster hver ukjent slug
 *     (en angriper-styrt sti) én manifest-fetch per request; med det er
 *     forsterkningen begrenset til maks én fetch per vindu. Prisen: en bane
 *     publisert akkurat i vinduet kan få 404 i inntil `missTtlMs` — kort og
 *     selvhelende. Samtidige bom koalesceres til ÉN fetch (delt promise).
 *   - Fetch-feil (nettverksfeil, ikke-2xx, timeout, ugyldig body) → FAIL
 *     OPEN: en manifest-fetch-feil skal ALDRI blokkere en ekte besøkende.
 *     En sjelden soft-404 for en crawler som treffer en reelt ukjent slug
 *     er akseptert; å hard-404e en gyldig bane er det ikke.
 *   - En slug som siden er avpublisert fortsetter å slippe gjennom til
 *     cache-oppføringen utløper (TTL) — akseptert crawler-eventualitet,
 *     samme avveining som resten av #1286-familien gjør for stale-innhold.
 */

export type SlugManifestFetcher = (origin: string) => Promise<string[]>;

type CacheEntry = { slugs: Set<string>; fetchedAt: number };

export type SlugGuard = {
  /** True iff requesten skal besvares med 404. */
  shouldBlock(slug: string, origin: string): Promise<boolean>;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MISS_TTL_MS = 5 * 1000;

/**
 * Fabrikk framfor modul-singleton med skjult state gir testene et rent
 * cache-liv per test (ingen delt mutable state mellom `it`-blokker) — selve
 * bruken i `proxy.ts` er via `courseSlugGuard` nederst i fila.
 */
export function createSlugGuard(options: {
  fetchSlugs: SlugManifestFetcher;
  ttlMs?: number;
  /** Hvor lenge en BOM kan stole på cachen (negativ cache). Klampes til ttlMs. */
  missTtlMs?: number;
  now?: () => number;
}): SlugGuard {
  const {
    fetchSlugs,
    ttlMs = DEFAULT_TTL_MS,
    missTtlMs = DEFAULT_MISS_TTL_MS,
    now = Date.now,
  } = options;
  // missTtl > ttl ville latt en bom stole på et manifest som treff-stien
  // allerede regner som utløpt — klamp så feilkonfigurasjon ikke kan skru av
  // avpubliserings-oppdagelsen.
  const missTtl = Math.min(missTtlMs, ttlMs);
  let cache: CacheEntry | null = null;
  let inflight: Promise<string[]> | null = null;

  return {
    async shouldBlock(slug, origin) {
      if (cache !== null) {
        const age = now() - cache.fetchedAt;
        if (age < ttlMs && cache.slugs.has(slug)) {
          return false;
        }
        // Negativ cache: en bom trenger et NYLIG manifest, ikke et splitter
        // nytt — ellers utløser hver ukjente slug én fetch per request.
        if (age < missTtl) {
          return !cache.slugs.has(slug);
        }
      }

      let slugs: string[];
      try {
        // Koalesér samtidige bom til én fetch: alle ventende requests deler
        // samme promise istedenfor å starte hver sin manifest-hent.
        inflight ??= fetchSlugs(origin).finally(() => {
          inflight = null;
        });
        slugs = await inflight;
      } catch (err) {
        // Fail open + logg (samme konvensjon som Resend-helperne i lib/mail/):
        // en stille degradering ville gjeninnført soft-404-buggen (#1329) uten
        // spor i Vercel-loggene. Bevisst urørt `cache` her: behold det vi
        // hadde (eller forbli tom) så NESTE request prøver på nytt istedenfor
        // å cache en feil som et (falskt) tomt/manglende manifest.
        console.error('[slugGuard] manifest-fetch feilet — failer åpent:', err);
        return false;
      }

      cache = { slugs: new Set(slugs), fetchedAt: now() };
      return !cache.slugs.has(slug);
    },
  };
}

const MANIFEST_PATH = '/api/public-course-slugs';
const FETCH_TIMEOUT_MS = 1500;

/** Default-fetcher: treffer vårt eget interne manifest-endepunkt. */
export async function fetchPublicCourseSlugManifest(
  origin: string,
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${MANIFEST_PATH}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      // Konsumér/avbryt body-en før throw — en uleset undici-body holder
      // connectionen ute av poolen til GC-en tar den.
      void res.body?.cancel().catch(() => {});
      throw new Error(`${MANIFEST_PATH} svarte ${res.status}`);
    }
    const body = (await res.json()) as { slugs?: unknown };
    if (
      !Array.isArray(body.slugs) ||
      !body.slugs.every((s): s is string => typeof s === 'string')
    ) {
      throw new Error(`${MANIFEST_PATH} returnerte et ugyldig manifest`);
    }
    return body.slugs;
  } finally {
    clearTimeout(timeout);
  }
}

/** Singleton-guarden `proxy.ts` kaller for hver `/baner/<slug>`-request. */
export const courseSlugGuard = createSlugGuard({
  fetchSlugs: fetchPublicCourseSlugManifest,
});
