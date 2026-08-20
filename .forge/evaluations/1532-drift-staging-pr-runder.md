# Evaluation: #1532 — Schema-drift mot staging på PR-er, prod på cron/dispatch

**Builder+evaluator:** Nattkjøreren (#1079), Opus-bygg, fresh-context Opus-evaluator
**Contract:** issue-kommentar på #1532 (kontrakt-smeden 2026-08-18)
**Branch:** `claude/natt-1532-drift-staging-pr` fra `origin/main@48af513`

## Runde 1 — implement → evaluate → NEEDS WORK

Bygget (commit `ceedf47`): to-måls-logikk i `schema-drift.yml` (PR → staging,
schedule → prod, dispatch → `target`-input, default prod) via nytt
`Select drift target`-steg, målnavn i feil-/suksessmeldinger og i
varsel-issue-body, oppdatert header-kommentar, docs-oppdatering i
`ci-vakta.md` §6 og `bindings.md` §T3.

Evaluator-PASS (verifisert, ikke funn): YAML parser; `steps`-kontekst gyldig i
step-`name:`/`env:`; tom `github.event.inputs` på pull_request/schedule gir
prod korrekt; alle `run:`-blokker `bash -n`-rene; printf-argumenter matcher;
guard-steg/permissions/secrets/alert-gate uendret; cron-grenen
effekt-ekvivalent med gammel oppførsel (varsel-body byte-identisk for prod);
scope = nøyaktig kontraktens tre filer. Empirisk: typer generert read-only fra
BEGGE prosjekter via MCP — begge byte-identiske med committet
`lib/database.types.ts`, så begge grener er grønne i dag.

### Funn (signaturer)

| # | Signatur | Innhold |
|---|----------|---------|
| 1 | `docs/loops/ci-vakta.md + cron-fiks-instruks` | Ny §6-cron-bullet sa «Fiks ved rødt: npm run gen:types og commit» — men den dominerende årsaken til rød cron etter denne endringen er nettopp staging→prod-vinduet (§6b-situasjonen), der gen:types stripper staging-kolonner main kompilerer mot og knekker tsc. Trengte carve-out som ruter til §6b. |
| 2 | `schema-drift.yml + gates/dispatch-bevis` | Kontraktens gate (dispatch `target=staging` fra PR-branch) var verken kjørt eller flagget som gap. Presedens `.forge/evaluations/673-ci-schema-drift-gate.md` (K3) tilsier at dispatch-fra-branch kan være utilgjengelig før merge — da gjelder kontraktens fallback: eksplisitt gap-notat i PR-body + post-merge-dispatch. |

### Fikser etter runde 1

- Funn 1: cron-bulleten i `ci-vakta.md` §6 har nå eksplisitt §6b-carve-out
  (sjekk om merget migrasjon venter på prod FØR regen; da er fiksen
  prod-påføring med eier, aldri gen:types).
- Funn 2: håndteres ved levering — branch pushes, dispatch med `target=staging`
  forsøkes empirisk fra PR-branchen; utfallet (bevis eller dokumentert gap)
  føres i PR-body/kommentar. Resultat noteres i runde 2.

### Reviewer-funn utenfor scope (→ eget issue før merge, per CLAUDE.md)

- `docs/superpowers/specs/2026-06-18-uat-test-environment-design.md:154` sier
  «gen:types + schema-drift forblir prod-pekende … skal ikke endres» — denne
  PR-en reverserer halve beslutningen; decision record trenger sporlinje.
- `.github/workflows/migrations-gate.yml:1–2` header sier «schema-drift.yml
  COMPARES generated types against prod» — nå kun delvis sant.
