# Spec: Dok-avstemmerens skjema-snapshot flyttes til Actions

**Issue:** #1122 (milestone 13) · **Branch:** claude/natt-1122-… (natt-egnet — ren repo-kode)

## Problem

Dok-avstemmerens steg 1 (skjema-snapshot fra prod+staging) krever pg_catalog-tilgang som bare finnes via Supabase MCP (interaktivt) eller Management-API (token som ALDRI skal inn i routine-miljøer). Sky-routinen kan ikke kjøre steget; om ~1 uke melder den fail-closed «fikk ikke verifisert». Samme løsningsmønster som prod-vakta (#1117): Actions har tokenen.

## Design

1. **`.github/workflows/dok-skjema.yml` (ny):** ukentlig cron (søndag 04:00 UTC — før routine-kjøringen) + dispatch. Token-guard + failure-varsel-steg (dedupet issue + Discord-ping), mønster kopiert fra prod-vakt.yml. `permissions: contents: write, issues: write, pull-requests: write`.
2. **`.github/scripts/dok-skjema.sh` (ny):** kjører den KANONISKE spørringen fra docs/loops/dok-avstemmeren.md steg 1 mot prod OG staging via `POST /v1/projects/{ref}/database/query` (Management-API, samme som MCP bruker — kun SELECT-er). Assertions fra protokollen gjelder: kjernetabeller med policies > 0, tabelltall ≥ 30, idempotens-dobbeltkjøring mot prod (byte-identisk JSON) — rød assertion → fail-closed-issue, aldri stille.
   - Regenerer innholdet mellom `GENERERT-SEKSJON-START/-SLUTT` i docs/schema-ground-truth.md (samme format som i dag — RLS-tabell, CHECK-tellinger, trigger-liste, secdef-liste, staging-avvik).
   - **Diff → docs-PR** på `claude/dok-skjema-<dato>`-branch («docs(schema): ukentlig regenerering», Refs #1078-mønster med bevis-spørring i body) — ALDRI direkte push til main (pre-push-hooken finnes ikke i Actions; disiplinen må ligge i skriptet: alltid branch+PR). Ingen diff → grønn exit med logglinje.
   - Prod↔staging-avvik utover kjente → dedupet issue (som rls_auto_enable-saken #1105).
3. **`docs/loops/dok-avstemmeren.md`:** steg 1 omskrives — sky-routinen LESER Actions-jobbens siste kjøring (`gh run list --workflow dok-skjema.yml`) og verifiserer ferskhet (< 8 dager) i stedet for å spørre databasene selv; eldre → varsel-issue. Interaktive økter kan fortsatt kjøre spørringen direkte via MCP.

## Key Decisions

- Management-API-endepunktet kan kjøre vilkårlig SQL — skriptet hardkoder den kanoniske SELECT-spørringen og tar INGEN input (ingen injeksjonsflate).
- PR fremfor direkte commit til main: Actions omgår git-hookene, så branch+PR-disiplinen håndheves i skriptet selv.
- Diff-guard: `git diff --stat` i jobben skal vise KUN docs/schema-ground-truth.md — alt annet → abort + issue.

## Success Criteria

- [ ] Workflow + skript finnes, `bash -n` + YAML-parse grønne; token-guard, fail-closed-assertions, idempotens-sjekk, diff-guard og dedupede issues på plass (fil-lesing).
- [ ] dok-avstemmeren.md steg 1 peker på Actions-jobben med ferskhetskrav; routine-prompten trenger INGEN endring (den leser protokollen).
- [ ] `bash tests/hooks/guard.test.sh` uendret grønn; docs+workflow-only-diff.
- [ ] Første dispatch etter merge: grønn med «ingen diff» ELLER korrekt docs-PR — aktiveringskriterium, lukker #1122.

## Gates

- [ ] `bash -n .github/scripts/dok-skjema.sh` + YAML-parse
- [ ] `bash tests/hooks/guard.test.sh`

## Out of Scope

- Endringer i claims-manifest-/memory-stegene (kun steg 1 flyttes)
- Auto-merge av regenererings-PR-en (eieren merger, som alltid)
