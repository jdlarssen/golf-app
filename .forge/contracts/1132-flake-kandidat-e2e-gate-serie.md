# Spec: Gjør e2e @gate-flaken diagnostiserbar (trace + artefakt + kald-start-headroom)

**Issue:** #1132 · **Branch:** claude/1132-flake-kandidat-e2e-gate-serie

## Problem

CI-vakta oppdaget 2026-07-07 at hele e2e `@gate`-serien (7 spec-er på tvers av cup, scoring, liga og signup) feilet samlet på PR #1128 med timeout- og «element ikke funnet»-mønster, og at en re-kjøring av samme jobb på samme commit uten kodeendring ble helt grønn (run `28879214774`, attempt 1 rød → attempt 2 grønn — verifisert: `gh run view 28879214774` viser nå attempt 2 = success). Rød→grønn uten endring = flake-kandidat, ikke løst funn.

Kjernen i hvorfor dette ikke ble rotårsaks-diagnostisert: **e2e-riggen fanger ingenting når den feiler.** `playwright.config.ts:1-29` setter verken `reporter`, `use.trace` eller `use.screenshot`, og `e2e`-jobben i `.github/workflows/ci.yml:77-149` laster ikke opp noen artefakt. Når `@gate`-serien blir rød, finnes det derfor kun tekst-loggen å se på — det er nettopp derfor issuet måtte gjette på infra-årsak («kunne ikke reprodusere»). Riggen kjører mot `torny-staging` via `npm run dev` (Next 16 Turbopack, `reuseExistingServer: !CI` → alltid fersk boot i CI), serialisert (`workers: 1`) med `retries: 1`. Feilsignaturen (hel batch urelaterte flyter timer ut samtidig) er den samme klassen som allerede er dokumentert i `ci.yml:91-113` (#1095: kald Turbopack/WASM-sti → «blows 5s toBeVisible timeouts across unrelated specs») — men #1095-vakten fanger kun en helt manglende native-binding, ikke en treg/kontendert kald-boot.

Dette issuet fikser ikke selve flaken (den er per #1073 utsatt til en flake-jeger, og én datapunkt er ikke nok til å rotårsaks-bevise). Leveransen er **å gjøre neste forekomst diagnostiserbar** pluss et billig, velkjent kald-start-vern — alt er test-infra, ingen produktkode, ingen DB.

## Design

Alt under er endringer i to filer (`playwright.config.ts` + `.github/workflows/ci.yml`) og er kun test-/CI-infra. Ingen produktkode, ingen migrasjon, ingen bruker-synlig endring.

1. **Grunn i den ekte loggen først (obligatorisk, systematic-debugging).** Hent den faktiske feilloggen før du rører config: `gh run view 28879214774 --attempt 1 --log-failed` (evt. `gh run view 28879214774 --attempt 1 --log | grep -iE "refused|timeout|Error|element"`). Bekreft hvilken klasse feilene tilhører:
   - **(a) ERR_CONNECTION_REFUSED / dev-server booter aldri** → kald-boot-timeout er hovedmistanken → steg 4 (`webServer.timeout`) er den mest relevante.
   - **(b) `toBeVisible`/`waitForURL`-assertions timer ut på en server som svarer** → per-rute kald-kompilering blåser assertion-timeouts → steg 4 + evt. `expect`-timeout-headroom (Claude's Discretion).
   - **(c) staging-data/OTP/rate-limit-feil** → IKKE en kald-start-flake; da er diagnostikk-delen (steg 2–3) fortsatt riktig leveranse, men noter i PR-en at kald-start-vernet (steg 4) ikke traff årsaken.
   Skriv `EXPECT:`-linje for hva loggen skal vise før du kjører (I8), og la funnet styre vektleggingen — ikke omvendt.

2. **Fang diagnostikk i `playwright.config.ts`.** Legg til på `use`-blokka (rundt `playwright.config.ts:10-17`):
   - `trace: 'on-first-retry'` — Playwright-anbefalt CI-innstilling; siden CI har `retries: 1` (linje 9), traces den FEILENDE retry-en. I run `28879214774` feilet retry-en også (derav rød jobb) — en slik trace er nøyaktig det som manglet.
   - `screenshot: 'only-on-failure'`.
   - (video utelates som default — trace + screenshot er den magre, anbefalte CI-pakka; se Claude's Discretion.)
   Legg til `reporter` på topp-nivå: `[['list'], ['html', { open: 'never' }]]` — `open: 'never'` hindrer at HTML-rapporteren prøver å åpne nettleser på runneren. Traces/screenshots havner i `test-results/`, HTML-rapporten i `playwright-report/`.

3. **Last opp rapport + traces som CI-artefakt** i `e2e`-jobben (`.github/workflows/ci.yml`). Legg til et `actions/upload-artifact@v4`-steg ETTER både `Authenticated e2e (golden-path + cup/liga smoke)` (linje 118-132) og `Authenticated e2e — lifecycle (non-blocking)` (linje 139-149), slik at en rød gate (eller en soft-feilende lifecycle-lane, som er `continue-on-error`) etterlater en inspiserbar artefakt. Last opp `playwright-report/` + `test-results/`. Betingelsen må sikre at en RØD gate alltid gir artefakt — `if: ${{ !cancelled() }}` fanger både den blokkerende gaten og den `continue-on-error`-merkede lifecycle-lanen (eksakt `if:`-form er Claude's Discretion, men kravet er ufravikelig). Sett `retention-days` moderat (f.eks. 14) og `if-no-files-found: ignore`.

4. **Kald-start-headroom (billig vern).** Sett eksplisitt `webServer.timeout` i `playwright.config.ts:18-22` (i dag ingen → Playwright-default 60 s for at serveren skal svare på porten). Sett `120_000` slik at en kald/kontendert Turbopack-boot på en delt Actions-runner ikke nuker hele jobben før serveren er nåbar. Dette er near-zero-risk og adresserer den ledende hypotesen i issuet direkte.

5. **Commit + PR.** Test-/CI-infra → prefiks `test:` eller `ci:`, **ingen** `npm version`-bump, **ingen** CHANGELOG-linje (ikke bruker-synlig). Commits har `Refs #1132` i body (commit-msg-hooken krever det). PR-body: `Closes #1132`. Merk i PR-en: flaken er gjort diagnostiserbar + kald-start-vernet, ikke bevist eliminert — en framtidig forekomst med captured trace er den ekte rotårsaks-jakten (jf. #1073).

## Edge Cases & Guardrails

- **HTML-rapporteren må ikke blokkere CI:** uten `open: 'never'` prøver rapporteren å åpne nettleser på failure og kan henge/feile jobben. Verifiser at `open: 'never'` er satt.
- **Artefakt-steget må ikke selv feile jobben:** bruk `if-no-files-found: ignore` (grønn kjøring har ingen traces å laste opp) og en `if:`-betingelse som kjører uavhengig av gate-resultatet.
- **Ikke gjør flaken «grønn» ved å skru opp `retries` eller legge til brede `test.setTimeout`.** Det maskerer signalet i stedet for å bevare det. Endring av eksisterende spec-assertions/timeouts er ikke i scope her (og ci-vakta-protokollen krever eksplisitt begrunnelse for assertion-endringer).
- **`trace: 'on'` er for dyrt** (traces hver test, hver kjøring) — `on-first-retry` fanger nettopp flake-forekomsten uten å tynge grønne kjøringer.

## Key Decisions

- **Diagnostikk-først, ikke spekulativ fiks.** Én rød→grønn-datapunkt beviser ikke en rotårsak; #1073 utsatte flake-jegeren bevisst. Riktig leveranse er derfor å gjøre neste forekomst diagnostiserbar (trace + artefakt) + ett billig, velkjent kald-start-vern — ikke å dikte opp en fiks for en ureprodusert flake.
- **Behold `next dev`.** Å bytte e2e til produksjonsbygg (`next build` + `next start`) ville eliminert hele per-rute-kompilerings-klassen, men er en tung infra-endring med egen risiko og lokal-DX-kostnad — uforholdsmessig for ett datapunkt i milestone 9 (Backlog). Utelatt bevisst; kan revurderes hvis flaken gjentar seg med trace-bevis.
- **`Closes #1132`.** Issuet som arbeidsenhet («gjør denne flake-klassen diagnostiserbar/mildnet») fullføres av denne leveransen; nyansen (flake ikke bevist borte) hører i closing-kommentaren, ikke i en åpen-issue-limbo.

**Claude's Discretion:** eksakt `webServer.timeout`-verdi (90–120 s), eksakt `if:`-betingelse på upload-steget så lenge en rød gate garantert gir artefakt, `retention-days`-verdi, hvorvidt `video: 'retain-on-failure'` legges til (kun hvis loggen i steg 1 tilsier at screenshot+trace er utilstrekkelig), og hvorvidt et lite `expect`-timeout-headroom legges til (kun ved (b)-signatur i steg 1).

## Success Criteria

- [ ] Den faktiske feilloggen fra run `28879214774` attempt 1 er hentet og feilklassen ((a)/(b)/(c)) er navngitt i PR-en — fiksens vektlegging følger funnet.
- [ ] `playwright.config.ts` setter `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'` og en `reporter` med `['html', { open: 'never' }]`.
- [ ] `playwright.config.ts` setter eksplisitt `webServer.timeout` (90–120 s).
- [ ] `e2e`-jobben i `.github/workflows/ci.yml` laster opp `playwright-report/` + `test-results/` som artefakt på en rød/soft-feilende kjøring (`actions/upload-artifact@v4`, `if-no-files-found: ignore`).
- [ ] Ingen produktkode, ingen migrasjon, ingen version-bump, ingen CHANGELOG-linje; commits har `Refs #1132`, PR-body har `Closes #1132`.
- [ ] Eksisterende spec-assertions og `retries`/`workers` er urørt (flaken bevares som signal, ikke maskeres).

## Gates

- [ ] `npm run typecheck` — `playwright.config.ts` er TypeScript; må kompilere.
- [ ] `npm run lint`.
- [ ] `npx playwright test --list` — parser config og enumererer spec-ene uten å boote dev-serveren (beviser at reporter/trace/webServer-config er gyldig). Kjør med Node 22 (`nvm use 22`).
- [ ] YAML-validering av `.github/workflows/ci.yml` (actionlint hvis tilgjengelig, ellers visuell diff-review av det nye steget).
- [ ] Staging-verify er IKKE påkrevd (ren test-/CI-infra, ikke bruker-synlig). En full `e2e:gate`-kjøring krever staging-secrets og er ikke en merge-gate her; hvis secrets finnes i worktreen, én grønn `npm run e2e:gate` er en fin bonus-bekreftelse på at reporter/artefakt-stien fungerer, men ikke obligatorisk.

## Files Likely Touched

- `playwright.config.ts` — `reporter` + `use.trace`/`use.screenshot` + `webServer.timeout`.
- `.github/workflows/ci.yml` — `actions/upload-artifact@v4`-steg i `e2e`-jobben.

## Out of Scope

- Å «fikse» eller bevise rotårsaken til selve flaken — det er den utsatte flake-jegeren (#1073), som denne leveransen kun muliggjør.
- Bytte e2e-riggen fra `next dev` til produksjonsbygg (`next build`/`next start`).
- Endre eksisterende spec-assertions, `retries`, `workers` eller per-test-timeouts.
- Endre `verify`-jobben (typecheck/test/lint/guard) — kun `e2e`-jobben berøres.
- Ny doc-/flake-logg-infrastruktur — issuet selv er datapunktet.
