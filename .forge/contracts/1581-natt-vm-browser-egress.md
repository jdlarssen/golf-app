# Spec: Nattkjører-VM — la e2e-nettleseren følge Node sitt utgående nett (proxy + privat CA)

**Issue:** #1581 · **Branch (bygg):** `claude/natt-1581-<slug>` (nattkjøreren) eller
`claude/1581-e2e-egress` (interaktiv økt) · **Kontrakt-fil:**
`.forge/contracts/1581-natt-vm-browser-egress.md`.

```json
{ "kontraktKlasse": "teknisk", "funksjonell": "Fikser at nattkjørerens e2e-port meldte «rødt, men forklart» på golden-path-testen hver natt — nettleseren i natt-VM-en får nå samme vei ut på nettet som resten av kjøringen, så porten teller igjen.", "produktvalg": false }
```

Kontrakt skrevet 2026-08-18 i interaktiv økt (skrivebords-diagnose fra Mac — miljøet
lar seg ikke reprodusere her). Kontrakt-linjenumre er mot `origin/main` @ `13c25d41`
— grep før du redigerer. **Ingen produktvalg:** ren test-rigg-/loop-infra-endring uten
bruker-synlig effekt (`[no-changelog]`).

## Problem

I natt-VM-en (cloud-miljø med agent-proxy for utgående HTTPS + privat CA-bundle) feiler
`e2e/games/scoring-golden-path.spec.ts` konsistent under `npm run e2e:gate` — også på
fersk `origin/main` — mens de 30 andre @gate-specene passerer. Symptom i nettleseren:
`TypeError: Failed to fetch` mot staging-Supabase under score-tastingen, offline-banneret
«Mistet nettforbindelsen. N slag venter» (`messages/no.json:5387`), slagene blir liggende
i Dexie-køen, submit-knappen blir aldri enabled (den venter på drenert kø,
`scoring-golden-path.spec.ts:90–95`), og testen timer ut.

Konsekvensen er at nattkjørerens tredje orakel (e2e:gate, `docs/loops/nattkjoreren.md`
Steg 4) står som «30/31 — rød men forklart» hver natt (PR #1579, #1580), og en ekte
regresjon i nettopp score-tasting → lever → godkjenn ville druknet i den forklaringen.

### Skrivebords-diagnose (verifisert mot koden 2026-08-18)

Golden-path-specen er den **eneste** @gate-specen hvis pass-betingelse avhenger av en
HTTPS-request **direkte fra nettleser-konteksten** til `*.supabase.co`:

- `lib/sync/syncWorker.ts:54` — `getBrowserClient().rpc('upsert_score_if_newer', …)`
  kjører i browseren (Chromium), ikke i Node.
- Alle andre `getBrowserClient`-konsumenter er ikke-blokkerende for @gate (realtime-
  websocket i `RealtimeMount.tsx`/`lib/sync/realtimeChannel.ts`, passkey-komponenter,
  `useUnreadNotificationsCount`, sponsor-logo-opplasting, `localDataCleanup`).
- Alle andre @gate-specer (liga-/cup-smoke, signup, auth, public) går via Next-serveren
  (server actions / server components → Node) eller via service-role-klienten i
  test-runneren (Node). Login-hjelperen `signInViaOtp` (`e2e/_helpers/games.ts:195`)
  minter kode i Node og driver et server-action-verify-steg. Nærmeste nabo:
  `e2e/auth/invitation-flow.spec.ts` (@gate) klikker også `+1` (:260), men asserterer
  kun den optimistiske Dexie-skrivingen (:266–269) — passerer uten browser-egress.

Node sitt utgående nett fungerer beviselig i VM-en (30 specer grønne). Nettleserens
gjør det ikke. To kandidat-årsaker, begge gir `TypeError: Failed to fetch` i side-JS:

- **H1 — sertifikat:** Chromium går gjennom proxyen (Chromiums Linux-proxy-oppslag leser
  `https_proxy`/`HTTPS_PROXY`/`no_proxy` selv når Playwright ikke gir `--proxy-server`),
  men stoler ikke på proxyens MITM-CA — Node stoler på den via CA-bundle-oppsettet
  (smeden så `/root/.ccr/ca-bundle.crt` i samme miljøtype). Forventet
  `request.failure().errorText`: `net::ERR_CERT_AUTHORITY_INVALID`.
- **H2 — proxy:** Chromium når ikke proxyen riktig (ikke rutet, eller proxy-auth i
  URL-en som Chromium ignorerer). Forventet: `net::ERR_PROXY_CONNECTION_FAILED`,
  `net::ERR_TUNNEL_CONNECTION_FAILED`, `net::ERR_CONNECTION_REFUSED/TIMED_OUT` eller
  407-relatert feil.

Begge kureres av samme prinsipp: **la Playwright-nettleseren speile Node sitt miljø**
(samme proxy, samme ekstra CA) — env-gatet, slik at CI (GitHub Actions, ingen proxy) og
lokal Mac er bit-for-bit uendret.

## Research Findings

- Playwright (1.60, `packages/playwright-core/src/server/chromium/chromium.ts` ~:390):
  `--proxy-server=` legges KUN til når `proxy`-opsjonen er satt; ingen `--no-proxy-server`
  legges til ellers. Uten opsjonen gjelder Chromiums eget proxy-oppslag. `proxy.bypass`
  (kommaseparert) mappes til `--proxy-bypass-list`; ledende `.` → `*.`.
- Chromium `net/proxy_resolution/proxy_config_service_linux.cc`: leser `all_proxy`,
  `http_proxy`, `https_proxy`, `no_proxy` (og `base::Environment` prøver alternativ
  case, så `HTTPS_PROXY` fanges også). Chromium bruker IKKE brukernavn:passord fra
  proxy-URL-en i env — Playwrights `proxy.username/password` er veien for proxy-auth.
- Chromium (Linux) stoler ikke automatisk på CA-er Node får via `NODE_EXTRA_CA_CERTS`;
  Playwright-issue #4785 («chromium ignores root CA certificates installed manually»).
  Playwrights sanksjonerte bryter for testrigger er `ignoreHTTPSErrors` (context-nivå,
  settes i `use`). Kilder: playwright.dev/docs/network (proxy),
  github.com/microsoft/playwright/issues/4785, /issues/2814.
- Node-fetch (undici) honorerer ikke `HTTPS_PROXY` av seg selv — at Node-siden virker i
  VM-en betyr at miljøet har ordnet Node-egress særskilt. Det er nettopp den ordningen
  nettleseren må speile; hvilke env-var-navn miljøet bruker, verifiseres i Steg 1.

## Prior Decisions (bæres videre)

- **Env-gatet, usatt = uendret** — mønsteret i `playwright.config.ts` for
  `PLAYWRIGHT_PORT` (#1259) og `PW_CHROMIUM_EXECUTABLE_PATH` (#1183): natt-miljøets
  særegenheter løses i repoet, aldri ved å røre CI-oppsettet, og alltid med issue-nr i
  kommentaren.
- **Aldri skip-for-grønt** (`docs/test-discipline.md`, smedens forarbeid på #1581): et
  miljøflagg som hopper over specen er IKKE løsningen. Fungerer ikke kuren, eskaleres
  det med det fangede `net::`-feilnavnet — ikke `test.skip`.
- **CI = prod-server, lokal = dev** (#1441) og `trace: 'on-first-retry'` (#1132) er
  urørt.

## Design

Tre deler, alle små. Del 1 er diagnose-for-protokollen og gjøres FØRST i natt-VM-en;
del 2 er kuren; del 3 gjør fremtidige miljøfeil selvforklarende i tekstloggen.

### Steg 1 — Fang feilnavnet (i natt-VM-en, før kuren)

1. Noter miljøet (skriv verdiene i PR-kommentaren, uten hemmeligheter — masker
   evt. brukernavn/passord i proxy-URL): `env | grep -iE 'proxy|ca_cert|cert_file|ca_bundle'`
   → hvilke av `HTTPS_PROXY`/`https_proxy`/`HTTP_PROXY`/`NO_PROXY`/`NODE_EXTRA_CA_CERTS`
   /`SSL_CERT_FILE` er satt, og om `/root/.ccr/ca-bundle.crt` finnes.
2. Kjør KUN golden-path-specen med `requestfailed`-loggeren fra del 3 aktiv:
   `CI=1 PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test e2e/games/scoring-golden-path.spec.ts --grep @gate`
   (samme flagg som Steg 4 i nattkjoreren.md). Les linjen
   `[e2e egress] <method> <url> → <errorText>` for `*.supabase.co`-requesten.
3. Klassifiser: `ERR_CERT_*` → H1; `ERR_PROXY_*`/`ERR_TUNNEL_*`/`ERR_CONNECTION_*` →
   H2; noe annet (f.eks. `ERR_BLOCKED_BY_CLIENT`, `ERR_NAME_NOT_RESOLVED`,
   ingen requestfailed-linje i det hele tatt) → **STOPP** og eskaler per
   `.forge/templates/eskalering.md` med feilnavnet — ikke bygg kur på gjetning.

### Steg 2 — Kuren: speil Node sitt egress i Playwright-nettleseren

Ny liten, ren modul ved siden av configen (forslag: `playwright.egress.ts` — navn er
byggerens valg; den MÅ ligge utenfor `e2e/` fordi `vitest.config.ts` ekskluderer
`e2e/**`, og den skal ha en kolokalisert Type A-test):

```ts
// playwright.egress.ts (skisse — signatur og semantikk er kontrakten, ikke linjene)
export type EgressUse = {
  proxy?: { server: string; bypass: string; username?: string; password?: string };
  ignoreHTTPSErrors?: boolean;
};
/** Ren funksjon: env → Playwright `use`-fragment. Tomt objekt når ingen av variablene er satt. */
export function egressFromEnv(env: NodeJS.ProcessEnv): EgressUse;
```

Regler for `egressFromEnv`:

- **Proxy:** første satte av `HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`
  (tom streng = usatt). Parses med `new URL()`: `server` = `protocol//host[:port]`
  UTEN userinfo; `username`/`password` = dekodet userinfo når til stede (utelates
  ellers). Ugyldig URL → kast en tydelig feil ved config-last (samme stil som
  `PLAYWRIGHT_PORT`-vakten, `playwright.config.ts:10–19`) — aldri stille ignorér.
- **Bypass:** `NO_PROXY`/`no_proxy` (kommaseparert, trim, tomme ledd droppes) **pluss
  alltid** `localhost,127.0.0.1` — appen under test kjører på `localhost:<PORT>` og skal
  aldri gå via proxyen. Playwright mapper selv ledende `.` til `*.`; ikke dupliser.
- **Privat CA:** `ignoreHTTPSErrors: true` når `NODE_EXTRA_CA_CERTS` eller
  `SSL_CERT_FILE` er satt (ikke-tom). Begrunnelse: det er signalet «TLS her termineres
  av en CA Node er bedt om å stole ekstra på» — nettleseren skal stole på det samme.
  Testriggen snakker kun med `localhost` (uten TLS) og staging-Supabase, så bryteren
  maskerer ingenting vi vil fange i e2e.
- **Ingen variabler satt → `{}`** — `use` i configen blir identisk med i dag. Dette er
  det viktigste kravet: CI og lokal utvikling skal ikke kunne merke endringen.

I `playwright.config.ts` (`use:`-blokken, :40): spre `...egressFromEnv(process.env)`
inn, med en kommentar som peker på #1581 og forklarer «speiler Node sitt egress i
natt-VM-en; usatt = uendret».

Bygg **begge** delene (proxy + CA), ikke bare den Steg 1 pekte på: begge er korrekte
speilinger av Node-miljøet, koster ingenting der variablene er usatt, og gjør kuren
robust for neste miljø-variant. Steg 1 sitt funn avgjør bare om kuren er *relevant*
(H1/H2 → ja) eller om vi må stoppe (annet).

### Steg 3 — Selvforklarende tekstlogg ved egress-feil

Ny hjelper i `e2e/_helpers/games.ts` (ved siden av `signInViaOtp`), f.eks.
`logEgressFailures(page: Page): void`: abonnerer på `page.on('requestfailed')` og
skriver én linje til stdout for hver feilet request som IKKE er mot `localhost`/
`127.0.0.1`: `[e2e egress] <METHOD> <origin+pathname> → <request.failure()?.errorText>`.
Ingen query-strenger, ingen headers, ingen bodies (URL-en til RPC-en er ikke hemmelig,
men vanen skal være riktig). Kall den på `playerPage` og `adminPage` i
`scoring-golden-path.spec.ts` rett etter at sidene opprettes — det er den ene specen som
har browser-egress som pass-betingelse. Ikke rull den ut til alle specer (I4).

### Steg 4 — Dokumentér miljø-speilingen for loopen

`docs/loops/nattkjoreren.md` Steg 4 (etter kulepunktet om `PW_CHROMIUM_EXECUTABLE_PATH`):
ett nytt kulepunkt som sier at e2e-nettleseren speiler Node sitt egress via
`HTTPS_PROXY`/`NO_PROXY` og `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` (#1581), og — KUN
hvis Steg 1 viste at VM-en trenger en eksplisitt `export` for at speilingen skal slå inn
(f.eks. `export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`) — nøyaktig hvilken linje
som må eksporteres før `npm run e2e:gate`, i samme form som #1183-punktet.

## Edge Cases & Guardrails

- **Ingen env satt (CI, lokal Mac):** `egressFromEnv({})` → `{}`; `use` uendret. Test-låst.
- **Bare proxy satt, ingen CA-var:** proxy konfigureres, `ignoreHTTPSErrors` utelates.
  Hvis Steg 1 var H1 og dette er situasjonen i VM-en, er kuren `export`-linjen i
  nattkjoreren.md (Steg 4) — IKKE en hardkodet sti i configen.
- **Proxy-URL med userinfo (`http://u:p@host:3128`):** `server` uten userinfo,
  `username`/`password` dekodet (`decodeURIComponent`). Passord logges aldri.
- **`NO_PROXY` med ledende punktum / mellomrom / tomme ledd:** trimmes; `.foo.no` sendes
  som `.foo.no` (Playwright mapper til `*.foo.no`).
- **Lowercase vs uppercase:** begge fanges; uppercase vinner ved konflikt (deterministisk,
  test-låst).
- **Ugyldig proxy-URL:** kast ved config-last med norsk melding som nevner variabelen.
- **`webServer` (Next) er urørt** — Node-serveren arver shell-miljøet som før; kun
  nettleserens `use` endres.
- **Trace/skjermbilde-oppsettet (#1132) er urørt.** Loggeren i Steg 3 er et tillegg til
  tekstloggen, ikke en erstatning for trace.
- **Fortsatt rødt etter kuren i VM-en:** IKKE `test.skip`, IKKE tredje kur på hope
  (I5). Eskaler med `net::`-feilnavnet + env-listen fra Steg 1 (maskert) i
  `.forge/templates/eskalering.md`; behold del 3 (loggeren) og del 2 (kuren) hvis de er
  korrekte i seg selv — de er nyttige uansett — men marker Success Criteria 4 som ikke
  oppfylt.
- **Prod:** ingen DB, ingen migrasjon, ingen app-kode. Kun `playwright.*`, `e2e/`,
  `docs/`.

## Key Decisions

- **Speile Node-miljøet i stedet for å hardkode natt-VM-en:** env-gate på de
  konvensjonelle variablene (`HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`/
  `SSL_CERT_FILE`) — ingen `PW_ROUTINE`-flagg, ingen VM-stier i repoet. Grunn: neste
  cloud-miljø har samme konvensjoner; og «usatt = uendret» er trivielt å bevise.
- **`ignoreHTTPSErrors` fremfor `--ignore-certificate-errors-spki-list`:** SPKI-listen
  er mer presis, men krever PEM-parsing av bundelen i configen for et testrigg-problem
  som bryteren løser i én linje. Match effort to difficulty. (Kan strammes senere om
  noen vil — Out of Scope.)
- **Bygg begge halvdeler uansett H1/H2:** se Steg 2. Diagnosen styrer «stopp eller gå»,
  ikke hvilken halvdel som skrives.
- **Ingen skip-flagg:** issuets alternativ B (miljøflagg som hopper over specen)
  forkastes — det er nettopp «grønt uten bevis» disiplinen forbyr.
- **Loggeren kun i golden-path:** den ene specen med browser-egress som pass-betingelse.

**Claude's Discretion (byggeren avgjør):**
- Filnavn/plassering av den rene modulen (må være utenfor `e2e/` og ha kolokalisert
  vitest-test; `playwright.egress.ts` + `playwright.egress.test.ts` ved roten er
  forslaget).
- Nøyaktig loggformat i Steg 3 (må inneholde metode, origin+path og `errorText`).
- Om `SSL_CERT_FILE` skal med som CA-signal i tillegg til `NODE_EXTRA_CA_CERTS`
  (kontrakten sier ja; dropp den bare hvis Steg 1 viser at VM-en setter
  `NODE_EXTRA_CA_CERTS` og `SSL_CERT_FILE` peker på noe annet enn samme bundle).

## Success Criteria

- [x] **SC1 — Usatt = uendret:** Type A-test viser `egressFromEnv({})` og
      `egressFromEnv({ HTTPS_PROXY: '', NODE_EXTRA_CA_CERTS: '' })` → `{}`; og
      `git diff` i `playwright.config.ts` er kun spread-linjen + kommentar (ingen andre
      `use`-nøkler endret). Verifiser: `npx vitest run playwright.egress` grønn +
      diff-lesing.
- [x] **SC2 — Proxy-speiling:** `it.each` dekker: uppercase/lowercase `HTTPS_PROXY`,
      `HTTP_PROXY`-fallback, userinfo → `username`/`password` og `server` uten userinfo,
      `NO_PROXY` → `bypass` som alltid inneholder `localhost` og `127.0.0.1`, ugyldig URL →
      kaster. Verifiser: testfila + `npx vitest run playwright.egress`.
- [x] **SC3 — CA-speiling:** `NODE_EXTRA_CA_CERTS=/x` eller `SSL_CERT_FILE=/x` →
      `ignoreHTTPSErrors: true`; ingen av dem → nøkkelen finnes ikke. Verifiser: test.
- [ ] **SC4 — Golden-path grønn i natt-VM-en:** `CI=1 npm run e2e:gate` (med
      `PW_CHROMIUM_EXECUTABLE_PATH` som i Steg 4) gir **31/31** — golden-path inkludert
      — i samme miljø der den var rød på main. Verifiser: kommando-utfall i
      PR-kommentaren + `[e2e egress]`-linjen fra Steg 1 (før kuren) sitert som bevis
      på rotårsak. Bygges dette i en interaktiv økt utenfor natt-miljøet, er SC4 et
      eksplisitt `VERIFICATION GAP:` i PR-en og PR-en får `needs-manual-qa`
      (nattkjøreren beviser den neste natt).
- [x] **SC5 — Selvforklarende logg:** ved en feilet ikke-lokal request skriver
      golden-path-specen `[e2e egress] … → net::…` til stdout. Verifiser: Steg 1-kjøringen
      i VM-en (rød før kuren) viser linjen; alternativt en lokal kjøring med
      `HTTPS_PROXY=http://127.0.0.1:9` (dødt proxy-mål) mot golden-path som viser
      `ERR_PROXY_CONNECTION_FAILED`-linjen.
- [x] **SC6 — Dokumentert for loopen:** `docs/loops/nattkjoreren.md` Steg 4 har det nye
      kulepunktet (#1581), inkl. evt. `export`-linje fra Steg 1. Verifiser: diff.
- [ ] **SC7 — CI uendret grønn:** PR-ens `verify` + `e2e`-jobber grønne uten
      config-endring i `.github/workflows/`. Verifiser: `gh pr checks`.

## Gates

- [x] `npm run typecheck` exit 0 (root-fila inkluderes av `tsconfig.json` `**/*.ts`)
- [x] `npm run lint` 0 errors
- [x] `npx vitest run playwright.egress` grønn (ny Type A-suite)
- [x] `npm test` grønn (full suite — bekrefter at rotfila ikke kolliderer med noe)
- [x] `npm run build` grønn (§T2-gaten; endringen rører ikke app-kode, men gaten kjøres)
- [ ] `CI=1 npm run e2e:gate` i natt-VM-en → 31/31 (SC4)
- [x] Commit-prefix `fix(e2e)` eller `test(e2e)` med `[no-changelog]` i body + `Refs #1581`
      — ingen `.changes/`-notat (teknisk, ikke bruker-synlig).

## Files Likely Touched

- `playwright.egress.ts` (NY) — ren `egressFromEnv(env)`; `playwright.egress.test.ts`
  (NY) — Type A, `it.each`.
- `playwright.config.ts` — `use: { …, ...egressFromEnv(process.env) }` + kommentar (#1581).
- `e2e/_helpers/games.ts` — `logEgressFailures(page)`.
- `e2e/games/scoring-golden-path.spec.ts` — kall loggeren på `playerPage`/`adminPage`.
- `docs/loops/nattkjoreren.md` — Steg 4-kulepunkt.

## Out of Scope

- `test.skip`/miljøflagg for å hoppe over specen (forkastet, se Key Decisions).
- SPKI-presis sertifikat-tillit (`--ignore-certificate-errors-spki-list`) — mulig
  stramming senere, eget issue om ønsket.
- Endringer i CI-workflows, `webServer`-kommandoen, trace-/retry-oppsettet.
- Realtime-websocket-egress fra VM-en (ikke pass-betingelse i noen @gate-spec; hvis
  loggeren avslører `wss://`-feil, noter det i PR-kommentaren som funn — ikke fiks).
- Å gjøre Node-siden av proxy-oppsettet repo-eid (miljøet eier den; vi speiler bare).
- Å rulle `logEgressFailures` ut til alle specer.

## Bevis (bygg-økt 2026-08-18, interaktiv på eierens Mac)

Branch: `claude/forge-auto-1581-7d538d`. Kommandoene under er kjørt i denne økten.

- **SC1** — `npx vitest run playwright.egress` → 27 passed. `git diff playwright.config.ts`
  = 8 innsettinger, 0 slettinger (import + 6 kommentarlinjer + spread); ingen eksisterende
  `use`-nøkkel rørt. Ende-til-ende: golden-path mot staging UTEN proxy-env → `1 passed (18.1s)`.
- **SC2/SC3** — `playwright.egress.test.ts`, 27 tester: usatt/tom-streng → `{}`, uppercase
  vinner over lowercase, `HTTP_PROXY`-fallback, userinfo dekodet ut av `server`, bypass
  alltid `localhost,127.0.0.1` + dedup, ugyldig URL kaster med variabelnavnet,
  `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` → `ignoreHTTPSErrors: true`.
- **SC5 + rotårsak bekreftet** — golden-path kjørt mot staging med dødt proxy-mål
  (`HTTPS_PROXY=http://127.0.0.1:9`) reproduserer natt-symptomet nøyaktig, og loggeren
  navngir requesten:

  ```
  [e2e egress] POST https://<staging>.supabase.co/rest/v1/rpc/upsert_score_if_newer → net::ERR_PROXY_CONNECTION_FAILED
  ```

  Testen feiler på `toBeEnabled` for lever-knappen — samme feilbilde som natt-VM-en.
  Kjøringen beviser samtidig at (a) `use.proxy` faktisk når Chromium og (b) `bypass`
  holder localhost-trafikken utenom proxyen (innlogging og sidelastinger gikk gjennom).
  Skrivebords-diagnosen i kontrakten er dermed empirisk bekreftet: den ene requesten som
  må ut fra nettleseren er `syncWorker`s score-upsert.
- **Gates** — `npm run typecheck` exit 0 · `npm run lint` 0 errors ·
  `npx vitest run playwright.egress` 27 passed · `npm test` 492 filer / 6535 tester
  grønne · `npm run build` exit 0 (første forsøk feilet på `supabaseUrl is required` —
  fersk worktree uten env-fil, ikke diffen; kjørt om med staging-env sourcet).
- **Merk (forventet støy):** `requestfailed` fyrer også på `net::ERR_ABORTED` ved
  side-nedrigging, så en grønn kjøring kan vise én slik linje. Bevisst ikke filtrert —
  å skjule koder er nettopp det loggeren finnes for å unngå.

### SC4 — VERIFICATION GAP

`CI=1 npm run e2e:gate` → 31/31 i natt-VM-en er IKKE kjørt: denne økten er interaktiv på
eierens Mac, og VM-ens proxy/CA-oppsett lar seg ikke reprodusere her. Kontrakten forutser
utfallet (SC4-fallbacken): PR-en merkes `needs-manual-qa` og nattkjøreren beviser den
neste natt. Kontrakt-Steg 1 (fange `net::`-navnet i VM-en før kuren) er av samme grunn
ikke kjørt der — loggeren fra Steg 3 er nettopp det som gjør neste natt-kjøring
selvforklarende, og Steg 2 sier eksplisitt at begge halvdelene bygges uansett H1/H2.
