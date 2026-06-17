# Kontrakt #674 — Autentiserte e2e: kjerneløkka + cup/liga-livssyklus-smoke

**Issue:** [#674](https://github.com/jdlarssen/golf-app/issues/674) · **Branch:** `claude/relaxed-brahmagupta-ee8cb3` (Bølge 1) · **Audit 2026-06-17**

## Problem

Ingen e2e kjører den INNLOGGEDE kjerne-løkka («Spille en runde») eller cup/liga-generator+standings —
nettopp der de siste prod-feilene (#641/#642/#647) levde. Alle game-spec-er asserterer bare logget-ut-
redirect; liga-spec-en seeder rader direkte og asserter kun tom-tilstand.

## Tilnærming

Tre env-gardede spec-er + helper + secret-gardet CI-jobb. Bruker eksisterende `signInViaOtp`
(OTP via `admin.generateLink`) + prod-DB-mønsteret i `e2e/_helpers/games.ts` (skipper uten secrets).

**Eier-beslutning (2026-06-17):** skriv spec-ene + CI-jobben nå; eier kjører dem lokalt for grønt og
legger inn GH Actions-secrets + `RUN_E2E`-variabel for å aktivere gaten.

**Bevisst avvik — cup:** issue ba om å kalle den ekte `createCupMatchesFromPlan` via UI. Generatoren er
en 5-stegs wizard UTEN test-id-er på knappene — for skjør å skrive blindt (kan ikke kjøres her). Vi seeder
i stedet match-radene med NØYAKTIG samme shape som server-action-en (validert mot live-skjema via Supabase
MCP: `game_players` har ingen `status`-kolonne, `flight_number=1`, `team_number` 1/2). Feil shape ⇒
seed-insert feiler ⇒ test rød, så #641-shape-klassen fanges fortsatt, og vi dekker #642-lese-stien
(per-kjønn-par 500) som faktisk var feilen. Generator-insert-stien dekkes av `generer/actions.test.ts`.

**Verifiserings-grense:** spec-ene kan IKKE kjøres i denne worktreen (ingen `.env.local`/service-role/
test-brukere). Verifisert her: `tsc` (typer), `playwright test --list` (kompilerer/laster), `npm run build`,
lint, + MCP-validering av alle seed-shapes mot live-skjema. «Grønt»-kjøring skjer i eiers miljø.

## Suksesskriterier

- [x] **K1** `e2e/games/scoring-golden-path.spec.ts` opprettet — full kjede via test.steps; bruker
      `submit-scorecard`/`approve-scorecard`/`score-number`/`stableford-leaderboard`; verifiserer
      `submitted_at`/`approved_at` via service-role (`expect.poll` for godkjenning). Lastes av `--list`.
- [x] **K2** `seedActiveStablefordGame` lagt til i `e2e/_helpers/games.ts`; insert-shape MCP-validert mot
      live `game_players` (ingen `status`; `tee_gender` default; `flight_number`/`accepted_at`/`course_handicap`).
- [x] **K3** `data-testid="submit-scorecard"` (SubmitForm.tsx) + `data-testid="approve-scorecard"`
      (ReviewActions.tsx) — `SubmitButton` videresender props → `<button>`. Build grønn.
- [x] **K4** `e2e/cup/cup-lifecycle.spec.ts` opprettet — seeder cup+match (prod-shape)+scores; asserter
      cup-navn synlig + `getByText('Noe gikk galt')` count 0 på `/admin/cup/[id]` + `/cup/[id]`.
- [x] **K5** `liga.spec.ts` ny describe «finished-flight standings (#647)» — ferdig flight + scores; asserter
      `liga-standings` + `liga-standings-row` synlig, ingen error-fallback.
- [x] **K6** `e2e`-jobb i `ci.yml`, `if: vars.RUN_E2E == 'true'` + alle 5 secrets i `env`; eier-aktivering
      dokumentert i jobb-kommentaren.
- [x] **K7** `tsc --noEmit` → exit 0; `playwright test --list` → 3 nye spec-er lastet (59 totalt);
      `npm run build` → exit 0; eslint på nye/endrede filer → rent.

## Gates

```bash
npx tsc --noEmit
npx playwright test --list
npm run build
npx eslint e2e/ app/[locale]/games/[id]/submit/SubmitForm.tsx app/[locale]/games/[id]/approve/ReviewActions.tsx
```

## Ikke i scope

- Å DRIVE den 5-stegs cup-generator-wizarden via UI (for skjør blindt; dekket via shape-seed + unit-test).
- Å kjøre spec-ene grønt her (krever eiers service-role-env) — eier verifiserer + aktiverer CI-gaten.
- Per-format golden-path (kun solo stableford, jf. issue: «do not duplicate per format»).

## Versjon

Ingen bump — rent test-/CI-arbeid (`test(e2e)`). De to `data-testid`-ene er ikke brukersynlig oppførsel.
