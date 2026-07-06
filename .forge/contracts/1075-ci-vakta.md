# Spec: CI-vakta — main re-gates etter merge + varsling + fix-protokoll

**Issue:** #1075 (del av epic #1073 «Selvkjørende loops», bygges som nr. 2)
**Branch:** worktree-ci-vakta-1075

## Problem

Repoet mangler branch protection (free tier), og main re-gates aldri etter merge — to hver-for-seg-grønne rebase-merges kan komponere en rød main som ingen ser (CI kjører kun på pull_request). Røde scheduled-kjøringer (schema-drift) dør stille i Actions-fanen. Og når noe først er rødt, krever fiksing i dag et menneske som oppdager det, reproduserer og retter — den sløyfa skal bli selvkjørende (bevist manuelt i #1074-byggingen: CI fanget en GNU/BSD-stat-divergens som ble reprodusert, fikset og re-verifisert for hånd).

## Research Findings

- **Cloud routines** (code.claude.com/docs/en/routines.md, verifisert 2026-07-05): kjører Mac-uavhengig i Anthropic-sky på fersk klone, kan pushe `claude/`-brancher og åpne PR-er under eiers identitet, **min. intervall 1 time** (issue-teksten sa 30 min — justert), trekker abonnementsbruk. Eier har bekreftet at routines-siden er tilgjengelig på kontoen.
- **`github.token` i Actions har ikke `issues: write` by default** — workflows som skal opprette varsel-issues trenger eksplisitt `permissions`-blokk.
- **Milestone-regelen gjelder også Actions-opprettede issues**; tittel-matching er mojibake-utsatt, så issue opprettes via `gh api` med milestone-NUMMER (9 = «Backlog — uplanlagt / scale-triggered»).
- schema-drift.yml self-skipper grønt uten SUPABASE_ACCESS_TOKEN («grønn kan bety kjørte aldri») — utenfor scope å endre skip-atferden her, men fix-protokollen dokumenterer fella.

## Design

### 1. `.github/workflows/main-verify.yml` (ny)

Kopi av verify-jobben fra ci.yml (typecheck + test + lint + guard-hooks, samme rekkefølge) med:
- `on: push: branches: [main]` + `workflow_dispatch`
- `concurrency: main-verify-${{ github.ref }}` med `cancel-in-progress: true` (raske påfølgende merges → kun siste teller)
- **Varsel-steg ved failure:** oppretter GitHub-issue via `gh api` (tittel «CI-vakt: main-verify rød», label `bug`, milestone 9, body med run-URL + commit-SHA). **Dedupe:** hopp over hvis et åpent issue med samme tittel finnes (`gh issue list --search`). `permissions: { contents: read, issues: write }`.

### 2. `schema-drift.yml`: varsel ved rød kjøring

Samme varsel-steg (`if: failure() && github.event_name != 'pull_request'` — PR-feil er synlige på PR-en; det er cron/dispatch-kjøringene som dør stille i dag). Tittel «CI-vakt: schema-drift rød», samme dedupe + permissions.

### 3. `docs/loops/ci-vakta.md` (ny) — fix-protokollen

Protokollen den timelige cloud-routinen følger (og som kan kjøres manuelt i en vanlig sesjon). Innhold:
- **Oppdag:** røde checks på åpne PR-er (`gh pr list` + `gh pr checks`), røde main-verify- og schema-drift-kjøringer (`gh run list`), åpne «CI-vakt:»-issues.
- **Per funn:** reproduser ALLTID i klonen først (`npm ci` + den feilende gaten) — ikke-reproduserbar rød som ble grønn ved re-kjøring = flake-kandidat-issue, teller IKKE som løst. Fiks med `Refs #N`; endring av test-assertions krever begrunnelse i commit-body (ellers forbudt trekk). Maks **3 iterasjoner** per funn.
- **Levering:** push til `claude/`-branch → PR (rød main-verify) eller commit på PR-ens egen branch (rød PR-check, når branchen er `claude/`-prefikset — ellers kommentar med diff-forslag). ALDRI merge. Norsk kommentar med hva som var rødt, årsak, hva som ble gjort.
- **Eskalering:** etter 3 iterasjoner → draft-PR med delarbeid + norsk kommentar med logglinjer og ÉN hypotese eieren kan svare på.
- **Schema-drift rød (v1):** kun varsel-issue videresendes med forklaring på norsk — auto-types-PR krever SUPABASE_ACCESS_TOKEN i routine-miljøet og utsettes til eier har lagt den inn (fella «skip = grønt» dokumenteres).
- **Rekkverk:** prod-brannmuren (#1074) gjelder også i skyen (hooks følger repoet); routine-miljøet skal kun ha staging-nøkler.

## Edge Cases & Guardrails

- Varsel-steget må ikke feile bygget: `continue-on-error: true` på selve varsel-steget (rød CI uten varsel er bedre enn varsel-feil som maskerer rotårsaken — men logg i steget hvis opprettelsen feiler).
- Dedupe-søket matcher på eksakt tittel-prefiks i åpne issues — to ulike røde vakter (main-verify vs schema-drift) gir to separate issues.
- main-verify kjører også på pushes som ikke er merges (direkte push til main er blokkert av pre-push-hooken, men Actions-pushes/reverts finnes) — det er ønsket.
- Fix-protokollen er en docs-fil; routinen refererer den med sti — endring av protokollen krever PR som alt annet.

## Key Decisions

- **Timelig, ikke 30-min:** cloud routines har 1 times minimumsintervall. Varsel-issues (sekunder etter rød kjøring) dekker oppdagelses-gapet mellom routine-kjøringer.
- **Varsel også på main-verify** (issue-teksten nevnte kun schema-drift): rød main er alvorligere enn rød drift — fail-closed-prinsippet krever at ingen rød scheduled/push-kjøring dør stille.
- **Auto-types-PR utsatt til fase 2:** krever SUPABASE_ACCESS_TOKEN i routine-miljø (eier-handling); v1-routinen eskalerer med issue. Nevnes som avvik i closing-kommentaren.
- **Routine-opprettelsen er ops, ikke kode** — skjer post-merge (forsøkes fra sesjonen via /schedule; faller tilbake til kopier-lim-oppskrift til eier).

**Claude's Discretion:** eksakt issue-body-format, gh api-detaljer, concurrency-gruppenavn, protokoll-filens struktur.

## Success Criteria

- [ ] `main-verify.yml` finnes med push-til-main-trigger, samme fire gates som ci.yml-verify, permissions-blokk og dedupet varsel-steg — verifiseres ved fil-lesing + grønn kjøring på main etter merge (run-URL som bevis).
- [ ] `schema-drift.yml` har varsel-steg gated til ikke-PR-events, med permissions-blokk — fil-lesing + `gh workflow view` etter merge.
- [ ] `docs/loops/ci-vakta.md` dekker alle protokoll-punktene over (oppdag/reproduser/iterasjonstak/assertion-vern/flake/eskalering/schema-drift-v1/aldri-merge).
- [ ] Begge workflow-filene er gyldig YAML (parses uten feil) og refererer kun secrets/permissions som finnes.
- [ ] Eksisterende gates uberørte og grønne: `bash tests/hooks/guard.test.sh`, `npm run typecheck`, `npm run lint`.

## Gates

- [ ] `node -e "require('js-yaml')..."` (eller tilsvarende) parser begge YAML-filene uten feil
- [ ] `bash tests/hooks/guard.test.sh` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

## Files Likely Touched

- `.github/workflows/main-verify.yml` — ny
- `.github/workflows/schema-drift.yml` — varsel-steg + permissions
- `docs/loops/ci-vakta.md` — ny (fix-protokollen)

## Out of Scope

- Selve cloud-routine-opprettelsen (ops-steg post-merge, del av issue #1075 men ikke av denne PR-en)
- Auto-regenerering av types ved schema-drift (fase 2, krever SUPABASE_ACCESS_TOKEN i routine-miljø)
- Endring av schema-drift-skippens grønn-uten-token-atferd (dok-avstemmeren #1078 / eier-beslutning)
- Flake-jeger (bevisst forkastet i #1073 — protokollen filer kun flake-kandidat-issues)
