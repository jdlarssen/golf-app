# Kontrakt: #1523 — Starttid/bane/tee fra cup-Oppsett propageres til genererte scheduled-matcher

**Issue:** [#1523](https://github.com/jdlarssen/golf-app/issues/1523)
**Branch:** `claude/1523-cup-plan-propagation`
**Type:** fix (bruker-synlig). Issuet har ferdige akseptkriterier — de ER
suksesskriteriene under. Ingen DB-migrasjon forventet (kun UPDATE-flyt);
oppstår behov for skjema-endring (flight-index på raden) → STOPP og eskalér
til hovedchatten før du bygger videre.

## Rotårsak (verifisert i issuet mot prod-data)

`tournament_plans` kopieres til `games`-radene i ETT øyeblikk: `generateCupMatches`
(`app/[locale]/admin/cup/[id]/generer/actions.ts` ~380–400,
`scheduled_tee_off_at: resolveScheduledTeeOffAt(scheduledTeeOffAt, match.flightIndex)`).
`saveCupPlan` (`lib/cup/planActions.ts:59`) skriver kun `tournament_plans` og rører
aldri genererte kamper — uten at UI-et sier fra. Kamper med
`scheduled_tee_off_at = NULL` finnes ikke i cron-sveipets EXISTS-gate (0094) og
auto-starter aldri.

## Avgjørelser

- **D1 — propagering i `saveCupPlan`:** når planen lagres og cupen har genererte
  kamper med `games.status = 'scheduled'`: skriv `scheduled_tee_off_at`,
  `course_id`, `tee_box_id` ned til disse kampene. Kamper med status
  `active`/`finished` røres ALDRI. Cup i alle statuser dekkes (draft er
  hovedcaset; verifiser om saveCupPlan overhodet kan kalles etter start).
- **D2 — flight-forskyvning gjenskapes fra lagrede rader:** kall samme
  `resolveScheduledTeeOffAt(nyBase, flightIndex)` som genereringen
  (FLIGHT_TEE_OFF_STAGGER_MINUTES=10 har ett hjem). IKKE differanse-basert
  offset (feiler når gammel plan-verdi var NULL — TestCup-caset).
  **KORRIGERT etter dypere skanning:** `groupBundleMatchesByFlight`
  (lib/cup/splitDayLineup.ts:36) opererer på wizardens `PlannedBundleMatch`
  (med `flightIndex`-felt), IKKE lagrede games-rader — den kan ikke gjenbrukes
  direkte. For LAGREDE rader er den fysiske runden = gruppen
  `(source_game_id ?? id)` (host + avledede, jf. getCupSnapshot:346).
  flightIndex per host-gruppe MÅ utledes med bevis mot genereringskoden
  (generer/actions.ts) — kandidater: nummer-suffikset i
  `tournament_match_label`, eller hosts innbyrdes rekkefølge ved generering.
  Byggeren skal LESE genereringen og bevise mappingen; er den ikke entydig
  utledbar fra lagrede rader → STOPP og eskalér (ingen skjema-endring på
  antagelse). Ikke-splittet cup (eldre presets): `flightIndex` er undefined i
  genereringen → ren base-tid for alle. Ren plan-funksjon (Type A, TDD) som tar
  lagrede kamper + ny plan og returnerer (gameId → felter)-updates.
  Merk også bevist: `saveCupPlan` avviser ikke-draft-cuper (`not_draft`) —
  propagering skjer altså kun i draft; active/finished-vernet i S3 er dermed
  dobbelt (cup-status + games-status-filter).
- **D3 — 0-rads-vern:** finnes scheduled-kamper, er 0 oppdaterte rader en EKTE
  feil → `expectAffected` (felle 2). Finnes ingen genererte kamper: propagering
  hoppes stille over (dagens oppførsel).
- **D4 — avledede kamper (splittet cup-dag):** avledede rader
  (`source_game_id` satt) skal ha samme bane/tee og sin flights forskjøvne
  starttid — verifiser mot genereringens faktiske skriving (I1: les hva
  genereringen setter på avledede rader og speil det eksakt).
- **D5 — cache:** hver oppdatert kamp → `revalidateTag(\`game-${id}\`, 'max')`
  (+ de revalidatePath-kall saveCupPlan allerede gjør).
- **D6 — UI-tekst i Oppsett** (CupPlanForm.tsx / oppsett-siden): når genererte
  kamper finnes, si under lagre-knappen at de oppdateres, f.eks. «De N matchene
  du har laget får den nye starttiden og banen.» Norsk copy → humanizer-skillet
  før commit. NB React 19 form-action-fellen (CupSetup bruker allerede
  preventDefault+startTransition-mønsteret — følg eksisterende form-oppsett).
- **D7 — CH-frysing:** `game_players.course_handicap` fryses ved start
  (`startScheduledGame`), ikke ved generering — tee-bytte før start er trygt
  (verifisert i `lib/games/recomputeCourseHandicap.ts`-dokumentasjonen; ingen
  ekstra handling).

## Suksesskriterier (= issuets akseptkriterier + gates)

- [ ] **S1:** Endrer arrangøren starttid i Oppsett etter generering (cup i draft) →
      alle `scheduled`-kamper får ny tee-off med flight-forskyvning intakt for
      splittet cup-dag. **Evidens:** Type A-tester på plan-funksjonen (test-commit
      først) + staging-verifisering.
- [ ] **S2:** Samme for bane og tee. **Evidens:** samme.
- [ ] **S3:** Kamper med status `active`/`finished` endres aldri. **Evidens:**
      Type A-test + evt. SQL-sjekk på staging.
- [ ] **S4:** Oppsett-skjermen forteller arrangøren at eksisterende kamper
      oppdateres (kun når genererte kamper finnes). **Evidens:** diff +
      staging-skjermbilde; humanizer kjørt.
- [ ] **S5:** Unit-test på propageringen: hvilke rader treffes, hvilke ikke
      (scheduled vs active/finished; splittet vs enkel; NULL-plan-base).
      **Evidens:** vitest-output.
- [ ] **S6:** Staging-klikkrunde: sett opp cup uten starttid → generer → sett
      starttid i Oppsett → kampene får den (SQL-verifisert) og auto-start-sveipet
      plukker dem opp (eller E1-fallbacken på game-home). **Evidens:**
      bevis-kommentar på PR + label.
- [ ] **S7:** Gates: `npx vitest run lib/cup` + endrede filers tester +
      `npm run build`. **Evidens:** output.

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Ingen genererte kamper | Propagering no-op, ingen expectAffected-krav |
| Alle kamper scheduled | Alle oppdateres, expectAffected > 0 |
| Blandet scheduled/active | Kun scheduled oppdateres |
| Splittet cup-dag (flere flighter) | 10-min-forskyvning per flight bevart |
| Plan-starttid settes til NULL (tømmes) | Kampene får NULL (auto-start av) — speiler genereringen |
| Avledet kamp (source_game_id) | Oppdateres konsistent med host (per D4-verifisering) |
| Bane byttes etter generering | course_id + tee_box_id propageres; CH urørt (fryses ved start) |
| Samtidig lagring (dobbeltklikk) | Idempotent — samme verdier skrives to ganger |

## Ikke-mål

- Planen blir ikke levende sannhet for aktive/ferdige kamper.
- Ingen endring i genereringsflyten.
- Ingen skjema-endring (eskalér hvis D2-rekonstruksjonen viser seg umulig).

## Commit-disiplin

Atomiske commits med `Refs #1523`. Fix-commit trenger `.changes/1523-<slug>.md`
(type: fix). Test-commit FØR impl-commit for plan-funksjonen.
