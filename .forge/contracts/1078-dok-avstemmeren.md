# Spec: Dok-avstemmeren — styringsdokumenter mot terrenget

**Issue:** #1078 (epic #1073, nr. 5) · **Branch:** claude/1078-dok-avstemmeren

## Problem

Styringsdokumentene drifter fra virkeligheten uten at noen merker det: CLAUDE.md sier «EKSEKVERER aldri SQL» (utdatert), «40 unit-tester» og «8 tabeller» (reelt: 34), forge-workflow.md anbefaler en søkekommando som returnerer tomt, og schema-ground-truth.md er ikke regenerert siden 2026-06-18. Denne PR-en setter opp loopen (protokoll + markør-seksjon + claims-manifest) OG utfører første kjøring (fersk snapshot + fiks av verifiserte fakta-avvik).

## Design

1. **`docs/loops/dok-avstemmeren.md` (ny):** protokoll for ukentlig read-only kjøring — kanoniske pg_catalog-spørringer (én JSON-spørring, kjøres mot prod OG staging), radtellings-assertions (kjernetabeller MÅ ha policies > 0 — tomt resultat er FEIL, jf. trap 2 anvendt på loopen selv), idempotens-dobbeltkjøring, claims-manifest (etterprøvbare påstander i styringsdokumenter), memory-drift-steg, og den harde regelen: **normative skal/må-regler endres ALDRI automatisk** — kun etterprøvbare fakta; resten → needs-owner-decision-issue. Utfall per kjøring: maks én docs-PR + eventuelle issues; MCP nede/tomt → «kunne ikke verifisere»-issue, aldri stille grønt.
2. **`docs/schema-ground-truth.md`:** generert seksjon mellom markør-kommentarer («GENERERT SEKSJON — ikke rediger for hånd»), innhold fra dagens prod-snapshot: RLS/policies per tabell (34), triggere (14), SECURITY DEFINER-funksjoner (43), CHECK-tellinger per tabell (83 totalt). Staging↔prod-avvik notert.
3. **Første kjørings fakta-fikser (docs-only):** CLAUDE.md — SQL-tilgangs-claimen, «40 unit-tester» ×2 (omskrives tall-løst), «8 tabeller»+migrasjonstall (omskrives målbart/stabilt); forge-workflow.md — primær kontrakt-søkemetode byttet til per-issue-iterasjon (gh search in:comments returnerer tomt).
4. **Issues fra kjøringen:** (a) needs-owner-decision: toContain-tersklene har tre tall i tre hjem (3 per test i CLAUDE.md/test-discipline, 5 per fil i test-discipline, 10 per commit udokumentert i pre-commit) — «en regel har ett hjem»-avklaring; (b) staging-avvik: funksjonen `rls_auto_enable` finnes i prod men ikke staging.

## Key Decisions

- Snapshot-seksjonen inneholder tellinger + navnelister, ikke fulle CHECK-definisjoner (de håndskrevne seksjonene dekker de viktige narrativt; kanonisk spørring gir fasiten on-demand). Holder seksjonen regenererbar og reviewbar.
- Tall-claims i CLAUDE.md omskrives til stabile formuleringer i stedet for å vedlikeholdes — mindre churn.
- Ukentlig cloud-routine settes opp post-merge (oppskrift på issuet, samme mønster som #1075).

**Claude's Discretion:** seksjonsformat, manifest-format.

## Success Criteria

- [ ] Protokollfilen dekker: kanonisk spørring, begge miljøer, radtellings-assertions, idempotens-krav, claims-manifest, memory-steg, normativ-regel-vernet, utfalls-reglene og fail-closed.
- [ ] schema-ground-truth.md har markør-avgrenset generert seksjon med dagens målte tall (34/83/14/43) og staging-avviket notert.
- [ ] De fire+ verifiserte fakta-avvikene er fikset i CLAUDE.md/forge-workflow.md; ingen normative regler endret.
- [ ] Begge issues (toContain-beslutning, rls_auto_enable-avvik) opprettet med milestone.
- [ ] Docs-only-diff (git diff --stat kun .md); commit-bodies siterer bevis-spørring/kommando der fakta endres.
- [ ] Runde-historikk per #1077-konvergensreglene skrives for denne forge:auto-kjøringen (aktiverer #1077).

## Gates

- [ ] `git -C <worktree> diff --stat origin/main..HEAD` viser kun .md-filer
- [ ] `cd <worktree> && npx vitest run lib/scoring` grønn (fasit-kommandoen som erstatter 40-tester-claimen)

## Files Likely Touched

docs/loops/dok-avstemmeren.md (ny) · docs/schema-ground-truth.md · CLAUDE.md · docs/forge-workflow.md

## Out of Scope

- Selve routine-opprettelsen (ops post-merge, eier-steg)
- Fiks av rls_auto_enable-avviket (eget issue — DB-endring, ikke docs)
- toContain-regel-harmonisering (eierbeslutning)
- Auto-oppdatering av memory-filer (memory-steget LESER drift-flagg og lager doc-fikser)
