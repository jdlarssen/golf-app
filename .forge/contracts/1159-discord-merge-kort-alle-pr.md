# Spec: Discord merge-kort for ALLE grønne PR-er (#1159, Del A)

**Issue:** #1159 · **Branch:** claude/serene-lovelace-edd89e · **Milestone:** 13 (Selvkjørende loops)

Eier-beslutning 2026-07-08 (forge:auto-diskusjon): **Del A leveres nå som egen PR;
Del B (Playwright-skjermbilder mot staging) bygges som neste PR.** Denne kontrakten
dekker KUN Del A. #1159 forblir åpen til Del B lander (PR-en bruker `Part of #1159`,
ikke `Closes`).

## Problem

Merge-knappen i Discord finnes i dag kun på PR-er som **morgenbriefen** (cloud-routine,
06:30) tilfeldigvis surfacer. PR-er fra interaktive økter (som #1153–#1158) må eieren
inn i GitHub for å merge — brudd på grunnregelen «styr fra mobilen» (#1073). Målet:
**enhver** PR som blir CI-grønn får automatisk ett Discord-kort med merge-knapp, uansett
opphav (natt-runner, CI-vakt, dok-avstemmer, interaktiv økt).

## Research Findings (scoutet i kodebasen)

- **Mottaker-siden er ferdig og gjenbrukes uendret:** `app/api/discord/interactions/route.ts`
  + `lib/loops/discordActions.ts` håndterer allerede `merge_pr:<N>` — ed25519-signatur,
  eier-allowlist, sjekker CI grønn, av-drafter, rebase-merger. Kortet trenger bare posere
  en knapp med `custom_id: merge_pr:<N>`.
- **Sender-siden finnes IKKE som repo-kode.** Morgenbriefens knappe-posting bor i
  routine-prompten (claude.ai/code/routines), ikke i repoet. `discord-notify.sh` er
  webhook-only (ren tekst, ingen komponenter). Denne posting-logikken er derfor ny.
- **Discord-constraint:** vanlige webhooks kan ikke sende komponenter (knapper) — kortet
  MÅ postes av bot-identiteten via `POST /api/v10/channels/{id}/messages`
  (`Authorization: Bot …`). Samme constraint som #1124.
- **CI-konvensjon:** GitHub Actions kaller bash-skript (`prod-vakt.yml` → `.github/scripts/*.sh`),
  og `npx --yes <tool>` er etablert (`dup`-scriptet). Testbar logikk bor i `lib/loops/*.ts`
  med vitest (`discordActions.ts`). `**/*.ts` typecheckes; eslint globber kun
  `lib/`/`app/`/`components/`.
- **PR-body-format (CLAUDE.md):** `Closes #N\n\n<tagline fra CHANGELOG>` — taglinen er
  ferdig-skrevet norsk brukercopy. Deterministisk kilde for kortets «norske oppsummering»;
  ingen LLM-kall (og ingen API-nøkkel) trengs i CI.
- **`check_suite`-trigger** kjører kun workflow-fila som ligger på default-branch → live-
  aktivering er post-merge + eier-secret-gatet (samme presedens som #1124/#1076).

## Design

1. **`lib/loops/prCard.ts` (ny, ren logikk — vitest):**
   - `extractPrSummary(body): string | null` — første meningsbærende linje i PR-body-en,
     hopper over `Closes/Refs/Part of/Fixes #N`, `🤖`-linjer og markdown-støy. Null hvis
     ingen brukbar tagline.
   - `classifyChecks(runs): 'pending' | 'red' | 'green'` — `pending` hvis noen ikke er
     `completed` ELLER lista er tom (ingen CI registrert enda → ikke kort enda); `red` hvis
     noen har konklusjon i {failure, cancelled, timed_out, action_required}; ellers `green`.
   - `buildCardPayload({ pr, summary }): DiscordMessage` — Discord-melding-JSON: `content`
     (tittel + evt. draft-merkelapp + oppsummering + PR-lenke) og `components` med én
     action-row: grønn merge-knapp (`custom_id: merge_pr:<N>`, label «✅ Merge PR #N») +
     lenke-knapp til PR-en (style 5). Draft-PR får synlig «📝 Draft»-merkelapp i teksten.
   - `CARD_LABEL = 'discord:merge-kort'` — dedup-labelen.
2. **`scripts/loops/post-pr-card.ts` (ny, tsx-runner):**
   - Leser `GITHUB_EVENT_PATH` (check_suite-payload → kandidat-PR-nummer + head_sha) eller
     `PR_NUMBER`-env (workflow_dispatch / lokal dry-run).
   - Per kandidat-PR: GET PR (fetch mot api.github.com, `Authorization: Bearer $GITHUB_TOKEN`)
     → gate: `state === 'open'`, `classifyChecks(check-runs på head_sha) === 'green'`,
     `CARD_LABEL` IKKE allerede på PR-en. Alle gates passert → post kort til Discord →
     legg `CARD_LABEL` (dedup). Draft-PR-er FÅR kort (natt-runner leverer alltid draft).
   - `DRY_RUN=1`: logg payload-en i stedet for å poste (lokal + CI-verifisering uten
     Discord-secret). Best-effort: håndterte feil (manglende config, Discord-API-feil)
     logges og gir exit 0; kun uventede exceptions gir non-zero (fanges av failure-alert).
3. **`.github/workflows/discord-pr-card.yml` (ny):**
   - `on: check_suite: [completed]` + `workflow_dispatch` (input `pr`).
   - `permissions: contents: read, pull-requests: write, issues: write, checks: read`.
   - Guard-steg: mangler `DISCORD_BOT_TOKEN`/`DISCORD_CHANNEL_ID` → `::notice::` + exit 0
     (samme mønster som prod-vakt).
   - `npx --yes tsx scripts/loops/post-pr-card.ts` med `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`,
     `DISCORD_CHANNEL_ID`, `GH_REPO`.
   - `on: failure()` → dedupet CI-vakt-alarm-issue (samme mønster som prod-vakt.yml).
4. **Docs:** `docs/loops/discord-pr-kort.md` — hva Action-en gjør, trigger, dedup-labelen,
   og eier-oppsett (secrets). Loop-oversikten (docs/loops/*) får en peker.

## Edge Cases & Guardrails

- **Aldri prod:** Del A rører ikke prod — leser kun PR/checks (GITHUB_TOKEN) og poster til
  Discord. Ingen migrasjon, ingen DB-skriv.
- **Menneske-porten står:** kortet gir knappen; INGEN auto-merge. Merge-endepunktet krever
  fortsatt eierens knappetrykk + verifiserer CI grønn på nytt.
- **Dedup:** `CARD_LABEL` gjør at ett kort postes per PR. `check_suite: completed` fyrer per
  suite; på tidlige fyringer er ikke alt grønt (`pending` → ingen post, ingen label), først
  ved siste (alt grønt) postes kortet + label; senere fyringer ser labelen → skip.
  Kjent smal race: to suiter som blir grønne samtidig kan gi dobbelt kort (mildt, sjeldent);
  akseptert for v1 fremfor å risikere stille tapt kort (post-så-label, aldri label-så-post).
- **Tom check-liste** (ingen CI registrert) klassifiseres `pending` → kort utsettes til CI
  finnes; carder aldri en PR uten grønn CI.
- **Draft-PR-er får kort** (badge synlig); merge-knappen av-drafter (endepunktet gjør det).
- **Discord nede / token rotert:** logges, exit 0 (best-effort). Morgenbriefens
  «Discord-speiling feilet»-helselinje er backstop for «kortene sluttet å komme».

## Key Decisions

- **Deterministisk tagline-uttrekk fremfor LLM** for oppsummeringen — taglinen er allerede
  forfattet norsk copy; ingen API-nøkkel i CI, deterministisk og testbar. (Bevisst avvik
  fra forge-default «LLM over heuristikk».)
- **Default `GITHUB_TOKEN`, ikke PAT** — Action-en leser + labler + poster; selve mergen
  skjer i Vercel-endepunktet (som eier `GITHUB_LOOP_PAT`).
- **Label-basert dedup** fremfor kanal-historikk-søk — enkelt, robust, matcher
  `autonomy:ready`-mønsteret.
- **Post-så-label** (ikke label-så-post) — aldri stille tapt kort; dobbelt-kort-race
  akseptert.

**Claude's Discretion:** fil-/funksjonsnavn, kort-layout/tekst, badge-tekster, label-navn.

## Success Criteria

- [x] **A1** `lib/loops/prCard.ts` finnes med `extractPrSummary`, `classifyChecks`,
  `buildCardPayload`, `CARD_LABEL`. (commit a3f5b4d8)
- [x] **A2** Type A-tester (`lib/loops/prCard.test.ts`) dekker: tagline-uttrekk
  (tagline / kun-Closes / null / Refs-linjer hoppes over), `classifyChecks`
  (pending/red/green/tom), og `buildCardPayload` (riktig `merge_pr:<N>`-custom_id +
  knapp-struktur + draft-badge). **`npx vitest run lib/loops/prCard` → 17 passed.**
- [x] **A3** `scripts/loops/post-pr-card.ts` finnes; `DRY_RUN=1 PR_NUMBER=1158` logget
  et gyldig payload med `custom_id: merge_pr:1158`, 📝 Draft-badge og taglinen trukket
  ut av #1158-body-en — **verifisert lokalt mot ekte GitHub-data.**
- [x] **A4** `.github/workflows/discord-pr-card.yml` finnes med check_suite+dispatch-
  trigger, secret-guard, concurrency-per-SHA og failure-alarm; **YAML parset OK (node).**
- [x] **A5** Fulle gates grønne: **typecheck (0 feil) · test (4720 passed) · lint (0 errors)
  · build (success) · guard.test.sh (39/0).**
- [x] **A6** `docs/loops/discord-pr-kort.md` + eier-oppsett-oppskrift (secrets) skrevet.
- [ ] **A7 (eier-aktivering, post-merge — ikke blokkerende for ACCEPT):** eier legger
  `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` som Actions-secrets; en `workflow_dispatch`
  mot en ekte grønn PR poster ett kort med fungerende merge-knapp i Discord.

## Gates

- [x] `npm run typecheck` (0) · `npm test` (4720) · `npm run lint` (0 err) · `npm run build` (ok) · `bash tests/hooks/guard.test.sh` (39/0)

## Out of Scope

- **Del B** (Playwright-skjermbilder av GUI-endringer mot staging) — neste PR, samme issue.
- **Auto-merge** — aldri; kortet gir knappen, eier trykker.
- Video/interaktiv preview, slash-kommandoer, flere brukere/servere.
- Endring av merge-endepunktet eller morgenbriefens egen knappe-posting (består).
