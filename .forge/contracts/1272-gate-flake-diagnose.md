# Kontrakt: @gate-flake mot staging — diagnose først, så fiks (#1272; dekker #1288, sporer #1168)

> ⚠️ **IKKE `autonomy:ready` ennå.** Kontrakten rører `playwright.config.ts` og e2e-specs — samme filer som #1259-kontrakten (port-isolasjon). Denne skal IKKE bygges før #1259-PR-en er merget; deretter rebases design-punkt F4 mot #1259s `PLAYWRIGHT_PORT`-konstant. (Kollisjonsregelen fra nattkjører-preppen.)

## Problem

`@gate`-suiten (`npm run e2e:gate`, 14 tester) mot torny-staging feiler ikke-deterministisk: samme commit rød → grønn ved re-kjøring uten endring, dokumentert fire ganger (#1272 natt-kjøring 18.07, #1288 PR #1287, #1168 PR #1167 + to PR-er 15.07). Signaturen er alltid timeouts/element-ikke-funnet spredt over urelaterte flyter (scoring-golden-path:47, liga:324, manual-approval:46) med `AbortError`-støy fra `[notifications] markRead` / `[fetchGameReactions]` i dev-server-loggen. En flaky gate svekker signalet CI og nattkjøreren (#1079) lener seg på.

## Diagnosegrunnlag (målt i økt 2026-07-19 — dette er ground truth, ikke hypotese)

- **Ingen rydder staging:** `cron.job` på staging har ÉN jobb (`start-scheduled-games`) — ingen ryddejobb finnes. Cleanup er per-spec `afterAll` (`cleanupTestGame`, best-effort, svelger feil) — og `notifications` har ingen FK til games (payload-JSON), så de kaskade-slettes aldri (dokumentert ghost-rows-tilfelle i `docs/superpowers/specs/2026-06-18-uat-test-environment-design.md:16-22`).
- **Målt datavolum staging:** games 8, scores 228, leagues 2 — bittelite. MEN `notifications` = 1338 rader, hvorav **911/424 på de to e2e-brukerne (910/421 uleste)**. Det er nøyaktig tabellen AbortError-støyen kommer fra: hver innlogget sidelast drar notifikasjonsarbeid over et evig voksende uleste-sett.
- **CI serialiserer ikke på tvers av PR-er:** `ci.yml:29-31` har kun `concurrency: group: ci-${{ github.ref }}` (per-branch). To PR-er kjører e2e SAMTIDIG mot samme staging-DB med SAMME to test-brukere (`E2E_ADMIN_EMAIL`/`E2E_PLAYER_EMAIL` er delte secrets). **#1168-kommentaren 15.07 er nær-beviset:** PR #1254 og #1257 kjørte e2e samtidig ~22:00 og ble røde i samme vindu med identisk signatur; begge grønne ved sekvensiell re-kjøring 22:12.
- **Manglende ventinger:** `scoring-golden-path.spec.ts:58-91` — rå `.click()` på `+1` og `submit-scorecard` uten `toBeEnabled`-vent (submit-knappen er disabled til sync-køen er drenert — «not enabled»-feilen fra #1272 er nettopp den); asserts bruker default 5s expect-timeout (ingen `expect.timeout` i config). `liga.spec.ts:398-402` — `page.goto` → rå `.click()` på server-rendret testid uten synlighetsvent (kald Turbopack-kompilering av ruta kan alene spise titalls sekunder).

## Design

**Fase 1 — verifiser diagnosen (før fiks):**
1. Hent Actions-historikk for de fire røde runene (`gh api repos/…/actions/runs/<id>` + samtidige runs i samme tidsvindu) og skriv en kort tabell: rød kjøring ↔ overlappende e2e-kjøring ja/nei. Bekrefter/avkrefter samtidighet som dominant driver.
2. Kjør `e2e:gate` lokalt mot staging én gang med tid-per-test-logging som baseline (før opprydding), og én gang etter notifications-purgen (fase 2.1) — differansen tallfester bloat-effekten.

**Fase 2 — fiks (alle fire er begrunnet av ground truth over, uavhengig av fase 1-utfall; fase 1 avgjør bare narrativet i PR-en):**
1. **Staging-hygiene:** engangs-purge av `notifications` for de to e2e-brukerne (staging-skriv via MCP er sanksjonert; staging har kun testdata). Deretter varig mekanisme i repoet: utvid e2e-helpernes cleanup (`e2e/_helpers/games.ts`) med sletting av notifications for e2e-brukerne eldre enn 1 time — kalles fra eksisterende `afterAll`-løp. Ingen ny pg_cron-jobb (én mekanisme, i repoet, versjonert).
2. **CI-serialisering:** egen `concurrency` på e2e-JOBBEN i `ci.yml`: `group: e2e-staging` (fast navn, ikke ref), `cancel-in-progress: false`. Avveining dokumentert i workflow-kommentar: GitHub holder maks én ventende kjøring per gruppe — ved 3+ samtidige PR-er kan en kø-plass kanselleres og kreve manuell re-run. Akseptert for solo-dev-PR-volum; alternativet (unike brukere per run) er et scale-trigget oppfølgings-issue hvis det biter.
3. **Eksplisitte ventinger** (kun de fragile stedene, ingen shotgun): scoring-golden-path — `await expect(knapp).toBeEnabled()` før `+1`- og submit-klikk (submit med romslig timeout, 30s — sync-drain), `toBeVisible` før tekstlesing; liga:402 — `await expect(getByTestId(…)).toBeVisible({ timeout: 30_000 })` før klikk (kald-kompilerings-headroom). manual-approval har allerede ventinger — røres ikke.
4. **Config-headroom** (ETTER #1259-rebase): sett `expect: { timeout: 10_000 }` i `playwright.config.ts` når `CI` er satt (lokal default 5s beholdes). Én endring, kommentert med #1272.

**Målbart exit-kriterium:** **5 grønne `e2e:gate`-kjøringer på rad** i CI på PR-branchen (workflow_dispatch × 5, sekvensielt), null retries brukt (sjekk report-artefaktene). Deretter: #1168 forblir åpent som sporings-issue med en kommentar om at fiksene er inne; lukkes først etter 14 flake-frie dager i CI (CI-vakta-historikken er målingen).

## Kanttilfeller & vakter

- Cleanup-utvidelsen må være scoped til e2e-brukernes id-er (staging-DB-en deles på tvers av worktree-økter — `games.ts:13-17`-regelen).
- Ventinger skal aldri asserte på norsk copy (Type D-regelen) — kun testid/rolle/enabled-state.
- `workers: 1` i CI beholdes; `retries: 1` beholdes (retry er plaster, ikke fiks — men fjernes ikke i denne runden).
- Ikke rør reporter/trace/`PW_CHROMIUM_EXECUTABLE_PATH`-blokkene (#1132/#1183-beslutninger).

## Nøkkelbeslutninger

- **#1288 lukkes som duplikat** inn i denne kontrakten (batch-mønsteret er samme rotårsak-klynge); **#1168 forblir åpent** som sporings-issue med det 14-dagers lukkekriteriet.
- **Ryddemekanisme i repoet, ikke pg_cron** — ASSUMPTION: versjonert kode slår miljø-konfig; staging-cron-flater er dessuten berørt av #1304.
- **Serialisering fremfor bruker-isolasjon** — minst inngripende fiks som adresserer det målte mønsteret; eskalering er definert.
- **Commit-prefikser:** `test(e2e)`/`ci`/`chore` — ikke bruker-synlig, ingen bump/CHANGELOG. Alle med `Refs #1272`.

**Claude's discretion:** eksakte timeout-verdier innenfor rammene over; hvor cleanup-kallet bor i helper-strukturen; fase 1-tabellens format.

## Suksesskriterier

- [ ] Fase 1-tabellen ligger i PR-en (samtidighet bekreftet/avkreftet per rød kjøring).
- [ ] Staging: `select count(*) from notifications` for e2e-brukerne < 50 etter purge; cleanup-koden verifisert med én lokal `e2e:gate`-kjøring som etterlater < 10 nye rader.
- [ ] `ci.yml` har e2e-jobb-concurrency med fast gruppe + forklarende kommentar; workflow-lint (`gh workflow view`) ok.
- [ ] De navngitte spec-stedene har eksplisitte ventinger; `grep -n "toBeEnabled\|toBeVisible" e2e/games/scoring-golden-path.spec.ts e2e/league/liga.spec.ts` viser dem.
- [ ] **5/5 grønne sekvensielle @gate-kjøringer i CI, null retries** — run-lenker i PR-kommentar.
- [ ] #1168 har status-kommentar med lukkekriteriet; #1288 er lukket som duplikat (gjøres av hovedchatten ved kontraktspostering).

## Gates

- [ ] `npm run build` + `npm run lint` + berørte co-located vitest grønne
- [ ] Commit-bodyer `Refs #1272`; PR-body `Closes #1272` (IKKE «Closes #1168»)

## Filer som trolig berøres

- `e2e/games/scoring-golden-path.spec.ts`, `e2e/league/liga.spec.ts` — ventinger
- `e2e/_helpers/games.ts` — notifications-cleanup
- `.github/workflows/ci.yml` — e2e-concurrency
- `playwright.config.ts` — CI expect-timeout (etter #1259-rebase)

## Utenfor scope

- pg_cron-jobbens www-URL (→ #1304); port-isolasjon (→ #1259); flake-jeger-automatikk (#1073-vurderingen); per-run bruker-isolasjon (eget issue hvis serialisering ikke holder); `manual-approval.spec.ts` (har ventinger).
