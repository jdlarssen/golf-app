# Spec: Guard-suiten — prod-brannmur for Supabase MCP + vaktlogg + bash-guard-fikser

**Issue:** #1074 (del av epic #1073 «Selvkjørende loops», bygges som nr. 1)
**Branch:** claude/competent-feistel-435097

## Problem

Supabase MCP-verktøyene omgår bash-guard totalt — en ubevoktet agent kan kjøre DDL/DML mot prod-prosjektet (`glofubopddkjhymcbaph`) uten at noe stopper den. Dette er den eneste katastrofale feilmoden i selvkjørende-loops-porteføljen (#1073); alt senere autonomi-arbeid (CI-vakt #1075, nattkjører #1079) forutsetter at denne er tettet. Samtidig har bash-guard to kjente defekter som i dag kun er dokumentert som workarounds i agent-memory, og ingen guard-hendelser logges — så det finnes ingen data på hvilke regler som fyrer, falsk-positiv-rate, eller om påminnelser følges.

## Research Findings

- **Claude Code hooks-docs** (code.claude.com/docs/en/hooks, oppdatert 2026-07-04):
  - Matcher er **unanchored JS-regex**; `^mcp__.*__(tool)$` matcher uavhengig av server-segmentet (som varierer per miljø: UUID på desktop, navn i CLI — `.*`-wildcard er dokumentert mønster nettopp for dette).
  - PreToolUse-stdin: `{tool_name, tool_input, cwd, ...}` der `tool_input` er det **rå MCP-argumentobjektet** (f.eks. `{project_id, query}` for execute_sql).
  - `permissionDecision` ∈ `allow|deny|ask|defer`; exit 0 uten output = ingen beslutning.
  - Flere PreToolUse-entries med ulike matchere kjører alle — legg til søsken-entry, ikke rør Bash-entryen.
  - `CLAUDE_PROJECT_DIR` er tilgjengelig i hook-miljøet.
- **Env-varer eksportert i et Bash-tool-kall når IKKE hook-prosessen** (hooks er barn av harness-prosessen, ikke av agent-shellet) → APPROVE_PROD-luken må realiseres som sentinel-fil, ikke in-session `export`.
- **`npm run gen:types` inneholder prod-referansen** (`supabase gen types --project-id glofubopddkjhymcbaph`, package.json:11) og er bevisst tillatt (read-only) → Bash-regelen kan IKKE nekte på ren ref-forekomst; den må målrette connection-strings og skrivende CLI-former.

## Design

### 1. Ny hook: `.claude/hooks/mcp-guard.sh`

Registrert i `.claude/settings.json` som ny PreToolUse-entry med matcher:

```
^mcp__.*__(execute_sql|apply_migration|deploy_edge_function|create_branch|delete_branch|merge_branch|reset_branch|rebase_branch|create_project|pause_project|restore_project)$
```

Read-only-verktøy (list_tables, get_logs, get_advisors, generate_typescript_types, …) matcher aldri → passerer uhindret.

Logikk (PROD_REF=`glofubopddkjhymcbaph`):

1. **Første forsvarslinje før jq:** rå stdin greps for PROD_REF; finnes den ikke → exit 0 (staging og branch-prosjekter passerer alltid; ingen klassifisering nødvendig).
2. **Prod-targeting:**
   - `execute_sql`: tillat kun beviselig read-only query — etter uppercase/trim må den starte med `SELECT`/`WITH`/`EXPLAIN`/`SHOW`, IKKE inneholde skrive-nøkkelord (`INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO |MERGE|VACUUM|REINDEX|CLUSTER|COMMENT|POLICY|REFRESH|SECURITY`), og IKKE ha flere statements (semikolon etterfulgt av mer tekst). Read-only → `allow` + loggkode `allow-prod-readonly`. Alt annet (inkl. tom/manglende query eller feilet parsing) → **DENY, fail-closed**.
   - `apply_migration`, `deploy_edge_function`, `pause_project`, `restore_project` (prod-ref i args) → **DENY**.
   - **Alltid-nekt-klassen** (mål kan ikke knyttes til prosjekt-ref i args, vurderes FØR ref-porten): `merge_branch` (merger TIL prod per definisjon) og `create_project` (org-nivå, koster penger) → **DENY** uansett argumenter.
   - Branch-livssyklus på egne dev-brancher (`reset/rebase/delete_branch` med branch-id, ingen prod-ref) passerer ref-porten — sanksjonert dev-flyt. *(Presisert under bygging etter evaluator-funn: create_project gled ellers stille forbi ref-porten.)*
3. **Eskaleringsluke (engangs):** fil `$CLAUDE_PROJECT_DIR/.claude/approve-prod` som er < 10 min gammel → allow ÉN gang (hooken sletter filen, logger `allow-prod-approved`). I tillegg honoreres `APPROVE_PROD=1` hvis den finnes i hook-prosessens env (eier-startede terminal-økter). Deny-teksten (norsk) forklarer luken: kun etter eksplisitt eier-godkjenning i økten, `touch .claude/approve-prod`, gjenta kallet.

### 2. bash-guard.sh: defekt-fikser + prod-connstring-regler

- **Defekt (a) — substring-falsk-positiv:** DENY/ASK-triggere (`--no-verify`, `--squash`, force-push) matches mot `cmd_stripped` = kommandoen med enkelt- og dobbelt-quotede segmenter fjernet — en PR-body som *nevner* en trigger nekter ikke lenger. Innholds-sjekker som leter INNE i quotede strenger (`Closes #`, `--milestone`) kjører fortsatt mot full kommando.
- **Defekt (b) — prefix-only:** `"gh pr create"*` → `*"gh pr create"*` (fanger `cd x && gh pr create`), konsistent med issue-create-regelen.
- **Nye prod-vakter i Bash** (samme sentinel-/env-luke som mcp-guard):
  - `postgres://`/`postgresql://`-connstring som inneholder PROD_REF → DENY (psql read-only kan ikke klassifiseres trygt — fail-closed).
  - `curl`/`wget`/`psql`/`pg_dump`/`pg_restore` mot `glofubopddkjhymcbaph.supabase.co` → DENY (sanksjonert lese-vei er MCP get_logs/list_tables; gen:types bruker supabase-CLI, ikke curl).
  - `supabase`-CLI med PROD_REF: kun `gen types` og `inspect` tillatt; øvrige subkommandoer (db push, migration, functions deploy, secrets, …) → DENY.

### 3. Vaktlogg (begge hooks)

Én JSONL-linje per beslutning til `$CLAUDE_PROJECT_DIR/.claude/logs/guard-events.jsonl`:

```json
{"ts":"2026-07-05T14:03:22Z","hook":"bash-guard","rule":"no-verify","decision":"deny","prefix":"git commit -m foo --no-ver"}
```

- Logger deny/ask/remind + `allow-prod-readonly`/`allow-prod-approved`. Rene pass-throughs logges IKKE (støyfritt).
- `prefix` = første 80 tegn av kommandoen (bash) eller `tool_name + project_id` (mcp) — **aldri full kommandolinje/SQL** (secrets). Bash-prefiksen redakteres FØR trunkering: userinfo i URL-er (`://user:pw@` → `://***@`), verdier etter apikey/authorization/password/token, og JWT-lignende `eyJ…`-strenger. Harnesset beviser at fixture-hemmeligheter aldri når loggen. *(Skjerpet under bygging etter evaluator-funn: 80-tegns-vinduet kunne ellers fange connstring-passord.)*
- Beviselig non-blocking: `mkdir -p` + append med `|| true`, stderr til /dev/null. Logging-feil skal aldri blokkere et verktøykall.
- `.gitignore`: nye linjer `.claude/logs/` og `.claude/approve-prod`.

### 4. Testharness: `tests/hooks/guard.test.sh` + fixtures

- Ren bash + jq, ingen npm-avhengighet. Fixtures i `tests/hooks/fixtures/*.json`: `{"hook":"bash"|"mcp","expect":"deny"|"ask"|"context"|"none"|"allow","payload":{…}}`.
- Runner piper payload inn i riktig hook-skript (med `CLAUDE_PROJECT_DIR` satt til en temp-katalog), parser stdout-JSON og sammenligner mot `expect`. Etter kjøring asserter den at JSONL-loggen i temp-katalogen har linjer (logging-beviset) og at en fixture med skrivebeskyttet loggkatalog fortsatt gir riktig beslutning (non-blocking-beviset).
- ~24 fixtures:
  - **Prod-skriv → deny (~10):** execute_sql med INSERT/UPDATE/DDL/multi-statement/tom query mot prod; apply_migration mot prod; deploy_edge_function mot prod; merge_branch; Bash psql-connstring; Bash curl REST-write; `supabase db push` med prod-ref.
  - **Legitime → ikke deny (~10):** execute_sql SELECT mot prod (allow); alle skrive-verktøy mot staging-ref (`snwmueecmfqqdurxedxv`); `npm run gen:types` og direkte `supabase gen types --project-id glofubopddkjhymcbaph`; sentinel-fil-luken; force-with-lease.
  - **Regresjon defekt (a)/(b) (~4):** `gh pr create --body "… nevner --no-verify …"` → context (IKKE deny); `cd x && gh pr create` → context; ekte `git commit --no-verify` → fortsatt deny; `gh pr merge --squash` → fortsatt deny.
- **CI:** nytt steg i `verify`-jobben i `.github/workflows/ci.yml` (etter Lint): `bash tests/hooks/guard.test.sh`.

## Edge Cases & Guardrails

- Feilet jq-parsing i mcp-guard når stdin inneholder PROD_REF → DENY (fail-closed), ikke exit 0.
- SQL med skrive-nøkkelord inne i string-literal (f.eks. `SELECT * FROM games WHERE name = 'delete me'`) → falsk DENY, akseptert bevisst (fail-closed; bruk staging eller luken).
- Sentinel-fil eldre enn 10 min → ignoreres (stale approval); slettes etter bruk (engangs).
- Worktrees: loggen lander i hver worktrees egen `.claude/logs/` (CLAUDE_PROJECT_DIR = worktree-rot). Akseptert; mining-fasen (droppet for nå) måtte uansett aggregere.
- Ingen endring i eksisterende regel-atferd utover defekt-fiksene — alle eksisterende triggere dekkes av regresjonsfixtures.

## Key Decisions

- **DENY, ikke ask, på prod-skriv:** ask kan auto-passere i enkelte permission-modes og oppfører seg uforutsigbart headless; hard deny + eksplisitt engangs-luke er fail-closed for ubevoktede kjøringer (hele poenget med #1073).
- **Sentinel-fil som primær luke:** env-eksport fra agent-shellet når ikke hook-prosessen (verifisert mot docs). `APPROVE_PROD=1` i harness-env støttes i tillegg.
- **Logging kun på beslutninger,** ikke alle pass-throughs — loggen skal være lesbar signal, ikke støy.
- **`chore(hooks):`-prefiks på commits** — intern tooling, ingen versjonsbump/CHANGELOG (`[no-changelog]` unødvendig for chore).
- **Avvik fra issue-teksten:** «APPROVE_PROD=1» realiseres som sentinel-fil + env-var (begrunnelse over). Nevnes i closing-kommentaren.

**Claude's Discretion:** eksakt nøkkelord-liste for SQL-klassifisering, fixture-antall utover minimum, loggfelt-navn, runner-outputformat, om hjelpelogikk deles via sourced fil eller dupliseres inline (begge skript skal forbli frittstående kjørbare).

## Success Criteria

- [ ] `bash tests/hooks/guard.test.sh` grønn: 100 % DENY på prod-skriv-fixtures, 0 falske DENY på legitime fixtures — verifiseres ved å kjøre kommandoen.
- [ ] Regresjonsfixtures for defekt (a) og (b) består (kommando-output).
- [ ] Testkjøring produserer beviselig JSONL-linjer, og skrivebeskyttet loggkatalog endrer ikke beslutningen (non-blocking-bevis i runner).
- [ ] `.claude/settings.json` har MCP-matcher-entry; `jq . .claude/settings.json` validerer.
- [ ] `.gitignore` dekker `.claude/logs/` og `.claude/approve-prod` (`git status` viser ikke loggfiler etter testkjøring i repo-rot).
- [ ] CI-steget finnes i ci.yml og er grønt på PR-en.

## Gates

- [ ] `bash tests/hooks/guard.test.sh` passes
- [ ] `npm run typecheck` passes (uendret — ingen app-kode røres)
- [ ] `npm run lint` passes
- [ ] `npx vitest run tests/smoke.test.ts` passes (suite-sanity)

## Files Likely Touched

- `.claude/hooks/mcp-guard.sh` — ny
- `.claude/hooks/bash-guard.sh` — defekt-fikser, prod-connstring-regler, logging
- `.claude/settings.json` — ny PreToolUse-entry med MCP-matcher + statusMessage
- `.gitignore` — `.claude/logs/`, `.claude/approve-prod`
- `tests/hooks/guard.test.sh` + `tests/hooks/fixtures/*.json` — ny testharness
- `.github/workflows/ci.yml` — ett nytt steg i verify-jobben

## Out of Scope

- Ukentlig logg-mining-agent (bevisst droppet i #1073-prioriteringen — les loggen ad hoc)
- Warn→block-promotering av påminnelser (alltid eierbeslutning)
- Post-hoc-verifisering av milestone på opprettede issues (egen liten utvidelse hvis vaktloggen viser behov)
- Endringer i `.githooks/` (pre-commit/commit-msg/pre-push røres ikke)
- Staging-ref-guard (staging-skriv er sanksjonert; kun prod vaktes)
