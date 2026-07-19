# Kontrakt: Serv /.well-known/-filene forbi auth-proxyen på begge verter (#1277)

## Problem

TWA-en (#1279) krever `/.well-known/assetlinks.json` og iOS-universal-links (#1283) krever `/.well-known/apple-app-site-association` — begge må svare **200 med `application/json`, uten redirect, på både apex og www**. I dag feiler begge på begge verter, men **på motsatt måte av det issue-teksten beskriver**:

**Live-verifisert 2026-07-19 21:36 UTC** (issue-teksten fra 17.07 er utdatert — domene-primærverten er byttet i mellomtiden):

- `https://tornygolf.no/.well-known/assetlinks.json` → **307 → /login?next=…** (auth-proxyen fanger stien; apex er nå primærvert og server appen)
- `https://www.tornygolf.no/.well-known/assetlinks.json` → **308 → https://tornygolf.no/…** (Vercel-domenenivå-redirect, FØR appen — responsen mangler appens `content-security-policy`-header, som beviser at den aldri traff appen)

Apples CDN og Googles verifisering følger ikke redirects for disse filene. Begge feilmodusene må bort.

## Research-funn (verifisert i økten)

- `proxy.ts:198-200` — matcheren ekskluderer `_next/static|_next/image|api/|sw\.js|manifest\.webmanifest|sitemap\.xml|robots\.txt|icon|icon0|apple-icon|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$`. **`.well-known` er IKKE ekskludert** og matcher heller ikke `PUBLIC_PATH_PATTERN` (`proxy.ts:25-26`) → auth-redirect.
- `sitemap.xml`/`robots.txt`-unntakene i matcheren (kommentarblokk `proxy.ts:184-197`) er presedensen: ruter utenfor `app/[locale]/` må unntas i MATCHEREN (ikke PUBLIC-mønsteret), ellers 404-er i18n-rewriten dem. Samme gjelder `.well-known/`.
- Ingen host-redirect finnes i repoet (`vercel.json` har kun `crons`; `next.config.ts` sin `redirects()` har kun spillformer→spillformater) → www→apex-308-en ligger i **Vercel-dashboardets domeneoppsett** og kan ikke path-unntas der. Skal www svare 200 på `.well-known/`, må redirecten flyttes inn i appen.
- `public/.well-known/` finnes ikke; ingen eksisterende well-known-håndtering noe sted.
- AASA serveres uten filendelse → statisk fil i `public/` ville fått feil Content-Type. Route handlers gir eksplisitt kontroll.
- `lib/mail/i18n.ts:94`: `APP_BASE_URL = 'https://tornygolf.no'` — mail-lenker bygges mot apex; AASA på apex er altså den kritiske av de to for universal links.

## Design

**1. To route handlers** (nye filer, utenfor `[locale]`):

- `app/.well-known/assetlinks.json/route.ts` — GET returnerer placeholder-innhold med gyldig form:
  ```json
  [{"relation": ["delegate_permission/common.handle_all_urls"],
    "target": {"namespace": "android_app", "package_name": "no.tornygolf.app",
               "sha256_cert_fingerprints": ["00:00:…:00"]}}]
  ```
  Kodekommentar: #1279 fyller ekte pakkenavn + SHA-256 fra BÅDE upload-nøkkelen og Googles app-signing-nøkkel (Play Console → App integrity).
- `app/.well-known/apple-app-site-association/route.ts` — GET returnerer
  ```json
  {"applinks": {"apps": [], "details": [{"appIDs": ["TEAMID.no.tornygolf.app"], "components": [{"/": "/*"}]}]}}
  ```
  Kodekommentar: #1283 fyller ekte appID og strammer `components` til deeplink-vokabularet (`lib/notifications/deeplink.ts`).
- Begge: `Content-Type: application/json` eksplisitt + `Cache-Control` (kort, f.eks. `public, max-age=300` — Apples CDN re-fetcher uansett på egen kadens).

**2. Matcher-unntak** i `proxy.ts` config: legg `\.well-known` inn i negative-lookahead-en (samme mekanisme som `sitemap\.xml`), og utvid kommentarblokken 184-197 med én linje om hvorfor (anonym verifisering fra Google/Apple + utenfor `[locale]`).

**3. Host-kanonisering inn i proxy.ts:** øverst i proxy-funksjonen: `host === 'www.tornygolf.no'` → 308 til `https://tornygolf.no${pathname}${search}`. Fordi matcheren ekskluderer `.well-known/` og `api/`, gjelder kanoniseringen automatisk IKKE disse stiene — www server dem direkte (dette reparerer også #1304-eksponeringen for `api/cron/`-stier). Hardkodet host-sammenligning (ikke env) — Vercel-previews (`*.vercel.app`) og localhost berøres ikke.

**4. Eier-steg (Vercel-dashboard, ETTER at PR-en er merget og deployet):**

1. **Hvor:** Vercel → prosjektet → Settings → Domains → raden for `www.tornygolf.no`
2. **Hva:** endre fra «Redirect to tornygolf.no» til å serve produksjonen (ingen redirect). `tørny.no` skal IKKE røres.
3. **Forventet etterpå:** `curl -sI https://www.tornygolf.no/` viser `308` med `location: https://tornygolf.no/` — men nå med appens `content-security-policy`-header i responsen (redirecten kommer fra proxy.ts, ikke Vercel-edgen), og `curl -sI https://www.tornygolf.no/.well-known/assetlinks.json` viser `200`.
4. **Hvis ikke:** ta skjermbilde av Domains-siden og lim inn.

Rekkefølgen gir null vindu uten kanonisering: proxy-redirecten ligger klar (sovende) før dashboard-flippen.

## Kanttilfeller & vakter

- **Lekkasje-sjekk:** unntaket er prefiks-anket i lookahead-en; `curl --path-as-is http://localhost:3000/.well-known/../profile` skal IKKE gi app-innhold (Next normaliserer dot-segmenter før matching — verifiser eksplisitt). `/profile` uinnlogget skal fortsatt 307-e til `/login`.
- **HEAD-requests:** `curl -sI` bruker HEAD — Next auto-håndterer HEAD for GET-handlers; verifiser i kriteriene.
- **Ingen i18n-rewrite** på `.well-known/` (matcher-unntak, ikke PUBLIC_PATH_PATTERN — PUBLIC-grenen kjører `handleI18nRouting`).
- **`tørny.no`** (punycode-apex): beholder Vercel-nivå-redirect, utenfor scope — ingen well-known-krav der.
- Placeholder-verdiene må være gyldig JSON med korrekt form (Google/Apple-parserne skal kunne lese dem uten error, selv om fingerprints er dummy).

## Nøkkelbeslutninger

- **Route handlers, ikke `public/`-statikk** — AASA mangler filendelse (Content-Type-kontroll), og placeholder→ekte-oppdatering blir en ren kodeendring. ASSUMPTION (delegert).
- **Kanonisering flyttes fra Vercel-edge til proxy.ts** — eneste vei til 200 på www for `.well-known/` når domene-redirect ikke kan path-unntas. ASSUMPTION dokumentert; eier-steget er reversibelt i dashboardet.
- **Issue-tekstens domenebilde (apex→www) er utdatert** — kontrakten bygger på live-fakta 19.07 (apex primær). #1279-notatet om «bygg mot www» må re-vurderes i #1279 — noter det i PR-beskrivelsen.
- **Commit:** `feat(native)` + minor-bump + `[no-changelog]` (ikke spiller-synlig plumbing). Refs #1277.

**Claude's discretion:** eksakt Cache-Control-verdi; om placeholder-konstantene bor inline i route-filene eller i en delt `lib/native/wellKnown.ts`; ordlyd i kodekommentarene.

## Suksesskriterier

- [ ] Lokalt (dev-server, uinnlogget): `curl -sI` mot begge `.well-known/`-stiene gir `200` + `content-type: application/json`, både GET og HEAD. **Bevis:** curl-output i PR-kommentar.
- [ ] Lokalt: `curl --path-as-is …/.well-known/../profile` gir ikke app-innhold, og `/profile` uinnlogget 307-er fortsatt til `/login?next=…`. **Bevis:** curl-output.
- [ ] Playwright-spec `e2e/public/well-known.spec.ts` (request-context, ingen login): begge filene 200 + riktig Content-Type + parsebar JSON med forventede toppnøkler. Merkes `@gate` (rask, tilstandsløs — vokter butikk-kritiske filer kontinuerlig). **Bevis:** grønn kjøring.
- [ ] Proxy-koden inneholder host-kanoniseringen med `.well-known`/`api`-immunitet via matcheren (kodegjennomlesing i evaluering).
- [ ] ETTER deploy + eier-steg: curl-matrisen fra issue-kriterium 1–2 (begge filer × begge verter = 200, ingen redirect) — posteres som oppfølgings-kommentar på issuet. Kan ikke verifiseres i natt-bygget → PR merkes `needs-manual-qa` med nøyaktig denne matrisen navngitt.

## Gates

- [ ] `npm run build` + `npm run lint` grønne
- [ ] `npx vitest run` for ev. berørte filer med co-located tester (glob — trolig ingen)
- [ ] Commit-body: `Refs #1277`; PR-body: `Closes #1277` + eier-steget som egen tydelig seksjon

## Filer som trolig berøres

- `proxy.ts` — matcher-unntak + host-kanonisering
- `app/.well-known/assetlinks.json/route.ts` — NY
- `app/.well-known/apple-app-site-association/route.ts` — NY
- `e2e/public/well-known.spec.ts` — NY

## Utenfor scope

- Ekte pakkenavn/fingerprints/appID (→ #1279/#1283)
- `webcredentials`-nøkkel i AASA for passkeys (#63-oppfølging — legges til når RP-config gjøres)
- pg_cron-jobbens www-URL (→ #1304)
- `tørny.no`-domenet
