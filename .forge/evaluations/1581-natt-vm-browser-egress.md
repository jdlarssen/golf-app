# Evaluering: #1581 — Nattkjører-VM, browser-egress

**Verdict: ACCEPT** — alle kriterier som kan verifiseres utenfor natt-VM-en er bevist i denne økten; SC4 og SC7 er ærlige, kontrakt-sanksjonerte hull, ikke overclaims.

Evaluert 2026-08-18 på eierens Mac, branch `claude/forge-auto-1581-7d538d` (5 commits over `origin/main` @ `13c25d41`). Node v22.23.0. Alle kommandoer under er kjørt av evaluator, ikke sitert fra byggerens Bevis-seksjon.

## Per-kriterium

| SC | Status | Bevis (kjørt i denne økten) |
|---|---|---|
| **SC1 — Usatt = uendret** | **PASS** | `npx vitest run playwright.egress` → `Test Files 1 passed (1) / Tests 27 passed (27)`. Uavhengig runtime-probe: `Object.keys(egressFromEnv({}))` → `[]`, `Object.keys(egressFromEnv({HTTPS_PROXY:'',NODE_EXTRA_CA_CERTS:'',NO_PROXY:'',SSL_CERT_FILE:''}))` → `[]`, whitespace-only (`'   '`) → `[]`. Altså ekte nøkkel-fravær, ikke `undefined`-verdier. `git diff origin/main -- playwright.config.ts` = 8 innsettinger / 0 slettinger: 1 import + 6 kommentarlinjer + `...egressFromEnv(process.env)`. Ingen eksisterende `use`-nøkkel (`trace`, `screenshot`, `baseURL`, `locale`, `launchOptions`) rørt. |
| **SC2 — Proxy-speiling** | **PASS** | Testfila dekker alle fire varianter, uppercase-vinner, `HTTP_PROXY`-fallback, userinfo, bypass og ugyldig URL. Assertions er ikke vakuøse: de sammenligner faktiske verdier (`toBe('http://vert:3128')`, `toEqual({...})`) og bruker `not.toHaveProperty` for nøkkel-fravær. Egen probe bekrefter: `http://u%40x:p%2Fw@vert:3128` → `server:'http://vert:3128'`, `username:'u@x'`, `password:'p/w'` (userinfo faktisk strippet ut av `server`). Ugyldig-URL-vakten holder mot realistiske feilinput: `vert:3128` → kaster «HTTPS_PROXY mangler vertsnavn», `10.0.0.1:3128` → kaster, `proxy.internal` → kaster, `file:///etc/passwd` → kaster. `new URL`-fella (`vert:3128` parses som scheme) er altså fanget av `!url.hostname`-vakten, ikke oversett. |
| **SC3 — CA-speiling** | **PASS** | `egressFromEnv({SSL_CERT_FILE:'/x'})` → `{"ignoreHTTPSErrors":true}`; `egressFromEnv({NODE_EXTRA_CA_CERTS:'/x'})` likeså; `egressFromEnv({HTTPS_PROXY:'http://vert:3128'})` har ikke nøkkelen (`not.toHaveProperty` + probe viser kun `proxy`). Tom streng teller som usatt for begge CA-variablene (probe over). |
| **SC4 — Golden-path 31/31 i natt-VM-en** | **GAP (akseptert)** | Ikke kjørt — se punkt 4a. Kontraktens SC4-fallback dekker utfallet eksplisitt. |
| **SC5 — Selvforklarende logg** | **PASS** | Reprodusert av evaluator. Se «Reproduksjon» under. Linjen `[e2e egress] POST https://snwmueecmfqqdurxedxv.supabase.co/rest/v1/rpc/upsert_score_if_newer → net::ERR_PROXY_CONNECTION_FAILED` sto i stdout. |
| **SC6 — Dokumentert for loopen** | **PASS** | `git diff origin/main -- docs/loops/nattkjoreren.md` = 11 linjer lagt til, kulepunkt plassert rett etter `PW_CHROMIUM_EXECUTABLE_PATH`-punktet i Steg 4. Innholdet er korrekt: navngir variablene som faktisk leses, gir `export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`-linja for tilfellet «satt bare for Node», forklarer `ERR_CERT_*` vs `ERR_PROXY_*`-splitten, og gjentar skip-forbudet. Ingen faktafeil funnet mot koden. |
| **SC7 — CI uendret grønn** | **GAP** | Kan ikke verifiseres: branchen er ikke pushet (`git ls-remote origin claude/forge-auto-1581-7d538d` → tomt) og det finnes ingen PR (`gh pr list --head … --state all` → `[]`). Byggeren lot korrekt boksen stå åpen. **Indirekte bevis for at CI ikke kan merke endringen:** `grep -rniE "proxy|ca_cert|cert_file|ca_bundle|NODE_EXTRA" .github/workflows/` → null treff i alle 11 workflow-filer. Ingen proxy-/CA-variabel settes noe sted i CI, så `egressFromEnv(process.env)` returnerer `{}` der. |

## Gates (egne kjøringer)

| Gate | Resultat |
|---|---|
| `npm run typecheck` | exit 0, ingen output fra `tsc --noEmit` |
| `npm run lint` | `✖ 56 problems (0 errors, 56 warnings)` — alle warnings er pre-eksisterende kompleksitets-warnings i `lib/`; filtrert grep på `playwright.egress`/`games.ts`/`golden-path` gir null treff |
| `npx vitest run playwright.egress` | `Test Files 1 passed (1)`, `Tests 27 passed (27)` |
| `npm test` | `Test Files 492 passed (492)`, `Tests 6535 passed (6535)`, exit 0 |
| `npm run build` | `EXIT=0` — kjørt med staging-env sourcet OG uten pipe til `tail`, slik at exit-koden er ekte (repoets kjente «pipe uten pipefail = falsk grønn»-felle unngått) |
| `CI=1 npm run e2e:gate` i natt-VM | ikke kjørt (SC4-gap) |
| Commit-disiplin | se «Disiplin» |

`npx playwright test --grep @gate --list` → `Total: 31 tests in 16 files`. Tallet 31 i SC4 er altså riktig.

## Reproduksjon av byggerens nøkkelbevis (evaluator kjørte begge)

**Rødt (dødt proxy-mål):**
```
set -a && . ./.env.staging.local && set +a
PLAYWRIGHT_PORT=3581 HTTPS_PROXY=http://127.0.0.1:9 npx playwright test e2e/games/scoring-golden-path.spec.ts --grep @gate --reporter=list
```
→ `1 failed`, feilen er `expect(locator).toBeEnabled() failed / Locator: getByTestId('submit-scorecard') / Received: disabled`, med knappen stående på «Lagrer slag …». Loggen inneholdt bl.a.:
```
[e2e egress] POST https://snwmueecmfqqdurxedxv.supabase.co/rest/v1/rpc/upsert_score_if_newer → net::ERR_PROXY_CONNECTION_FAILED
```
Nøyaktig samme feilbilde og samme linje som byggeren rapporterte.

**Grønt (samme kommando uten `HTTPS_PROXY`):** `1 passed (40.6s)`.

Dette beviser tre ting selvstendig: (a) `use.proxy` fra `egressFromEnv` når faktisk Chromium, (b) `bypass` holder localhost-trafikken utenom proxyen (innlogging, sidelastinger og server-actions gikk gjennom i den røde kjøringen), og (c) Node-siden er upåvirket av `HTTPS_PROXY` (seeding og server-actions mot staging virket mens nettleseren var avskåret) — som er nettopp asymmetrien issuet beskriver.

## Verifisert mekanikk byggeren ikke dokumenterte, men som måtte holde

Specen bruker `browser.newContext()` direkte, ikke `context`/`page`-fixturene. Det er ikke åpenbart at `use`-blokka i det hele tatt gjelder da. Verifisert i `node_modules/playwright/lib/index.js:129-133`: `runBeforeCreateBrowserContext` kopierer `_combinedContextOptions` inn i ENHVER context-opprettelse for nøkler som ikke allerede er satt eksplisitt. Så `proxy`/`ignoreHTTPSErrors` treffer også `browser.newContext()`. (Empirisk bekreftet av den røde kjøringen over.)

Videre: browseren launches uten proxy, så proxyen settes per context. Playwright sender den da som `Target.createBrowserContext { proxyServer, proxyBypassList }` (bundlet `crBrowser.ts`), ikke som `--proxy-server`. Kritisk detalj: `shouldProxyLoopback(bypass)` legger til `<-loopback>` (= tving loopback GJENNOM proxyen) hvis bypass-lista ikke nevner en loopback-vert. Fordi `ALWAYS_BYPASS` alltid inneholder `localhost` og `127.0.0.1`, returnerer den `false` og loopback beholder sin implisitte bypass. `ALWAYS_BYPASS` er altså ikke bare pyntelig — den er det som hindrer at appen under test blir tunnelert. Riktig bygget.

## Defekter funnet

**Ingen blokkerende defekter.** To lavgrads observasjoner:

1. `playwright.egress.test.ts:28` — `expect(egressFromEnv(env)).toEqual({})`. Vitests `toEqual` ignorerer `undefined`-verdier, så assertionen ville også passert for `{ proxy: undefined, ignoreHTTPSErrors: undefined }`. Testen låser dermed SC1 litt svakere enn ordlyden («returnerer et tomt objekt») antyder. Faktisk oppførsel er korrekt — jeg verifiserte `Object.keys(...)` → `[]` — og selv en regresjon til `undefined`-verdier ville vært ufarlig (Playwrights `_combinedContextOptions` filtrerer på `!== void 0`, og `doCreateNewContext` gjør `proxyOverride || proxy`). `toStrictEqual` ville lukket hullet gratis. Nit, ikke funn å file.
2. `playwright.egress.ts:109-111` og `docs/loops/nattkjoreren.md` — kommentaren sier «Playwright mapper selv ledende `.` til `*.`». Det stemmer kun for launch-arg-veien (`_innerDefaultArgs` gjør `.foo` → `*.foo`); på context-veien sendes `bypass` rå videre til Chromium. Jeg testet konsekvensen direkte med Playwright mot dødt proxy-mål: bypass `localhost,127.0.0.1,.supabase.co` → `REACHED, status 401` (bypass virket), `*.supabase.co` → samme, `localhost,127.0.0.1` alene → `net::ERR_PROXY_CONNECTION_FAILED`. Ledende punktum oppfører seg altså nøyaktig som dokumentert; det er Chromiums egen bypass-parser som gjør remappingen, ikke Playwright. Ren attribusjons-unøyaktighet i en kommentar, null funksjonell konsekvens.

Aktivt lett etter, IKKE funnet: query-/header-/body-lekkasje i loggeren (den bygger `url.origin + url.pathname`; alle 6 loggede linjer i den røde kjøringen var uten `?`), duplisert `localhost` i bypass (dedup verifisert), manglende trimming, `ALWAYS_BYPASS`-mutasjon (kopieres med spread).

## 4a — Er SC4-gapet ærlig eller en bortforklaring?

**Ærlig, og kontrakt-sanksjonert.** SC4 har en eksplisitt fallback: «Bygges dette i en interaktiv økt utenfor natt-miljøet, er SC4 et eksplisitt `VERIFICATION GAP:` i PR-en og PR-en får `needs-manual-qa`». Kontrakten er skrevet av en økt som selv slo fast at miljøet ikke lar seg reprodusere fra Mac. Byggeren har merket boksen åpen, skrevet et eget `### SC4 — VERIFICATION GAP`-avsnitt, og — viktigst — ikke kompensert med `test.skip` eller et miljøflagg, som var den forbudte snarveien. Det er I3-oppførsel etter boka.

To ting eieren likevel må vite:
- **Steg 1 (fange `net::`-navnet i VM-en før kuren) ble aldri kjørt.** Kontrakten sier at Steg 1 gjøres FØRST i natt-VM-en. Konsekvensen er reell: vi vet ikke hvilke variabler VM-en faktisk setter. Setter den ingen av `HTTPS_PROXY`/`https_proxy`/`HTTP_PROXY`/`http_proxy`/`NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` — f.eks. fordi egressen er ordnet med transparent ruting eller Node-spesifikk konfigurasjon — returnerer `egressFromEnv` `{}` og kuren er en no-op der. Kontraktens Steg 2 sier riktignok eksplisitt «bygg begge halvdelene uansett H1/H2», og loggeren fra Steg 3 er nettopp det som gjør neste natt-kjøring selvforklarende, så rekkefølgen er forsvarlig — men restrisikoen «kuren fyrer ikke i VM-en» er ikke null, og det er SC4 som lukker den.
- **`needs-manual-qa`-labelen er ikke satt, fordi PR-en ikke finnes ennå.** Gapet er bokført i kontraktfila, ikke i en PR. Det er et utestående handlingspunkt ved PR-opprettelse, ikke en mangel ved koden.

## 4b — Bør `net::ERR_ABORTED` filtreres bort?

**Byggerens valg er riktig — ikke filtrer.** Jeg så støyen selv: den grønne kontroll-kjøringen skrev én linje, `[e2e egress] HEAD …/rest/v1/notifications → net::ERR_ABORTED`, ved side-nedrigging. Én linje på en grønn kjøring er en billig pris.

Argumentet for å beholde den er sterkere enn kosmetikken: verktøyet finnes utelukkende for å navngi `net::`-koder i et miljø ingen kan feilsøke interaktivt. En filterliste er en gjetning på hvilke koder som er uinteressante, skrevet av en økt som aldri har sett VM-en innenfra — og `ERR_ABORTED` er ikke entydig støy: en request som avbrytes av en proxy- eller CA-feil midt i strømmen kan også lande der. Å skjule den ville gjenskapt akkurat feilmodusen issuet handler om (rødt uten forklaring), bare med et smalere hull. Linja er dessuten selv-annoterende: den navngir requesten, så en leser ser umiddelbart at det er en notifikasjons-HEAD ved nedrigging og ikke score-upserten.

Om støyen senere blir plagsom, er den riktige strammingen å logge bare ved test-failure — ikke å svartliste koder.

## Disiplin

- **Atomiske commits, riktig rekkefølge:** `5d2fc040` kontrakt → `43795434` kuren (`fix(e2e)`, 3 filer: config + modul + test) → `793967c9` loggeren (`test(e2e)`, 2 filer) → `b9d2dd08` docs → `7c8f651a` bevis. Ett logisk fokus per commit.
- **`Refs #1581` i body på alle 5.** ✔
- **`[no-changelog]` på begge de bruker-usynlige commitene** (`fix(e2e)`, `test(e2e)`). ✔ Ingen `.changes/`-notat lagt til (`git diff --name-only … -- .changes/` tomt) — korrekt, dette er ren testrigg-infra uten bruker-synlig effekt.
- **Ingenting utilbørlig committet:** ingen env-filer, ingen `test-results/`, ingen `playwright-report/`. `git status --porcelain` er tomt. Diffen er 7 filer / 690 innsettinger / 0 slettinger.
- **Out of Scope respektert:** `git diff --name-only origin/main..HEAD | grep -vE "^(playwright|e2e/|docs/|\.forge/)"` → tomt. Ingen app-kode, ingen `.github/workflows/`, ingen migrasjoner, ingen `webServer`-/trace-endring. Ingen `test.skip`/`test.fixme` lagt til (de tre treffene i diffen er kontrakt-prosa som forbyr dem). Loggeren er ikke rullet ut til andre specer — `logEgressFailures` kalles kun i `scoring-golden-path.spec.ts`, på `playerPage` (:58) og `adminPage` (:117), begge rett etter opprettelse. ✔

## Hva byggeren overså

Ingenting som blokkerer merge. Restpunkter, i synkende viktighet:

1. **Kuren kan være en no-op i VM-en** hvis miljøet ikke bruker de konvensjonelle variabelnavnene — se 4a. Første natt-kjøring avgjør. Loggeren er bygget nettopp for å gjøre det avlesbart, så neste natt gir enten 31/31 eller et `net::`-navn å eskalere med. Ingen tredje-kur-på-håp (I5) er nødvendig før den avlesningen finnes.
2. **`ignoreHTTPSErrors` gjelder alle contexts i VM-en, ikke bare golden-path.** Kontrakten aksepterer det eksplisitt (riggen snakker kun med localhost uten TLS + staging-Supabase), og det er utvilsomt riktig avveining for en testrigg — men det er verdt å ha registrert at e2e i det miljøet ikke lenger ville fanget et ekte sertifikatbrudd på staging. Ingen handling nå; hører hjemme i det eventuelle SPKI-oppstrammings-issuet kontrakten allerede parkerte.
3. **PR-en mangler.** Ved opprettelse: `needs-manual-qa`-label + `VERIFICATION GAP:`-formuleringen for SC4 i PR-teksten, per SC4-fallbacken. SC7 kan først krysses av når `gh pr checks` er grønn.
4. **`http://:secret@vert:3128`** (passord uten brukernavn) gir `{password:'secret'}` uten `username`. Urealistisk input, og Playwright ville uansett bare ignorert det. Nevnt for fullstendighet, ikke verdt en fiks.
