# Spec: Stagingbevis-porten — PR-er verifiserer seg selv ende-til-ende på staging

**Issue:** #1076 (del av epic #1073 «Selvkjørende loops», bygges som nr. 3)
**Branch:** claude/1076-staging-verify

## Problem

«Bruker-synlige fikser MÅ verifiseres på staging før merge» er den viktigste uhåndhevede mandatory-regelen i CLAUDE.md — den avhenger i dag av at noen husker å klikke gjennom flyten. Dette gjør regelen til en selvkjørende port: en skill som tar et PR-nummer og driver den berørte flyten på staging til hvert akseptansepunkt er *bevist* med tre uavhengige orakler, og som poster beviset på PR-en. Det er forutsetningen for at eieren kan godkjenne PR-er fra mobilen, og for at Nattkjøreren (#1079) kan levere ferdig-verifiserte draft-PR-er.

## Research Findings

- **Cloud routines mangler preview_*-verktøyene** (desktop-only) — skillet er derfor **interaktiv v1** for desktop-økter; sky-varianten (playwright-drevet, gjenbruker e2e-riggen som allerede kjører mot staging i CI) designes i #1079. Avvik fra issue-teksten nevnes i closing-kommentar.
- All staging-infrastruktur finnes: `torny-staging` launch-config, OTP-mint-oppskrift i CLAUDE.md, `preview_*`-verktøy, Supabase MCP mot staging-ref (`snwmueecmfqqdurxedxv`), prod-brannmur (#1074) som uansett stopper prod-skriv.
- bash-guard har allerede `gh pr merge`-case (squash-deny) — REMIND-utvidelsen legges i samme case; fixtures finnes for squash (deny) og må utvides med plain-merge (context).

## Design

### 1. `.claude/skills/staging-verify/SKILL.md` (ny)

Skill som tar et PR-nummer og kjører autonomt i en desktop-økt:

0. **Preconditions (fail-closed):** `.env.staging.local` finnes, Node 22, `torny-staging` i launch-config. Mangler noe → label `needs-manual-qa` + norsk kommentar, aldri stille skip.
1. **Akseptansepunkter:** les PR-body → `Closes #N` → hent punkter fra issuets kontrakt/ferdig-kriterier. Mangler kontrakt → utled punktene fra PR-diff + CHANGELOG-linjen og noter antagelsen i kommentaren.
2. **Boot + login:** `preview_start("torny-staging")`, OTP-mint per CLAUDE.md-oppskriften (admin eller spiller etter flytens behov). PR-branchen sjekkes ut først (`gh pr checkout`).
3. **Prod-vakt før noe skriv:** `preview_network`-assert på at alle Supabase-kall går mot staging-ref. Feil ref → hard stopp, security-issue, avbryt.
4. **Per akseptansepunkt — tre uavhengige orakler:**
   - Snapshot-assertion på `data-testid`/rolle via `preview_snapshot` (aldri norsk copy, aldri skjermbilde-synsing).
   - Console-errors og failed requests tomme (`preview_console_logs`, `preview_network`).
   - SQL-orakel mot staging-DB: SELECT bekrefter at skrivingen traff (0-rader-fella, bug-prevention trap 2).
5. **Fiks-loop:** rød → diagnostiser → fiks i PR-branchen → re-verifiser fra steg 3. Maks **5 iterasjoner eller 45 min**.
6. **Grønn:** post «✅ Staging-verifisert»-kommentar via body-file (per punkt: assertion-navn + orakelresultater), sett label `staging-verified`, rydd egne testdata (rader kjøringen selv opprettet, navnekonvensjon `E2E-…`, kun staging).
7. **Ikke grønn:** label `needs-manual-qa` + norsk kommentar med feiltilstand, feilende steg og ÉN A/B-hypotese. Aldri stille exit, aldri merge.

### 2. bash-guard: REMIND på `gh pr merge`

I eksisterende merge-case: `--squash` → deny (uendret); ellers → `additionalContext`-påminnelse: «bruker-synlig PR (feat/fix)? Sjekk at staging-verified-labelen er satt — kjør staging-verify-skillet hvis ikke». Logges med regel-ID `pr-merge-staging`. **Promotering til DENY er bevisst utenfor scope** — skjer først når vaktloggen viser at porten er stabil (eierbeslutning).

### 3. Fixtures + labels

- Ny fixture: `gh pr merge 5 --rebase --delete-branch` → `context`. Squash-fixturen består uendret (deny vinner over remind).
- Labels `staging-verified` (grønn) og `needs-manual-qa` (oransje) opprettes (ops-steg ved merge).

## Edge Cases & Guardrails

- PR uten bruker-synlig endring (docs/chore): skillet sier det eksplisitt og setter INGEN label — porten gjelder feat/fix.
- Flyt som krever to roller (admin + spiller): skillet logger inn begge via OTP-mint (mønsteret finnes i e2e-riggen).
- Testdata-rydding sletter kun rader kjøringen selv opprettet (E2E-prefiks + kjøringens egen tidsstempel-sporing) — aldri bredt slette-sveip.
- Snapshot-assertions mot `data-testid` kan kreve at PR-en legger til manglende testid-er — det er en legitim fix-loop-iterasjon (og forbedrer appen).
- 45-min-taket måles av skillet selv (starttid noteres i steg 0).

## Key Decisions

- **Interaktiv v1, sky-variant i #1079:** preview_*-verktøyene finnes ikke i cloud routines; å vente på playwright-varianten ville utsette hele porten. Nevnes som avvik.
- **REMIND, ikke DENY, på merge:** opptrapping er evidens-drevet via vaktloggen fra #1074 (samme mønster som milestone-regelen).
- **Skill, ikke subagent-prompt:** skillet kan invokeres av hovedchatten, av Nattkjøreren senere, og manuelt — ett hjem for protokollen.

**Claude's Discretion:** kommentar-malens eksakte format, testid-navnekonvensjoner, hvordan skillet noterer starttid, SQL-orakelets detaljer per flyt-type.

## Success Criteria

- [x] `.claude/skills/staging-verify/SKILL.md` dekker alle stegene 0–7 — evaluator gikk linje-for-linje mot Design-lista (inkl. 0-rader-formuleringen og A/B-hypotese-kravet).
- [x] bash-guard: plain merge → REMIND `pr-merge-staging` (manuelt verifisert regel-ID + loggføring), `--squash` → fortsatt DENY; case-strukturen garanterer deny-presedens. Fixtures består.
- [x] `bash tests/hooks/guard.test.sh` grønn — 39 bestått, 0 feilet.
- [x] `npm run typecheck` og `npm run lint` uendret grønne (kjørt i worktreen med Node 22).
- [ ] Første reelle kjøring mot en ekte feat/fix-PR: PENDING FIRST USE — issuet holdes åpent til skillet er bevist på neste bruker-synlige PR. Labels `staging-verified`/`needs-manual-qa` opprettet 2026-07-07 (evaluator-funn: måtte finnes før første bruk).

## Gates

- [ ] `bash tests/hooks/guard.test.sh` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

## Files Likely Touched

- `.claude/skills/staging-verify/SKILL.md` — ny
- `.claude/hooks/bash-guard.sh` — REMIND-case på gh pr merge
- `tests/hooks/fixtures/bash.json` — ny plain-merge-fixture

## Out of Scope

- Sky-/playwright-varianten av porten (designes i #1079 der den trengs)
- DENY-promotering av merge-påminnelsen (evidens-drevet eierbeslutning senere)
- Automatisk invokering på hver PR (porten kjøres av hovedchat/Nattkjører når PR er bruker-synlig)
- Endring av e2e-@gate-suiten
