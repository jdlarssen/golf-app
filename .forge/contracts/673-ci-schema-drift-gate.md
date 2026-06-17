# Forge-kontrakt: #673 — CI-gate + gen:types + schema-drift-sjekk

**Issue:** [#673](https://github.com/jdlarssen/golf-app/issues/673)
**Branch:** issue-673-ci-schema-drift (fra main, etter #672 merge)
**Type:** Infrastruktur / bug-forebygging (ingen app-oppførselsendring)
**Opprettet:** 2026-06-17 · bygger på #672 (typede klienter)

## Hvorfor

#672 gjorde schema-drift til en `tsc`-feil. Men ingenting kjører `tsc` automatisk — det finnes ingen
`.github/`, og Vercel bygger først ETTER merge til main. Denne issuen lukker det gapet: CI kjører
typecheck + test før merge, og en schema-drift-jobb fanger hvis de håndholdte typene driver fra prod.

## Målte fakta (scoping 2026-06-17)

- Node 20 (`.nvmrc`), `package-lock.json` finnes → `npm ci` fungerer i CI.
- `npm run typecheck` = 0 feil. `npm test` = 281 filer / 3561 grønne. Begge egner seg som BLOKKERENDE gates.
- `npm run lint` = **22 feil i dag** (20× `@next/next/no-html-link-for-pages` — den bevisste privacy-`<a>`-en —
  + 1 `no-require-imports`). Lint kan derfor IKKE være en blokkerende gate nå; det ville blokkert hver PR.
- Ingen `.github/` finnes.

## Beslutninger (gray areas løst)

1. **PR-gate blokkerer på `typecheck` + `test`** (begge grønne). **`lint` kjøres ikke-blokkerende**
   (`continue-on-error: true`) så det er synlig men ikke blokkerer. Følge-issue filed for lint-opprydding
   → da kan lint flippes til blokkerende.
2. **e2e er IKKE i PR-gaten** (krever Playwright-browsere + app + ev. secrets — treg/flaky). Out of scope
   for #673; ev. nightly senere.
3. **Schema-drift-jobb er en egen workflow** gated på `SUPABASE_ACCESS_TOKEN`-secret. Hvis secret mangler:
   jobben SKIPPER pent (grønt, en `::notice::`), så den aldri blokkerer før eier har lagt inn secret.
   Triggere: daglig schedule + `workflow_dispatch` + PR som rører `supabase/migrations/**`.
4. **Branch protection settes IKKE automatisk** (repo-policy, kan overraske eier-pushes). Dokumenteres med
   eksakt sti/kommando så eier slår det på selv.
5. **`gen:types`** bruker Supabase CLI (`supabase gen types typescript --project-id glofubopddkjhymcbaph
   --schema public`). Dokumenteres at canonical regenerering går via dette scriptet.

## Scope-grense

- I scope: `gen:types`-script, `.github/workflows/ci.yml`, `.github/workflows/schema-drift.yml`, kort
  eier-dokumentasjon (secret + branch protection).
- Ute av scope: e2e i CI, lint-opprydding (egen issue), faktisk å sette branch protection, å legge inn secret.

## Suksesskriterier

- [ ] K1: `package.json` har `"gen:types": "supabase gen types typescript --project-id glofubopddkjhymcbaph --schema public > lib/database.types.ts"`.
- [ ] K2: `.github/workflows/ci.yml` finnes: trigget på `pull_request` mot `main`; Node 20; `npm ci`;
      kjører `npm run typecheck` og `npm test` som BLOKKERENDE steg, og `npm run lint` som `continue-on-error`.
- [ ] K3: `.github/workflows/schema-drift.yml` finnes: schedule + workflow_dispatch + migrations-path-PR;
      regenererer typer via Supabase CLI og diff-er mot committed `lib/database.types.ts`, feiler på drift;
      SKIPPER pent (exit 0 + notice) når `SUPABASE_ACCESS_TOKEN` mangler.
- [ ] K4: Begge YAML-filene er gyldig YAML og refererer kun npm-scripts som faktisk finnes.
- [ ] K5: **Den faktiske CI-kjøringen på denne PR-en er grønn** (typecheck + test passerer; lint synlig men
      ikke-blokkerende). Verifisert via `gh run`.
- [ ] K6: Eier-stegene dokumentert (legg til `SUPABASE_ACCESS_TOKEN`-secret; slå på required checks i
      branch protection) — i workflow-kommentarer + en kort note i issue/closing.

## Gates

- YAML-parse av begge filer (`python3 -c yaml.safe_load`).
- De refererte scriptene finnes i package.json og kjører lokalt (`typecheck` 0, `test` grønt).
- Live CI-kjøring grønn (`gh run watch`/`gh run view`) etter push.

## Risiko / merknad

- `supabase gen types` (CLI) kan formatere litt annerledes enn MCP-`generate_typescript_types` (brukt i #672).
  Hvis første drift-kjøring (etter eier legger inn secret) flagger ren formaterings-diff: kjør `npm run gen:types`
  én gang for å kanonisere den committede fila. Drift-jobben skipper til secret finnes, så dette blokkerer ingenting nå.
- CI kan ikke verifiseres lokalt; ACCEPT krever en reell grønn kjøring på PR-en (K5).
