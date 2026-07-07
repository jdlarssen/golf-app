# Spec: Prod-vakta — prod-telemetri inn i loopene (loop 8)

**Issue:** #1117 (epic #1073-oppfølger, milestone 13) · **Branch:** claude/prod-vakta

## Problem

Loopene spiser i dag kun fra repoet — prod-runtime-feil og nye security-advisories oppdages av mennesker (eller ikke). I en ferieuke er prod i praksis uovervåket. Eier har gitt eksplisitt mandat: systemet skal kunne finne og fikse bugs selv, uten at han er på vakt.

## Research Findings

- Management API-endepunktene er dokumentert og verifisert: `GET /v1/projects/{ref}/advisors/security` (v1-get-security-advisors) og `GET /v1/projects/{ref}/analytics/endpoints/logs.all` (v1-get-project-logs-all). Advisors-kilden empirisk testet via MCP 2026-07-07 — returnerer strukturerte lints med `cache_key` (inkl. kjente INFO-funn for de bevisst nedlåste admin-/agent-tabellene → baseline nødvendig fra dag 1).
- `SUPABASE_ACCESS_TOKEN` finnes som Actions-secret (schema-drift bruker den; dagens kjøring beviste at steget kjører) — men er en prod-kapabel credential og skal ALDRI inn i routine-miljøer (synlige for miljø-redaktører). Derfor to-trinns arkitektur: Actions fanger signal, eksisterende loops diagnostiserer.
- Cloud-routines mangler Supabase MCP → CI-vaktas sky-kjøringer diagnostiserer fra kode alene; loggdetaljer hentes i interaktive økter (issuet er handoff).

## Design

1. **`.github/workflows/prod-vakt.yml`:** daglig cron 03:30 UTC (før Morgenbriefen) + dispatch. Token-guard som schema-drift (skip m/notice uten secret). Failure-steg som main-verify (dedupet «CI-vakt: prod-vakt-workflowen rød»).
2. **`.github/scripts/prod-vakt.sh`:** advisors diffet mot baseline + postgres-feiltelling (ERROR/FATAL/PANIC, 24 t). Signal → dedupet issue «Prod-vakt: signaler i prod-telemetrien» (labels `prod-vakt`+`bug`, milestone 9). Lesefeil → dedupet «fikk ikke lest telemetri»-issue + exit 1 (fail-closed — uovervåket prod er et funn). **Personvern: kun tellinger og advisory-nøkler i issues, aldri rå logglinjer.**
3. **`docs/loops/prod-vakta-baseline.txt`:** seedet med dagens aksepterte advisory-nøkler; endres kun via PR med begrunnelse.
4. **`docs/loops/prod-vakta.md`:** protokoll + v2-kandidater (auth-logger, Vercel via VERCEL_TOKEN, performance-advisors — bevisst utsatt).
5. **`docs/loops/ci-vakta.md` §7:** prod-vakt-issues inn i CI-vaktas oppdagelse — kode-diagnose i sky, stående bug-fullmakt for små klare fikser, baseline-forslag via PR, ellers norsk handoff-kommentar.
6. **Label `prod-vakt`** opprettes.

## Key Decisions

- **Actions, ikke ny routine:** prod-tokenen bor der den alt bor; ingen ny credential-flate, ingen femte routine å drifte. CI-vaktas eksisterende timelige kjøring arver diagnosejobben via protokollen.
- **Kun tellinger i issues:** strengeste personvern-tolkning uavhengig av repo-synlighet.
- **v1 = advisors + postgres-count:** auth-logg-spørringens skjema er uverifisert — utsatt fremfor å risikere fail-closed-støy fra dag 1.
- **Bugs selvfikses, features aldri:** stående bug-fullmakt (CLAUDE.md) gjelder; alt som ligner produktbeslutning eskaleres.

## Success Criteria

- [ ] Workflow + skript finnes; YAML og bash parser (`bash -n`); token-guard, failure-steg, dedupe og milestone-via-nummer på plass (fil-lesing).
- [ ] Skriptets issue-tekster inneholder aldri rå loggdata (kun tellinger/nøkler) — verifisert ved lesing av alle BODY-konstruksjoner.
- [ ] Baseline seedet med dagens faktiske advisory-nøkler (fra dagens MCP-kjøring), med kommentar-header som forklarer regelen.
- [ ] prod-vakta.md dekker arkitektur/kilder/personvern/utfallstabell/v2; ci-vakta.md §7 dekker diagnose-stigen.
- [ ] Første reelle kjøring (dispatch etter merge): grønn med «alt stille» ELLER korrekt filet signal-issue — aktiveringskriterium, verifiseres post-merge.

## Gates

- [ ] `bash -n .github/scripts/prod-vakt.sh` + YAML-parse av workflowen
- [ ] `bash tests/hooks/guard.test.sh` (uendret grønn)

## Out of Scope

- Auth-/Vercel-/performance-kilder (v2, dokumentert i protokollen)
- Endring i nattkjørerens kø-regler (prod-vakt-bugs går via CI-vakta/interaktivt, ikke autonomy:ready)
- Automatisk baseline-oppdatering (alltid PR)
