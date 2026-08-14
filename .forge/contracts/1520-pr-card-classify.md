# Forge-kontrakt — #1520 PR-kortet: presis grønt-klassifisering (forventet ci.yml-run + ekskluder kortets egen check)

**Issue:** [#1520](https://github.com/jdlarssen/golf-app/issues/1520) — «PR-kortet kan klassifisere grønt på tvilling-checks før ci.yml-runs er registrert»
**Type:** `fix` (intern tooling — `[no-changelog]`, ingen notatfil)

## Problem

To beslektede presisjonsfeil i samme klassifiseringspipeline:

1. **For tidlig grønt (issuets funn):** `classifyChecks` (`lib/loops/prCard.ts:61–66`)
   betyr «alle REGISTRERTE check-runs er fullført», ikke «alle FORVENTEDE workflows har
   kjørt». På en blandet PR (kode + docs) fyrer både `ci.yml` (`paths-ignore: '**.md',
   'docs/**', '.forge/**'`, `.github/workflows/ci.yml:23–26`) og tvillingen
   `ci-docs-noop.yml` (samme sti-liste, `:22–25`; lockstep-kommentar `:15–16`).
   Tvillingens `verify`/`e2e` fullfører på sekunder; i vinduet før ci.yml-kjøringens
   check-runs er registrert kan decide (`scripts/loops/decide-pr-card.ts:162–178`)
   klassifisere `green` på tvillingens `verify`/`e2e` + de øvrige rask-grønne checkene
   (`scan`, `drift`, `migrations`, Vercel). Størst praktisk vindu: dispatch-stien, som
   kjører på main-ref uten egen check på PR-head.

2. **Aldri grønt / permanent rødt på pull_request-stiene (verifikator-funn, live):**
   på `pull_request`-/`ready_for_review`-fyringer kjører kort-workflowen i PR-kontekst,
   så dens egen `post-card`-check henger på PR-head-SHA-en og er `in_progress` under
   HELE decide-pollingen → `classifyChecks` kan aldri returnere grønt der. Alle 10
   `ready_for_review`-fyringer siden #1516 (2026-08-07) endte noop. Verre: en kansellert
   kortkjøring etterlater `post-card` med `conclusion=cancelled`, som ligger i
   `BAD_CONCLUSIONS` (`prCard.ts:52`) → alle senere fyringer på samme SHA klassifiserer
   RØDT. Live-bevis: åpen PR #1569, head `c8626c90` — `verify`/`e2e`/`scan` grønne,
   `post-card` cancelled → kortet kan aldri komme.

Konsekvens av (1) ved treff: for tidlig knapp-kort (ufarlig) eller auto-merge-forsøk som
branch protection normalt stopper med 405 → fail-closed. Konsekvens av (2): kort-løkka
er i praksis død på pull_request-stiene.

## Design

1. **Ekskluder kortets egen check fra klassifisering:** filtrer bort check-runs som
   tilhører kort-workflowen selv (jobnavn `post-card` fra
   `.github/workflows/discord-pr-card.yml`) FØR klassifisering — én navnekonstant med
   lockstep-kommentar mot workflow-fila. Legges i `classifyChecks` selv (ett hjem), slik
   at også merge-endepunktets re-sjekk (`lib/loops/autoMerge.ts:172–180`, som kaller
   samme funksjon) slutter å lese en kansellert `post-card` som rød. T2: eksisterende
   `classifyChecks`-/`autoMerge`-tester utvides tilsvarende.
2. **Ny pure helper `expectsRealCi(changedFiles)`** i `lib/loops/prCard.ts` som speiler
   ci.yml sin `paths-ignore`-SEMANTIKK, ikke bare mønsterstrengene: GitHubs filter lar
   `**` krysse `/`, så `**.md` matcher enhver `.md` hvor som helst. Implementasjon:
   docs-only ⇔ `endsWith('.md') || startsWith('docs/') || startsWith('.forge/')`;
   PR-en forventer ci.yml hvis minst én endret fil ikke er docs-only. Eksplisitte
   testcases for nestede `.md` utenfor `docs/` (f.eks. `.changes/x.md`, `e2e/notat.md`
   → docs-only). For streng speiling ville henge docs-only-PR-er (ingen ci.yml-run
   finnes å vente på) — regresjon av #1477/#1483-flyten.
3. **Lockstep-test** i `lib/loops/prCard.test.ts` som leser `.github/workflows/ci.yml`
   (fs-presedens: `lib/formats/gameModeDbCheck.test.ts:25–27`) og asserter at
   `paths-ignore`-lista er nøyaktig de tre mønstrene helperen speiler — drift feiler
   testen. (Testen låser mønster-STRENGENE; semantikk-casene i pkt. 2 låser atferden.)
4. **Registrert-run-sjekken gjenbruker eksisterende hjem:** `lib/loops/discordActions.ts`
   har allerede `CI_WORKFLOW_FILE = 'ci.yml'` (`:153`) og oppslaget
   `GET /repos/{repo}/actions/workflows/${CI_WORKFLOW_FILE}/runs?head_sha=…` (`:258–260`,
   testet i `discordActions.test.ts:388–427`). Ekstraher/gjenbruk den — IKKE et nytt
   `actions/runs`-kall med klient-side path-filter (trap 4: en regel, ett hjem).
   Guardrail: endepunktet krever full 40-tegns SHA (`pr.head.sha` er full; gjelder
   test-fiksturer).
5. **Wiring i decide:** flytt `fetchChangedFiles`-kallet (i dag kun `:180`, ETTER
   klassifisering) foran; når `expectsRealCi`: krev registrert ci.yml-run for head-SHA-en
   før grønt slippes gjennom — ellers `pending` (poll videre i `WAIT_FOR_CHECKS`-grenen,
   `noCard` i engangs-grenen, samme mønster som i dag: `?? []` `:168` / `noCard` `:175`).
   Run-oppslaget gjøres kun når check-runs allerede ser grønne ut (billig guard sist).
6. **Seam for pollingen:** `waitForChecksToSettle` (`prCard.ts:86–99`) hardkoder
   `classifyChecks` — legg til VALGFRI `classify?`-opt på `ChecksSettleOpts` slik at
   gaten kan kjøre per forsøk uten å røre eksisterende tester (`prCard.test.ts:88–137`).
7. **Fetch-feil ≠ tom diff:** `fetchChangedFiles` returnerer i dag `[]` også ved
   HTTP-feil (`decide-pr-card.ts:79`) — da ville gaten slås stille AV. Skill `null`
   (feil) fra `[]` (tom diff): feil → behandle som `expectsRealCi = true`/`pending`
   (fail-closed).

## Edge Cases & Guardrails

- **Docs-only PR (dispatch-stien #1301):** `expectsRealCi === false` → oppførsel uendret,
  inkl. `waitForChecksToSettle`-pollingen mot Vercel-checkene.
- **ci.yml selv endret:** ikke docs-only → forventer real CI. Riktig.
- **HTTP-feil på run-oppslaget eller changed-files:** `pending` (fail-closed) — aldri
  stille gate-av (jf. design pkt. 7).
- **Flere runs på samme SHA** (re-runs): én match er nok — vi krever registrering, ikke
  unikhet.
- **300-filers-taket:** `fetchChangedFiles` stopper på 3×100 sider
  (`decide-pr-card.ts:77`) mens GitHub evaluerer paths-ignore over hele diffen —
  trunkering feiler mot gate-av (status quo). Kjent, dokumentert grense; PR-er >300
  filer er ikke en reell natt-kø-form.
- **`post-card`-navnet:** konstant + lockstep-kommentar; endres jobnavnet i workflowen
  uten konstanten, faller vi tilbake til dagens (pre-fix) atferd — synlig som noop-runs,
  ikke som feil-merge.

## Key Decisions

- Selv-check-ekskluderingen bor i `classifyChecks` (ett hjem) — bevisst
  atferdsendring også for merge-re-sjekken; dekkes av tester.
- Registrert-run-sjekk via eksisterende `workflows/{file}/runs?head_sha`-mønster fra
  `discordActions.ts`, ikke en ny variant.
- Speiling av paths-ignore skjer semantisk (GitHub-filterregler), låst av atferdscases;
  mønsterstrengene låses separat av lockstep-testen.
- Fail-closed hele veien: usikkerhet (API-feil, manglende run) → `pending`, aldri `green`.
- Rene tekniske valg — ingen produktvalg (loop-infra, usynlig for eier/spillere).

## Success Criteria

- [ ] **K1** — `expectsRealCi`: docs-only-lister (inkl. nestede `.md` som `.changes/x.md`)
  → `false`; blandet og kode-only → `true`; tom liste → `false`; `null` (fetch-feil)
  → gate på. _Evidens: nye cases i `lib/loops/prCard.test.ts`._
- [ ] **K2** — Selv-check-ekskludering: run-sett med `post-card` `in_progress` og alt
  annet grønt → `green`; `post-card` `cancelled` alene → `green`; ekte check
  `cancelled` → fortsatt `red`. _Evidens: utvidede `classifyChecks`-/autoMerge-tester._
- [ ] **K3** — Gate: grønne check-runs + `expectsRealCi` + ingen registrert ci.yml-run →
  `pending`; med registrert run → `green`. _Evidens: unit-tester med injisert
  run-liste/oppslag._
- [ ] **K4** — Lockstep-testen leser ci.yml og feiler ved mønster-drift. _Evidens:
  testen grønn; manuell mutasjon lokalt viser rød._
- [ ] **K5** — Docs-only- og kode-only-stiene ellers uendret. _Evidens:
  `npx vitest run lib/loops` grønn. `VERIFICATION GAP:` `scripts/loops/` har ingen
  tester — decide-wiringen verifiseres med en manuell tørrkjøring av
  `decide-pr-card.ts` mot en kjent PR-head (f.eks. #1569) med logg i PR-beskrivelsen._
- [ ] **K6** — Commit som `fix` med `[no-changelog]` i body + `Refs #1520`.

## Gates

`npm run typecheck` · `npx vitest run lib/loops` · `npm run lint` · pre-push-gate grønn.
Ingen staging-klikkrunde (ikke bruker-synlig flate) — verifisering er test-drevet +
tørrkjøringen i K5.

## Files Likely Touched

- `lib/loops/prCard.ts` — selv-check-filter i `classifyChecks`, `expectsRealCi`,
  `classify?`-seam
- `lib/loops/discordActions.ts` — ekstraher run-oppslaget/konstanten til gjenbruk
- `scripts/loops/decide-pr-card.ts` — flytt changed-files, skill feil fra tom diff,
  wire gaten
- `lib/loops/prCard.test.ts` + `lib/loops/autoMerge.test.ts` +
  `lib/loops/discordActions.test.ts` — K1–K5

## Out of Scope

- Concurrency-kanselleringen (#1483) og draft-først-disiplinen (#1516) — de demper
  vindu (1), denne kontrakten lukker semantikken.
- Auto-merge-KLASSIFISEREREN (`classifyAutoMerge`, #1406) — urørt; merge-re-sjekken
  (`autoMerge.ts:172–180`) endres kun via den delte `classifyChecks`-fiksen (K2).
- `ci-docs-noop.yml`-tvillingen selv og dens sti-liste.
- #1572 (kansellerte Decide-kjøringer under ventepolling) — beslektet symptomkilde
  (kansellert kjøring skaper nettopp `post-card=cancelled`-tilstanden), men egen
  rotårsak i workflow-timeout/concurrency; dette issuet fjerner følgeskaden.


---

## Drift-sjekk (2026-08-14): nøkkelpåstander verifisert mot HEAD — ingen drift. (`classifyChecks` på `prCard.ts:61–66`; `CI_WORKFLOW_FILE` på `discordActions.ts:153` med runs-oppslag `:260`; `fetchChangedFiles`-kall `decide-pr-card.ts:180`; jobnavn `post-card` i workflow `:52`.)

---

## Bygge-evidens (2026-08-14)

K1–K6: PASS (evaluator runde 1 ACCEPT — `.forge/evaluations/1520-pr-card-classify.md`). K5-gapet LUKKET i evalueringen: sparse-checkout-simulering kjørte decide rent, og live-probe mot #1569 head `c8626c90` viste pre-fix rød / post-fix grønn + registrert ci.yml-run funnet. Avvik a (ciRuns.ts pga. #1181-sparse-checkout) og b (noCard framfor pending ved fil-fetch-feil — strengere fail-closed, lukket latent NEVER_GLOBS-bypass) godkjent. Gates: tsc clean, vitest lib/loops 193/193 (full suite 6078), lint 0, build exit 0.
