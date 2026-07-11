# Runde-historikk — #1132 (gjør e2e @gate-flaken diagnostiserbar)

Kontrakt: `.forge/contracts/1132-flake-kandidat-e2e-gate-serie.md`
Branch: `claude/natt-1132-flake-kandidat-e2e-gate-serie`

## Runde 1 — implementer + gates + selv-evaluering (ACCEPT)

**Bygget:**
- `playwright.config.ts`: `reporter: [['list'], ['html', { open: 'never' }]]`,
  `use.trace: 'on-first-retry'`, `use.screenshot: 'only-on-failure'`,
  `webServer.timeout: 120_000`.
- `.github/workflows/ci.yml`: `actions/upload-artifact@v4`-steg i `e2e`-jobben,
  `if: ${{ !cancelled() }}`, laster `playwright-report/` + `test-results/`,
  `retention-days: 14`, `if-no-files-found: ignore`.

**Feilklasse (steg 1):** Rå attempt-1-logg fra run `28879214774` var ikke
uavhengig hentbar via MCP (kjøringen rapporterer kun siste, grønne re-run →
`failed_jobs: 0`). Klassen navngis fra de tre siterte logg-datapunktene i selve
issuet — alle samme signatur (`Test timeout of 90000ms exceeded` /
«element ikke funnet» på tvers av urelaterte specs på en server som booter) =
**klasse (b)** (assertions/actions timer ut på en responderende server; per-rute
kald Turbopack-kompilering). VERIFICATION GAP notert i PR-kommentar.

**Gates:**
- `npm run typecheck` → grønt.
- `npm run lint` → 0 errors (55 pre-eksisterende warnings, identisk med main).
- `npx playwright test --list` → 87 tester i 34 filer, exit 0 (config parser).
- YAML-validering av `ci.yml` → OK.

**Verifisering utover gates (bonus):** `npm run e2e:gate` mot staging kjørte
(timet ut på 8 min — reproduserte selve kald-start-flaken på golden-path + liga),
og den nye config-en **fanget nøyaktig det som manglet**: `test-results/<spec>-retry1/`
inneholder `trace.zip` + `test-failed-1.png` + `error-context.md`, og
`playwright-report/index.html` ble generert. Diagnostikk-pipeline bevist ende-til-ende.

**Selv-evaluering (skeptisk):** Alle Success Criteria oppfylt. Ingen produktkode,
ingen migrasjon, ingen version-bump, ingen CHANGELOG. Eksisterende assertions/
retries/workers urørt (flaken bevart som signal). Ingen substansiell defekt funnet.
→ ACCEPT, videre til kryss-modell-gate (steg 4.5).

## Runde 2 — kryss-modell-gate (Sonnet), REJECT → fikset

**Sonnet-funn (substansielt):** Criterion 1 sa den rå attempt-1-loggen var
uhentbar via MCP — det var feil. `list_workflow_jobs(filter: all)` returnerer
begge forsøk; attempt-1 e2e-jobben er job `85662520544` (`run_attempt: 1`,
`conclusion: failure`), og `get_job_logs(job_id: 85662520544)` gir hele loggen.
Klassen var likevel korrekt inferert, men den påståtte VERIFICATION GAP var
unngåelig. Sonnet bekreftet samtidig at selve diff-en er ren på alle andre punkt
(reporter/trace/screenshot/webServer.timeout, upload-steget, `!cancelled()`-
semantikken, ingen navnekollisjon, retries/workers/asserts urørt).

**Fiks (ingen kodeendring — kun evidens):** hentet den ekte attempt-1-loggen.
Bekreftet **klasse (b)** direkte fra loggen:
`getByRole('link', { name: 'Trekk deg fra spillet' })` → `toBeVisible` timeout
**5000ms** → `element(s) not found`; 7 failed på tvers av urelaterte specs
(cup/scoring/liga/signup), retry #1 feilet med samme 5s-assertion-timeout,
«4 passed (10.1m)». Serveren svarte — assertions timet ut (per-rute kald
kompilering), ikke ERR_CONNECTION_REFUSED (a) eller OTP/rate-limit (c). Ekte
logg-utdrag siteres i PR-body; VERIFICATION GAP-noten fjernet.

**Utfall:** Sonnets eneste funn (manglende rå-logg-fetch) er løst; alle andre
aspekter var allerede CONFIRM-et av Sonnet. Gate resolved innen #1077-taket
(runde 2 av maks 5). → Lever som review-klar (steg 5).
