# Evaluering: Draft-først i økt-PR-flyten (#1516)

**Verdikt: ACCEPT**

Evaluert 2026-08-08 av fersk-kontekst evaluator. All evidens under er produsert
uavhengig i denne økten (kommandoer kjørt selv, filer lest selv) — ikke gjenbrukt
fra byggerens påstander. Range: `f470ce0f..HEAD` (ccf2d1ea kode, 793f0861 docs,
aa6778af bokføring, 47829748 docs-fix).

## Per kriterium

### K1 — decide noop-er drafts: PASS

- `scripts/loops/decide-pr-card.ts:149` — `if (pr.draft) return noCard(...)` ligger
  ETTER åpen-sjekken (:145) og FØR CARD_LABEL-dedup (:150), CI-oppslaget (:152→) og
  klassifiseringen (:187). Gaten treffer dermed alle triggere (workflow_run,
  ready_for_review, dispatch) siden den bor i felles main-sti.
- Lokal decide-røyk (read-only) mot ekte draft-PR #1518, Node 22:
  `[decide-pr-card] PR #1518 er draft — økta jobber fortsatt — ingen kort.`
  Plan-fil: `{"outcome":"noop","isGui":false,"headSha":null,"pr":null,"changedFiles":[]}`.

### K2 — mergePullRequest av-drafter aldri: PASS

- `lib/loops/autoMerge.ts:170` — `if (pr.draft) return { ok: false, reason: 'PR er
  draft — økta jobber fortsatt' }` (etter åpen-sjekk :165, før check-runs/PUT).
- `grep -rn markPullRequestReadyForReview lib/ scripts/` → nøyaktig ett treff:
  `lib/loops/discordActions.ts:276` (mottakeren). `autoMerge.ts` = 0 treff.
- Ikke-målet holdt: `discordActions.ts` er IKKE i branch-diffen
  (`git diff --stat f470ce0f..HEAD` lister den ikke) — mottakerens eier-gated
  av-draft er uendret. `ghClient.ts`-endringen er kun en kommentar-oppdatering
  (graphql-metoden beholdes for mottakerens bruk).
- Fallback-mottaket finnes: `scripts/loops/post-pr-card.ts:165–167` — `{ok:false}` →
  `auto-merge falt tilbake til knapp-kort — ${result.reason}` (eksisterende sti).

### K3 — kortet fyrer på ready: PASS

js-yaml-parse fra node_modules (kjørt selv) bekrefter:
- triggers: `["workflow_run","pull_request","workflow_dispatch"]`;
  `pull_request: {"types":["ready_for_review"]}` (yml :26–27).
- concurrency.group (:41): `workflow_run.head_sha || pull_request.head.sha || inputs.pr`
  — ready-eventet serialiseres per head-SHA, samme gruppe som workflow_run på samme SHA.
- checkout.ref (:74): samme tre-veis fallback — pull_request-eventet checker ut PR-head.
- Decide-env: `PR_NUMBER: ${{ github.event.pull_request.number || inputs.pr }}` (:101);
  `WAIT_FOR_CHECKS`-uttrykket (:106) inkluderer `github.event_name == 'pull_request'`.

### K4 — tester oppdatert (Type A): PASS

- `npx vitest run lib/loops` (Node 22): **4 filer, 163 passed, 0 failed** (760 ms).
- `lib/loops/autoMerge.test.ts:238–244` — «draft-PR → fallback-signal, ingen av-draft,
  ingen merge (#1516)»: asserter `{ok:false, reason:'PR er draft — økta jobber fortsatt'}`
  OG `calls.map(method) === ['GET']` — beviser at verken GRAPHQL eller PUT nås.
- Diffen bekrefter at de to gamle av-draft-testene («av-draftes via GraphQL før merge»,
  «av-draft-feil → fallback») er fjernet. Ingen classify-endringer (draft-gaten bor
  i decide, `classifyAutoMerge` urørt).

### K5 — forge-workflow.md: PASS

`docs/forge-workflow.md:21–38` — ny seksjon «Draft-først i økt-PR-flyten (#1516)» med
de fire numererte stegene: (1) `gh pr create --draft`, (2) all bokføring committet og
pushet, (3) `ls-remote`-sjekk remote = lokal HEAD, (4) `gh pr ready` som øktas siste
handling. Hvorfor-avsnittet refererer #1499/#1513/#1515-hendelsen. Stemmer med koden.

### K6 — discord-pr-kort.md: PASS

Lest hele fila mot koden slik den ER nå:
- Steg 1 (:35–48): `ready_for_review`-triggeren + at decide venter på checks ved
  ready-flipp — stemmer med yml :26–27 og :106.
- Steg 2 (:49–51): «ikke draft (#1516, draft = 'økta jobber fortsatt')» i gate-lista.
- Steg 4 (:63–64): merge-stien «re-verifiser åpen + ikke draft (fail-closed, #1516)».
- «Tre utfall» §1 (:79): draft i noop-lista.
- Ny seksjon «Draft = 'økta jobber fortsatt' (#1516)» (:105–122) inkl. mottaker-unntaket
  (eier-trykk av-drafter fortsatt — stemmer med `discordActions.ts:276`).
- Fix-protokoll: draft-noop-rad (:200–201) + «draft ved re-sjekk (#1516)» i
  fallback-raden (:210–213). Ingen stale utsagn om av-draft i auto-merge-stien funnet
  (47829748 fjernet den siste); :72 beskriver korrekt at KNAPPEN av-drafter.

### K7 — CLAUDE.md: PASS

`CLAUDE.md:139–142` (worktree) — «**Draft-først (#1516):** … opprettes PR-en som draft
(`gh pr create --draft`); `gh pr ready` er øktas siste handling … Detaljer:
`docs/forge-workflow.md`.» Plassert i «Branch + PR-flyt» steg 3 som kontrakten krever.

### K8 — dogfood: PASS

- `gh pr view 1518 --json isDraft,state` → `{"isDraft": true, "state": "OPEN"}` —
  PR-en er fortsatt draft ved evaluering, som kontrakten foreskriver (ready-flippen
  skal være øktas SISTE handling, ETTER dette verdiktet — at den ikke er utført er
  korrekt, ikke en mangel).
- K1-røyken over ER dogfood-beviset: decide mot #1518 → noop mens draft.

## Gate-resultater (kjørt selv, Node 22)

| Gate | Resultat |
|---|---|
| Unit: `npx vitest run lib/loops` | 4 filer, 163 passed, 0 failed |
| Full: `npm run build` (pipefail) | EXIT=0 |
| YML: js-yaml-parse av discord-pr-card.yml | alle 5 uttrykk verifisert (triggers/concurrency/checkout/PR_NUMBER/WAIT_FOR_CHECKS) |
| Decide-røyk: PR #1518 (read-only) | outcome=noop + draft-logglinje |

## Kant-tilfeller (vurdert mot koden)

| Input | Håndtert? | Evidens |
|---|---|---|
| draft=true ved decide | JA | decide :149 før label (:150)/CI (:152→); røyk mot #1518 |
| draft=false | JA | gaten returnerer kun på draft; resten av flyten uendret i diffen |
| draft=true ved merge-re-sjekk | JA | autoMerge.ts:170 `{ok:false}` → post-pr-card.ts:165–167 knapp-kort; testlåst (:238) |
| ready_for_review med pending checks | JA | WAIT_FOR_CHECKS-uttrykk (:106) + waitForChecksToSettle 21×30 s (decide :167–172) |
| ready_for_review på allerede kortet PR | JA | CARD_LABEL-dedup decide :150 |
| workflow_run på bokførings-push mens draft | JA | prForSha (:65) løser PR-en → draft-gate :149 noop-er — #1516-racen lukket |
| workflow_dispatch mot draft | JA | PR_NUMBER via inputs.pr → samme gate + logglinje |
| Fork-PR ready (read-only token) | JA | fork-pull_request får ikke secrets → guard-steget (yml :55–66) `run=false` → skip; GITHUB_TOKEN er uansett read-only → merge fail-closed |

## Funn utenfor kriteriene

Ingen blokkerende. Observasjoner:
- `ghClient.ts`-diffen er kommentar-only (dokumenterer hvorfor graphql-metoden beholdes) — ryddig.
- Versjonsbump (package.json 1 linje) følger fix-commit-regelen; hooks passert.
- Concurrency-gruppen deles korrekt mellom workflow_run- og pull_request-eventer på samme
  head-SHA — ingen dobbelt-kort-vindu introdusert av den nye triggeren.
