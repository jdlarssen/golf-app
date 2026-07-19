# Kontrakt: Ugyldige slugs → ekte 404 på offentlige dynamiske sider (#1286)

## Problem

`GET /spillformater/tullball` og `GET /baner/finnes-ikke` svarer HTTP 200: under `cacheComponents`/PPR sendes den statiske shellen (og dermed statuskoden) FØR den dynamiske delen når `notFound()`. Google ser soft-404 for vilkårlige slugs under de to offentlige seksjonene. Sidenes `notFound()`-kode er korrekt — dette er streaming-oppførsel, ikke en side-bug.

## Research-funn (verifisert mot `node_modules/next/dist/docs/`, v16.2.6, i økten)

- **Issue-forslaget virker ikke her:** `dynamicParams.md:22` — «`dynamicParams` is not available when Cache Components is enabled». Repoet har `cacheComponents: true` (`next.config.ts:14`). `generateStaticParams` + `dynamicParams=false`-sporet er dødt.
- **Dokumentert anbefaling for ekte 404 under streaming:** `loading.md:117-124` — «If you need a 404 status … ensure the resource exists before the response body is streamed … You can run this check in `proxy` to rewrite missing slugs to a not-found route, or produce a 404 response … Keep proxy checks fast, and avoid fetching full content there.»
- Spillformater-slugs er statiske og importerbare: `VALID_MODES = Object.keys(MODE_LABELS)` (`app/[locale]/spillformater/[slug]/page.tsx:14-17`; `MODE_LABELS` i `lib/scoring/modes/types.ts:35-58`, 21 verdier, ingen DB).
- Baner-slugs er DB-drevne: `listPublicCourseSlugs()` → `'use cache'` + `cacheLife('days')` + `cacheTag('public-courses')` (`lib/courses/publicCourses.ts:108-138,234-237`) — kvalifisering (admin-skapt + ≥9 hull + komplett rating) avgjøres i spørringen. `proxy.ts` gjør i dag ingen slug-validering.
- Proxyen splitter allerede locale-prefiks (`splitLocalePrefix`, `proxy.ts:56-58`) — guarden opererer på strippet sti og dekker `/en/…` gratis.

## Design

**Del 1 — spillformater (mekanisk):** slug-guard i `proxy.ts`, FØR auth-/i18n-grenene: strippet sti matcher `^/spillformater/([^/]+)$` og sluggen finnes ikke i settet fra `MODE_LABELS` → svar med ekte 404. Mekanisme-valg (builder verifiserer mot `proxy.md` §Producing a response + `loading.md`-sitatet over — obligatorisk lese-steg):
- Foretrukket: rewrite til en dedikert, IKKE-streamet not-found-rute slik at brukeren får den brandede 404-siden OG status 404. Hvis rewrite ikke kan bære 404-status deterministisk: `new NextResponse(<minimal brandet HTML>, { status: 404 })` direkte fra proxyen — statuskoden er kravet, pen side er sekundært (crawlere er hovedpublikum; mennesker treffer sjelden tullball-slugs).
- Importen av `MODE_LABELS` inn i proxy.ts må verifiseres server-safe (ren TS-konstant uten client-avhengigheter — sjekk import-grafen; jf. «use client»-fella).

**Del 2 — baner (research-steg med definert fallback):** samme guard-form, men slug-settet krever DB. Undersøk i rekkefølge, maks én times innsats:
1. Kan proxyen kalle `listPublicCourseSlugs()` (som er `'use cache'`)? Verifiser mot Next-docs om `use cache` i proxy-kontekst + mål latens (kravet fra docs: «keep proxy checks fast»).
2. Hvis nei/tregt: er et statisk-generert slug-manifest (revalidert via eksisterende `cacheTag('public-courses')`-invalidering) gjennomførbart uten ny kompleksitetsklasse?
3. **Hvis ingen av delene er rene: UTSETT baner-delen** — opprett oppfølgings-issue med research-notatet (funn + avveining + anbefaling), lenk det i PR-en, og la denne PR-en levere spillformater-delen alene. Delvis leveranse er eksplisitt akseptert (kø-instruks 19.07); baner-eksponeringen er liten (få lenker, noindex-verdi lav).

## Kanttilfeller & vakter

- **Alle 21 gyldige slugs × begge locales skal fortsatt svare 200** — regresjonssjekken er like viktig som 404-en.
- Ny `GameMode` i fremtiden: guarden leser samme kilde som siden (`MODE_LABELS`) — én hjemme-regel, ingen dobbeltliste (trap 4).
- `/spillformater` (liste, uten slug) og `/spillformater/` med trailing slash berøres ikke av guarden.
- AUTH_OPTIONAL-semantikken for spillformater (anonym visning) endres ikke — guarden ligger FØR og uavhengig av auth-grenen.
- Proxy-guarden må ikke røre andre stier (`/baner/...` uten del 2, `/games/...`, osv.) — regex-anket.
- 404-responsen skal ha `Cache-Control` som ikke cacher aggressivt (nye moduser skal bli synlige uten purge).

## Nøkkelbeslutninger

- **Proxy-validering, ikke dynamicParams** — eneste dokumenterte mekanisme under cacheComponents (research-funnet over). ASSUMPTION: vi aksepterer at proxyen får domenekunnskap om slug-settene; kilden er delt konstant, så drift er umulig.
- **Baner kan utsettes** — eier-besluttet ramme; fallback-kriteriet er definert slik at natt-bygget aldri står fast.
- **Commit:** `fix(seo)` + patch-bump + `[no-changelog]` (crawler-synlig, ikke spiller-synlig). Refs #1286.

**Claude's discretion:** rewrite-target vs direkte respons (innenfor rammen over); guard-plassering i proxy-funksjonen; ev. deling av guard-helper mellom del 1 og del 2.

## Suksesskriterier

- [ ] `curl -s -o /dev/null -w '%{http_code}' localhost:3000/spillformater/tullball` → **404**; samme for `/en/spillformater/tullball`. **Bevis:** curl-output i PR.
- [ ] Loop over alle `MODE_LABELS`-nøkler × {'', '/en'}: alle → **200**. **Bevis:** script-output (42 linjer) i PR.
- [ ] 404-responsen inneholder ikke app-shell-innhold for innloggede (ingen navigasjon/lekkasje) og har fornuftig Cache-Control.
- [ ] Baner: ENTEN samme 404/200-kriterium for `/baner/<ugyldig>` + `/baner/<gyldig fra listPublicCourseSlugs>`, ELLER oppfølgings-issue opprettet med research-notat + lenke i PR-body. Ett av de to må foreligge.
- [ ] E2e: `e2e/public/`-spec (request-context, uinnlogget) asserter 404-status for tullball-slug og 200 for én gyldig — kjøres i samme fil/`@gate`-vurdering som #1277s well-known-spec hvis begge lander (ellers egen liten fil).

## Gates

- [ ] `npm run build` + `npm run lint` grønne; co-located vitest for berørte filer
- [ ] Commit-body `Refs #1286`; PR-body `Closes #1286` — også ved utsatt baner-del: issuet lukkes når spillformater-delen er levert OG baner-avveiningen er dokumentert i eget oppfølgings-issue (avviket nevnes i closing-kommentaren under «Teknisk»)

## Filer som trolig berøres

- `proxy.ts` — slug-guard(er)
- ev. `app/[locale]/spillformater/[slug]/page.tsx` — kommentar om at proxy-guarden eier status-koden
- `e2e/public/*.spec.ts` — statuskode-asserts
- (del 2, hvis den bygges) `lib/courses/publicCourses.ts` — ev. slug-manifest-helper

## Utenfor scope

- Andre dynamiske ruter (`/games/[id]`, `/signup/[shortId]` — auth-/token-gatet, ikke crawler-eksponert på samme måte)
- Sitemap-endringer (#1264 eier sitemap); `not-found.tsx`-design
