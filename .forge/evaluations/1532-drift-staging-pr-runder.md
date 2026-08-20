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

## Runde 2 — fiks-verifisering → ACCEPT

Funn-verifisering er objektiv (GitHub Actions-kjøringer — samme bevisform som
#673-presedensen), ikke en ny gjennomlesnings-runde:

| Funn | Bevis | Resultat |
|------|-------|----------|
| 1 (`ci-vakta.md + cron-fiks-instruks`) | Commit `68fad11`: cron-bulleten ruter nå §6b-situasjonen (merget migrasjon venter på prod) til prod-påføring med eier og forbyr gen:types der; gen:types kun når ingen migrasjon venter. | LUKKET |
| 2 (`schema-drift.yml + gates/dispatch-bevis`) | Plan A viste seg tilgjengelig: dispatch fra PR-branchen ble akseptert (input-skjemaet leses fra ref-en). Run [163](https://github.com/jdlarssen/golf-app/actions/runs/32321257046) `target=staging` → **success**, steg-navn rendret «Regenerate types from staging …». Run [164](https://github.com/jdlarssen/golf-app/actions/runs/32321270528) `target=prod` → **success**, «Regenerate types from prod …». Begge grener live-bevist; byggerens step-name-`steps`-kontekst-usikkerhet også avkreftet i praksis. | LUKKET (uten gap) |

Suksesskriterier: (1) staging-grenen grønn live (run 163; pull_request-event
mapper til samme gren, shell-tabelltestet av byggeren for alle 5
event/input-kombinasjoner — full pull_request-kjøring skjer naturlig på neste
migrasjons-PR); (2) prod-default bevist live (run 164) + cron-gren
effekt-ekvivalent (runde 1); (3) målnavn i meldinger bevist i steg-navnene på
run 163/164; (4) docs oppdatert inkl. runde-1-carve-out. Pre-push
verify-gaten (typecheck + lint + full vitest) passerte ved push.

**Verdikt: ACCEPT** → videre til kryss-modell-gaten (Steg 4.5).
