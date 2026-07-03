# Spec: Offentlige banesider som Google finner (#1023)

**Issue:** [#1023](https://github.com/jdlarssen/golf-app/issues/1023) — del 2 av 3 i epic [#1021](https://github.com/jdlarssen/golf-app/issues/1021) «Vindu ut»
**Branch:** `claude/1023-offentlige-banesider`
**Type:** `feat` · area:courses → MINOR-bump + Funksjoner-rad
**Gray areas:** avgjort av Claude mot kodebasen/prod-skjemaet (autonom kjøring); issue-ets egne anbefalinger fulgt der de fantes.

## Problem

Golfere googler slope/rating/lengde på norske baner daglig; ingen norsk aktør eier søkene. Appen har dataene allerede (4 komplette, admin-kuraterte baner i prod), men alt ligger bak innloggingen. Offentlige, statisk genererte banesider gir varig gratis inngangstrafikk (NomadList-playbooken), og «Arranger runde her» kobler trafikken rett inn i opprett-flyten. SEO har måneders indekserings-lag — jo før ute, jo før compounder det.

## Research Findings (verifisert, ikke antatt)

- **RLS er allerede world-read:** `courses`/`course_holes`/`tee_boxes` har `SELECT using (true)` for public — verifisert live mot prod `pg_policies` 2026-07-03 OG i kilden (`supabase/migrations/0002:53–63`). Skriving er authenticated/admin-gatet. Ingen RLS-endring trengs; offentlige sider leser med anon-klient.
- **Prod-data:** 4 baner (Stiklestad, Byneset North, Stjørdal, Trondheim GK), ALLE admin-opprettede (`created_by` → `users.is_admin=true`), alle 18 hull + 3–4 raterte tees, 0 arkiverte tees, 0 navnekollisjoner.
- **Skjema-korreksjon mot issue-teksten:** per-HULL-lengder finnes IKKE i datamodellen. `course_holes` = par per kjønn + stroke_index; `tee_boxes` = totallengde + slope/CR/par_total per kjønn. Hulltabellen viser par/indeks; lengde/slope/CR vises per tee-boks.
- **Ingen NGF-markør finnes** (`courses` = id/name/created_by/updated_by/timestamps; NGF-import er kun research, `docs/research/56-norske-baner-bulk-import.md`). «NGF-importerte baner» i issuet ≈ admin-kuraterte baner i praksis.
- **Ingen slug-kolonne, ingen slugify-util, ingen sitemap.ts/robots.ts** finnes i repoet i dag.
- **Public-route-presedens (#1022):** `proxy.ts:22–49` `PUBLIC_PATH_PATTERN = /^\/(login|register)$|^\/(legal|signup|spectate)(\/|$)/`; uinnlogget → redirect `login?next=<path>`. Metadata via `generateMetadata` + `getTranslations({ locale, namespace })`; OG-image via `opengraph-image.tsx`-filkonvensjon; **`export const runtime` er forbudt under cacheComponents** (kun `npm run build` fanger det).
- **cacheComponents=true** (`next.config.ts:14`); signup-siden bruker PPR uten generateStaticParams. For baner er settet lite og kjent → `generateStaticParams` + `'use cache'`/`cacheLife` gir ekte statisk innhold.
- **Wizard-prefill:** `InitialValues` (`GameForm.tsx:62–150`) støtter `course_id` alene; `?fra=`-loaderen (`opprett-spill/page.tsx:71–161`) er presedens for searchParam→server-fetch→initialValues. Ingen `?bane=`-param finnes — lages her.
- **Redirect-presedens** for fremtidige slug-endringer: `next.config.ts:27–39` (spillformer→spillformater).

## Design

### DB: slug-kolonne (migrasjon, staging→verifiser→prod FØR merge/deploy)

- `alter table courses add column slug text unique` + backfill fra `name`: lowercase, æ→ae/ø→oe/å→aa, ikke-alfanumerisk→bindestrek, trim/collapse.
- `BEFORE INSERT`-trigger: sett slug fra name hvis NULL (kollisjon → `-2`/`-3`-suffiks). Én regel, ett hjem — dekker admin-UI, bruker-flyt (0070) og fremtidig NGF-import uten å røre hver path.
- **Slug er FROSSET ved opprettelse** — rename endrer ALDRI slug (stabil URL uten redirect-maskineri). Fremtidig bevisst slug-bytte = manuell SQL + redirect i `next.config.ts` (presedens finnes).
- Migrasjonsnummer: sjekk `ls supabase/migrations | tail` MOT origin/main før nummerering (memory-felle #543). Additiv og ufarlig for eksisterende kode → påføres staging via Supabase MCP, verifiseres, deretter prod FØR PR-merge (koden som deployes leser kolonnen).
- Samme slugify-logikk i TypeScript (`lib/courses/slug.ts`, ren funksjon, TDD) for preview/tester — DB-triggeren er autoritativ ved insert.

### Offentlige sider (`app/[locale]/baner/`)

- **`/baner`** — indeks: alle kvalifiserte baner som lenkeliste (navn + hulltall + tee-antall), klient-søk er IKKE nødvendig i v1 med 4 baner — enkel semantisk liste (`<ul>`), søk utsatt.
- **`/baner/[slug]`** — per-bane: H1 = banenavn, hulltabell (hull 1–18: par M/D/J + indeks, `tabular-nums`), tee-seksjon (per ikke-arkivert tee: navn, lengde meter, slope/CR/par per kjønn der de finnes), JSON-LD (`schema.org/GolfCourse`, name + evt. url), `generateMetadata` (title/description no+en), `generateStaticParams` over kvalifiserte slugs.
- **Kvalifisert bane** (pure predicate, testes): `created_by` er admin-bruker OG ≥9 hull OG ≥1 ikke-arkivert tee med komplett rating (slope+CR+par_total for minst ett kjønn). Ukvalifisert → utelatt fra indeks/sitemap og `notFound()` på slug (ingen tomme skall). Bruker-opprettede baner eksponeres ikke i v1.
- **Caching:** `'use cache'` + `cacheLife`-profil (dager) på data-hentingen; INGEN revalidateTag-wiring i v1 — banedata endres ~aldri, tidsbasert utløp holder og gir null driftskostnad. Data leses med **anon**-klient (RLS-respekterende; defense in depth — aldri admin-klient på offentlig flate). NB: build-/cache-kontekst har ikke cookies → bruk cookie-fri anon-klient (jf. `getGameWithPlayers`-doktrinen).
- **CTA «Arranger runde her»** → `LinkButton` til `/opprett-spill?bane=<courseId>` — proxyen redirecter uinnlogget til `login?next=…` som i dag.
- **`proxy.ts`:** utvid mønsteret med `baner`: `/^\/(login|register)$|^\/(legal|signup|spectate|baner)(\/|$)/`.
- Copy under nytt namespace `publicCourses.*` (el.l.) i no+en, humanizer-sjekket. Ingen spill-/score-/brukerdata på sidene — kun bane-geometri.

### Sitemap + robots (nye filer)

- `app/sitemap.ts`: forsiden (`/`), `/baner`, alle kvalifiserte `/baner/<slug>` (+ `/en/`-varianter via alternates eller egne entries — enkleste som validerer). Absolutt base `https://tornygolf.no`.
- `app/robots.ts`: allow alt offentlig, `sitemap:`-peker. Begge må overleve `npm run build` under cacheComponents (runtime-export-fella).

### Wizard-prefill (`?bane=`)

- `opprett-spill/page.tsx`: parse med kanonisk `first()`; slå opp banen (id-validering); bygg `InitialValues = { course_id }` (tee/spillere urørt — wizardens egne defaults/gating tar resten); `key` på GameWizard følger eksisterende `?fra=`-mønster (remount-fella). Ugyldig/ukjent id → ignorer param, vanlig tom veiviser. `?fra=` vinner hvis begge er satt (revansje er rikere).

### Flyt + changelog

- `docs/flows/04-opprett-spill-fremtid.svg`: ny offentlig inngangs-kant (Google → baneside → «Arranger runde her» → login-gate → veiviser med bane valgt). Regenerer PNG per `docs/flows/README.md`. Samme PR.
- MINOR-bump + CHANGELOG Funksjoner-rad (tittel + brødtekst + ↳ `/baner`).

## Edge Cases & Guardrails

- **Bane uten rating for et kjønn:** vis kun kjønnene som har komplett rating på den tee-en; aldri «—»-skjelett-rader for hele tabellen.
- **Arkiverte tees:** filtreres bort (samme regel som wizard, `newGameFormData`-presedens).
- **9-hulls bane** (finnes ikke i prod i dag): hulltabellen rendrer radene som finnes; predicate slipper den gjennom.
- **Slug-kollisjon i backfill/trigger:** deterministisk suffiks; unique-constraint er siste skanse.
- **`?bane=` med cup-/liga-/annen støy:** parameteren bygger kun course_id-prefill; alle publish-validatorer kjører uendret; ingen DB-skriving før publish.
- **Ingen lekkasje:** sidene SELECT-er kun `courses`/`course_holes`/`tee_boxes` med anon-klient. Grep-verifiser at ingen games/scores/users-spørringer finnes i `app/[locale]/baner/`.
- **PWA/auth-flater:** `/baner` skal IKKE inn i bunn-nav eller innloggede flater i v1 (egen idé hvis ønsket) — dette er en utside-flate.

## Key Decisions

- **Slug-kolonne + insert-trigger, frossen ved opprettelse** (ikke navne-avledet ved render): stabil SEO-URL uten redirect-maskineri; rename → navn endres, URL består.
- **Admin-opprettet = v1-diskriminator** for «NGF-importert» (ingen NGF-markør finnes i skjemaet; issue-ets intensjon er kuratert kvalitet).
- **Tidsbasert cache (dager), ingen tag-wiring:** banedata er kvasi-statisk; revalidateTag-nett over course-edit-actions er ikke verdt kompleksiteten i v1.
- **Sosial proof («spilt X ganger») DROPPET i v1** per issue-anbefaling — games-tabellen er ikke world-read, og aggregatet krever admin-klient på offentlig flate.
- **Søk på indeksen utsatt** — 4 baner trenger ingen søkeboks; semantisk liste er bedre SEO uansett.
- **Anon-klient, aldri admin-klient** på offentlige sider — RLS som reell authz-lag (AGENTS.md-regel 3).

**Claude's Discretion:** eksakt cacheLife-profil; JSON-LD-feltomfang; hulltabell-markup (én tabell vs seksjonert); sitemap-locale-strategi (alternates vs doble entries); navn på i18n-namespace; om eligibility-predicatet bor i `lib/courses/` eller ved ruta.

## Success Criteria

- [x] **K1:** Staging 2026-07-03, anon curl: `/baner` → 200 med lenke til `byneset-north` (+ `/en/baner` engelsk); `/baner/byneset-north` → 200 med 18 hull-rader (par + indeks, `tabular-nums`), tee-seksjon (Slope 129 / CR 69,7 norsk komma / Par 72, kun komplette kjønn), JSON-LD GolfCourse.
- [x] **K2:** `sitemap.xml` → 200 med `/`, `/baner`, `/baner/byneset-north` + hreflang-alternates; `robots.txt` → 200 med sitemap-peker; `npm run build` exit 0 (281 statiske sider; bane-siden prerendret med cacheLife-dager). Sitemap/robots måtte også unntas i proxy-matcheren (bor utenfor `[locale]` — dokumentert avvik).
- [x] **K3:** Uinnlogget `?bane=` → 307 `login?next=%2Fopprett-spill%3Fbane%3D<id>`; authed → hidden input `course_id value="fb23d113-…"` + initialValues i RSC-payload (banen forhåndsvalgt); ugyldig id → 0 course_id-prefill (kun router-state-ekko av URL-en). Verifisert med mintet e2e-admin-cookie mot staging.
- [x] **K4 (staging-halvdel):** Backfill `byneset-north`; trigger-test: `Bjørnstjerne Bæ & Ålesund GK — Test` → `bjoernstjerne-bae-aalesund-gk-test`, kollisjon → `-2`, rename endret IKKE slug; `default ''` bekreftet overskrevet av trigger. **Prod-halvdel BLOKKERT:** auto-modus-klassifisereren nekter prod-migrasjon uten eksplisitt eier-godkjenning — MÅ kjøres før merge. (NB: kontraktens eksempel-slug «stjordal-golfbane» var feil — ø→oe gir `stjoerdal-golfbane`.)
- [x] **K5:** Lighthouse SEO-score **1.0 (100/100)** på `/baner/byneset-north`, null feilende SEO-audits.
- [x] **K6:** 7 filer / 88 tester grønne (10 slugify, 10 eligibility, 1 HoleTable-render, catalogParity ×2, pre-eksisterende lib/courses); leak-grep: eneste treff i `app/[locale]/baner/` er ren `teeRating`-import — ingen games/scores/users-spørringer. tsc + lint grønne. **Avvik (dokumentert):** `getAdminClient` brukes KUN til `is_admin`-oppslaget (users-RLS blokkerer anon — verifisert live; kontraktens escape-hatch).
- [x] **K7:** proxy-diff = kun `baner` i mønsteret + sitemap/robots-unntak i matcher; bunn-nav urørt; 1.169.0 (MINOR) + Funksjoner-rad med ↳ `/baner`; flyt 04 oppdatert (SVG+PNG, commit fe14d858); alle 8 commits har `Refs #1023`. **Avvik (dokumentert, SEO-trygt):** ukjent slug → 200 + `noindex`-meta + not-found-UI (PPR-streaming committer status før slug-oppslaget; hard 404 ville krevd `dynamicParams=false` som fryser sidesettet per deploy — samme oppførsel som `/signup/[shortId]`).

## Gates

```bash
npx tsc --noEmit
npm run lint
npx vitest run lib/courses app/\[locale\]/baner messages/catalogParity.test.ts
npm run build
# Staging FØR merge: K1 + K3 + K4(staging-delen) + K5
# Prod-migrasjon FØR merge (etter staging-verifisering): K4(prod-delen)
```

## Files Likely Touched

- `supabase/migrations/01XX_course_slugs.sql` — kolonne + backfill + trigger
- `lib/courses/slug.ts` (+test) — TS-slugify (speil av trigger-logikken)
- `lib/courses/publicCourses.ts` (+test) — eligibility + cached data-hentere (anon)
- `app/[locale]/baner/page.tsx` + `app/[locale]/baner/[slug]/page.tsx` (+ evt. hulltabell-komponent m/ test)
- `app/sitemap.ts` + `app/robots.ts` — nye
- `proxy.ts` — public-mønster + `baner`
- `app/[locale]/opprett-spill/page.tsx` — `?bane=`-loader
- `messages/no.json` + `messages/en.json` — nytt namespace
- `docs/flows/04-opprett-spill-fremtid.svg` + `.png`
- `lib/database.types.ts` — regenerert etter prod-migrasjon (`npm run gen:types`)
- `package.json`/`package-lock.json`/`CHANGELOG.md`

## Out of Scope

- NGF-/tredjeparts-bulkimport av baner (#56-research; eget arbeid)
- Søk/filter på `/baner`, kart, bilder, klubbinfo (adresse/kontakt — data finnes ikke)
- Sosial proof («spilt X ganger i Tørny») — krever privacy-trygt aggregat + games-lesing; egen idé
- Redirect-maskineri for slug-endringer (frossen slug gjør det unødvendig i v1)
- Eksponering av bruker-opprettede baner (eierskap/kvalitet — v2-diskusjon)
- `/baner` i bunn-nav eller andre innloggede flater
