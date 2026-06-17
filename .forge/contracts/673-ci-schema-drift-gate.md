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

- [x] K1: `package.json:11` har `"gen:types": "supabase gen types typescript --project-id glofubopddkjhymcbaph --schema public > lib/database.types.ts"`.
- [x] K2: `.github/workflows/ci.yml` — `on: pull_request: branches:[main]`; `node-version-file: .nvmrc` (Node 20); `npm ci`; `npm run typecheck` + `npm test` blokkerende; `npm run lint` med `continue-on-error: true`. Kjørte GRØNT live (run 27683629237).
- [~] K3: `.github/workflows/schema-drift.yml` finnes med schedule + workflow_dispatch + `paths: supabase/migrations/**`; regenererer via `supabase/setup-cli` + `supabase gen types`, diff-er, exit 1 på drift; skip-guard (`if [ -z "$TOKEN" ]` → run=false → `if: run=='true'` på resten). YAML gyldig. **Live skip-kjøring kan først testes etter merge** (workflow_dispatch krever workflow på default-branch — GitHub-begrensning). Logikk validert ved konstruksjon.
- [x] K4: Begge filene parser som gyldig YAML (node `yaml.parse`); refererer kun eksisterende scripts (typecheck/test/lint/gen:types alle i package.json).
- [x] K5: **Live CI grønn** — run 27683629237 `conclusion=success`; Typecheck-steg 0 feil, Test-steg passerte, Lint non-blocking. Vercel preview også grønn.
- [x] K6: Eier-steg dokumentert i PR #691-body + ci.yml/schema-drift.yml-kommentarer + README (secret + branch protection).

## Gates

- YAML-parse av begge filer (`python3 -c yaml.safe_load`).
- De refererte scriptene finnes i package.json og kjører lokalt (`typecheck` 0, `test` grønt).
- Live CI-kjøring grønn (`gh run watch`/`gh run view`) etter push.

## Risiko / merknad

- `supabase gen types` (CLI) kan formatere litt annerledes enn MCP-`generate_typescript_types` (brukt i #672).
  Hvis første drift-kjøring (etter eier legger inn secret) flagger ren formaterings-diff: kjør `npm run gen:types`
  én gang for å kanonisere den committede fila. Drift-jobben skipper til secret finnes, så dette blokkerer ingenting nå.
- CI kan ikke verifiseres lokalt; ACCEPT krever en reell grønn kjøring på PR-en (K5).
