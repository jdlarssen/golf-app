# Evaluation: 1264 teknisk SEO-pakke — runde 1

## Verdict: ACCEPT

## Criteria

1. **Anonym GET til /spillformater og /spillformater/scramble → 200, server-rendret innhold.** PASS — `curl` uten cookies: begge 200, HTML inneholder `<title>Spillformater – Tørny</title>` / `<title>Spillformat – Tørny</title>` og fullt server-rendret markup (ikke login-redirect). `proxy.ts`-diffen legger kun `spillformater` inn i `PUBLIC_PATH_PATTERN`-alternasjonen, ingen andre logikk-endringer.

2. **`/sitemap.xml` komplett med hreflang no/en/x-default.** PASS — 34 `<loc>`-entries, alle `https://tornygolf.no`-prefiks; 22 `/spillformater/<slug>`-URL-er (≥20, matcher `MODE_LABELS`-antallet — `app/sitemap.test.ts` bekrefter via `it.each(Object.keys(MODE_LABELS))`); `/demo`, `/finn-turneringer`, `/legal/privacy`, `/baner` + banesider til stede; alle 34 entries har `hreflang="no"`, `"en"` og `"x-default"`. `npx vitest run app/sitemap.test.ts` → 25/25 grønt.

3. **Rendret `<head>` med canonical/description/og:image, ingen «– Tørny – Tørny».** PASS — head-curl av `/spillformater`, `/demo`, `/login`, `/baner/bodoe-golfpark` viser alle korrekt `<link rel="canonical" href="https://tornygolf.no/...">` (apex, riktig sti), unik `<meta name="description">` per side, og `<meta property="og:image" content="https://tornygolf.no/no/opengraph-image?...">`. Grep av `messages/*.json` finner ingen gjenværende `– Tørny"`-suffiks i noen metaTitle-nøkkel. `/en/spillformater` canonical peker riktig på `https://tornygolf.no/en/spillformater` (ikke norsk variant) — edge-case bekreftet.

4. **/login og /spectate/[token] noindex; signup beholder eget OG-bilde.** PASS — `/login`-head har `<meta name="robots" content="noindex, nofollow">`. Spectate-siden har `generateMetadata()` som ubetinget returnerer `robots: { index: false, follow: false }` uavhengig av token-gyldighet (kode lest direkte, siden jeg ikke har gyldig token) — bekreftet også via curl mot en falsk token (viser noindex, kombinert med Next sin egen automatiske notFound-noindex). `app/[locale]/signup/[shortId]/opengraph-image.tsx` er IKKE i `da1e22be --stat`-listen — urørt, siste endring er en tidligere commit (35d0c47c).

5. **`npm run build` grønt; co-located tester grønne; ingen nye lint-feil.** PASS (delvis indirekte) — build fantes allerede ferdigbygd per oppdrag (ikke bygget på nytt); serveren startet og serverte fra `.next` uten feil, som indirekte bekrefter et gyldig build. `npx vitest run app/sitemap.test.ts` → 25/25. `npm run lint` → 0 errors, 54 warnings (alle pre-eksisterende complexity-warnings i filer commiten ikke rører — ingen av de 15 endrede/nye filene dukker opp i lint-output).

## Findings

Ingen brudd som blokkerer ACCEPT. Én observasjon (ikke en kontraktsdefekt i denne commiten):

- **fil:** `app/[locale]/spillformater/[slug]/page.tsx` (og identisk, pre-eksisterende mønster i `app/[locale]/baner/[slug]/page.tsx`)
- **kriterium:** Edge case «Ugyldig format-slug: `/spillformater/tullball` skal fortsatt gi 404»
- **observasjon:** `curl` mot `/spillformater/tullball` gir HTTP 200 (ikke 404), med `x-nextjs-postponed: 1`-header. Årsak: cacheComponents/PPR sender en statisk 200-shell FØR den postponed/dynamiske delen (som kaller `notFound()`) er resolvet — HTTP-statuskoden kan ikke endres etter at den er sendt. Dette er IKKE en regresjon fra denne commiten: samme test mot en pre-eksisterende, urørt side (`/baner/nonexistent-course-xyz-123`) gir identisk 200+postponed-oppførsel. `notFound()`-kallet i koden er uendret og fungerer korrekt for klient-side navigasjon/hydrering; det er kun en rå `curl`/crawler-forespørsel mot en dynamisk 404 under PPR som ser 200. Kontraktens «Out of Scope» ekskluderer eksplisitt «Proxy-404-manifest / not-found-håndtering utover noindex på login», og dette er nøyaktig den systemiske PPR/notFound-kvirken en slik manifest-fiks ville adressert. Vurderes IKKE som et brudd på #1264 — men verdt en egen issue hvis site-wide crawler-indeksering av ugyldige slugs blir et reelt SEO-problem (Google respekterer typisk `notFound()`s klient-side oppførsel dårlig når crawleren ikke kjører JS mot en 200-status). Ingen egen issue opprettet per instruks («IKKE fiks noe selv»).

## Gates

| Kommando | Resultat |
|---|---|
| `source ~/.nvm/nvm.sh && nvm use 22` | Node v22.23.0 |
| `npx vitest run app/sitemap.test.ts` | 25/25 PASS |
| `npx next start -p 3999` (mot eksisterende `.next`-build) | Startet OK, serverte alle ruter |
| `curl` (uten cookies) `/spillformater`, `/spillformater/scramble` | 200, server-rendret |
| `curl` `/spillformater/tullball` | 200 (postponed-shell — se Findings; `notFound()` uendret i koden) |
| `curl /sitemap.xml` | 34 URL-er, alle https://tornygolf.no, 22 spillformater-slugs, hreflang no/en/x-default × 34 |
| head-curl `/spillformater`, `/demo`, `/login`, `/baner/bodoe-golfpark` | canonical + unik description + og:image til stede; ingen «– Tørny – Tørny» |
| head-curl `/en/spillformater` | canonical → `https://tornygolf.no/en/spillformater` |
| kildekode-lesning `spectate/[token]/page.tsx` | `generateMetadata` ubetinget `robots: {index:false, follow:false}` |
| `git show da1e22be --stat` | `signup/[shortId]/opengraph-image.tsx` IKKE listet — urørt |
| `npm run lint` | 0 errors, 54 pre-eksisterende warnings (ingen i endrede filer) |
| grep `export const runtime` i endrede/nye `.tsx`-filer | Ingen treff |
| grep `– Tørny"` i `messages/*.json` | Ingen treff |
| Node-script: nøkkelparitet `messages/no.json` vs `en.json` | Identisk (3959 nøkler hver, 0 avvik) |
| `git show da1e22be -- proxy.ts` | Kun `PUBLIC_PATH_PATTERN` + kommentar endret |
| `git show da1e22be --stat --name-only` | Ingen treff på `robots.ts`, `app/[locale]/page.tsx` (forside), eller spectate-branding utover metadata-eksporten |
