# Evaluering: #673 — CI-gate + schema-drift-sjekk

**Verdikt: ACCEPT** (med én live-sjekk utsatt til post-merge, se K3)
**Dato:** 2026-06-17 · **PR:** [#691](https://github.com/jdlarssen/golf-app/pull/691)

Hovedkriteriet (K5 — at gaten faktisk kjører grønt) er objektivt verifisert av GitHub Actions selv
(run 27683629237, `conclusion=success`) — sterkere bevis enn en gjennomlesning kan gi. Derfor er
formell evaluering her gjort mot den live kjøringen + fil-inspeksjon, ikke en separat skeptiker-agent.

| K | Resultat | Bevis |
|---|----------|-------|
| K1 | PASS | `package.json:11` `gen:types` = `supabase gen types typescript --project-id glofubopddkjhymcbaph --schema public > lib/database.types.ts` |
| K2 | PASS | `ci.yml`: `on.pull_request.branches=[main]`, `node-version-file: .nvmrc`, `npm ci`, typecheck+test blokkerende, lint `continue-on-error`. Kjørte grønt. |
| K3 | PASS (live-sjekk utsatt) | `schema-drift.yml` med schedule+dispatch+migrations-path; CLI-regen + diff + exit 1 på drift; token-skip-guard. Gyldig YAML. Skip-pathen kan først `workflow_dispatch`-testes når workflowen er på default-branch (etter merge). |
| K4 | PASS | Begge filer parser som YAML (node `yaml.parse`); alle refererte scripts finnes. |
| K5 | PASS | Live run 27683629237 `success`: Typecheck 0 feil, Test passerte (blokkerende), Lint non-blocking. Vercel grønn. |
| K6 | PASS | Eier-steg (SUPABASE_ACCESS_TOKEN-secret + branch-protection required check) i PR-body + workflow-kommentarer + README. |

## Vurdering av risiko / gjenstående
- **K3 live-skip** kan ikke kjøres før merge (GitHub krever workflow på default-branch for dispatch). Etter
  merge: `gh workflow run schema-drift.yml` → skal bli grønn med en `::notice:: ... skipping`-melding til
  eier har lagt inn secreten. Lav risiko — skip-mønsteret (env-tom → `run=false` → `if`-gardede steg) er standard.
- **Formaterings-diff-risiko:** CLI (`supabase gen types`) kan formatere litt annerledes enn MCP-generatoren
  brukt i #672. Drift-jobben skipper til secret finnes; første reelle kjøring kan flagge ren formaterings-diff,
  som løses ved én `npm run gen:types` + commit. Dokumentert i workflow-kommentaren.
- **Lint ikke-blokkerende** bevisst (22 forhåndseksisterende feil) — sporet i #692; flippes til blokkerende der.

## Eier-handlinger for full aktivering (utenfor kodeendringen)
1. Legg til `SUPABASE_ACCESS_TOKEN` repo-secret (Settings → Secrets and variables → Actions).
2. Slå på branch protection for `main` med `verify` som required check (Settings → Branches).
