# Kontrakt: Draft-først i økt-PR-flyten (#1516)

**Issue:** #1516 · **Branch:** `claude/auto-1516-3f6be5` · **Skrevet:** 2026-08-07

## Kontekst

Discord-PR-kortet auto-merget PR #1513 (#1499) i det checks ble grønne — mens økta
fortsatt hadde to forge-bokføringscommits på vei gjennom den lokale pre-push-gaten
(3–5 min vindu). Halene måtte cherry-pickes til opprydnings-PR #1515, og `Closes #1499`
fyrte aldri. Andre gang mønsteret treffer.

Issue-designet antok at kortet allerede har en draft-gate («Ingen endring i selve
kort-implementasjonen forventes (draft-gaten finnes)») og foreslo ren prosedyre +
dokumentasjon. **Ground-truth-passet motbeviste premisset:**

- `scripts/loops/decide-pr-card.ts:145–146` gater kun på åpen · dedup-label · CI grønn.
  `pr.draft` hentes, men brukes bare til 📝-badgen.
- `lib/loops/autoMerge.ts:178–184` — `mergePullRequest` **av-drafter aktivt** via GraphQL
  (`markPullRequestReadyForReview`) før merge. Testlåst i `autoMerge.test.ts:238`.
- `.github/workflows/discord-pr-card.yml` har kun `workflow_run` + `workflow_dispatch` —
  `gh pr ready` produserer i dag INGEN event kortet hører. En ren decide-gate ville derfor
  gjort draft-PR-er permanent kortløse (ready re-trigger ikke CI).

Ren dokumentasjon ville altså dokumentert en usann invariant. Kontrakten bygger gaten.

**ASSUMPTION (avvik fra issue-design, dokumenteres i PR + closing):** scope utvides med en
liten kodeendring i decide-gaten, merge-helperen og workflow-triggeren. Ingen produktvalg —
ingen bruker-synlig flate endres; eier kan vetoe på PR-en (#1302).

## Mål

`gh pr ready` blir øktas eksplisitte «jeg er ferdig»-signal:

1. Draft = «økta jobber fortsatt» → kortet gjør INGENTING (ikke kort, ikke label, ikke merge).
2. Ready → kortet fyrer på `ready_for_review`-eventet og klassifiserer som normalt
   (auto-merge eller knapp-kort). Per definisjon finnes ingen haler etter ready.
3. Merge-helperen er fail-closed på draft i stedet for å av-drafte.

## Ikke-mål

- Mottakeren (`lib/loops/discordActions.ts`, knapp-endepunktet #1124) beholder sin
  av-draft: eier-trykk ER menneskeporten. Dokumenteres, endres ikke.
- `prCard.ts` (draftBadge beholdes — fallback-knappkort på merge-race kan vise draft).
- Ingen endring i aldri-lista, valg-markøren eller staging-porten.
- Ingen retroaktiv behandling av eksisterende åpne PR-er.

## Suksesskriterier

- [x] **K1 — decide noop-er drafts:** `decide-pr-card.ts` returnerer `noop` for
  `pr.draft === true` FØR carding/klassifisering/label, med ærlig logglinje
  («draft — økta jobber fortsatt»). Gjelder alle triggere (workflow_run, dispatch,
  ready_for_review). Evidens: file:line + lokal kjøring mot en ekte draft-PR som viser
  `outcome=noop`.
  **EVIDENS:** `scripts/loops/decide-pr-card.ts:149` (gate rett etter åpen-sjekken, før
  CARD_LABEL/CI/klassifisering). Lokal kjøring mot ekte draft-PR #1518 (commit ccf2d1ea):
  `[decide-pr-card] PR #1518 er draft — økta jobber fortsatt — ingen kort.` + plan-fil
  `{"outcome":"noop","isGui":false,"headSha":null,"pr":null,"changedFiles":[]}`.
- [x] **K2 — mergePullRequest av-drafter aldri:** GraphQL-mutasjonen fjernes fra
  `autoMerge.ts`; draft ved re-sjekk → `{ok:false, reason}` → post-steget faller tilbake
  til knapp-kort (eksisterende fallback-sti). Evidens: file:line + oppdaterte unit-tester
  grønne.
  **EVIDENS:** `lib/loops/autoMerge.ts:170` — `if (pr.draft) return { ok: false, reason:
  'PR er draft — økta jobber fortsatt' }`; `grep -c markPullRequestReadyForReview
  lib/loops/autoMerge.ts` = 0 (mutasjonen finnes kun igjen i mottakeren
  `lib/loops/discordActions.ts:276`, tilsiktet). Tester: `npx vitest run lib/loops` →
  4 filer, 163 passed, 0 failed (commit ccf2d1ea).
- [x] **K3 — kortet fyrer på ready:** `discord-pr-card.yml` får
  `pull_request: types: [ready_for_review]`-trigger, og decide-steget får PR-nummeret
  (`PR_NUMBER`-uttrykk), venter på checks (`WAIT_FOR_CHECKS` inkluderer pull_request-event),
  serialiseres per head-SHA (concurrency-uttrykk) og checker ut riktig ref. Evidens:
  yml-linjer + yml-parse-sanity.
  **EVIDENS:** `.github/workflows/discord-pr-card.yml` — trigger :27, concurrency :41,
  checkout-ref :74, PR_NUMBER :101, WAIT_FOR_CHECKS :108-uttrykket inkluderer
  `github.event_name == 'pull_request'`. js-yaml-parse verifiserte alle fem uttrykkene
  (triggers: workflow_run + pull_request + workflow_dispatch) (commit ccf2d1ea).
- [x] **K4 — tester oppdatert (Type A):** `autoMerge.test.ts`: «draft-PR av-draftes» →
  erstattes med «draft-PR → fallback-signal, ingen merge»; «av-draft-feil»-testen fjernes
  (mutasjonen finnes ikke). Ingen classify-endringer (draft-gaten bor i decide, ikke i
  `classifyAutoMerge`). Evidens: `npx vitest run lib/loops` grønn.
  **EVIDENS:** `lib/loops/autoMerge.test.ts:238` — «draft-PR → fallback-signal, ingen
  av-draft, ingen merge (#1516)» asserter `{ok:false}` og at kall-lista er kun `['GET']`
  (aldri GRAPHQL/PUT); av-draft-testene fjernet. `npx vitest run lib/loops`: 4 filer,
  163 passed, 0 failed. Full gate: `npm run build` exit 0 (commit ccf2d1ea).
- [x] **K5 — forge-workflow.md:** nytt draft-først-steg i /forge:auto-disiplinen:
  PR opprettes med `gh pr create --draft`; all bokføring (kontrakt-avkryssing,
  evaluator-verdikt, runde-fil) committes og pushes; `ls-remote`-sjekk bekrefter
  remote-HEAD = lokal HEAD; **`gh pr ready` er øktas siste handling**.
  **EVIDENS:** `docs/forge-workflow.md:21` — ny seksjon «Draft-først i økt-PR-flyten
  (#1516)» med de fire numererte stegene (draft-opprettelse → bokføring → ls-remote →
  ready sist) + hvorfor-avsnitt (commit 793f0861).
- [x] **K6 — discord-pr-kort.md:** draft-semantikken dokumentert: draft = «økta jobber
  fortsatt» → decide noop-er (ingen kort/label); `ready_for_review`-triggeren; merge-stien
  fail-closed på draft; mottaker-knappen beholder eier-gated av-draft.
  **EVIDENS:** `docs/loops/discord-pr-kort.md` — trigger-lista i steg 1
  (ready_for_review + utvidet ventemekanisme), decide-gaten i steg 2 («ikke draft»),
  merge-beskrivelsen i steg 4 («ikke draft (fail-closed, #1516)»), noop-lista i «Tre
  utfall» §1, ny seksjon «Draft = «økta jobber fortsatt» (#1516)» (:105) med
  mottaker-unntaket, og fix-protokoll-rad for draft-noop (commit 793f0861).
- [x] **K7 — CLAUDE.md:** én linje i «Branch + PR-flyt» steg 3 om draft-først for økter
  som pusher etter PR-opprettelse (peker til forge-workflow.md for detaljene).
  **EVIDENS:** `CLAUDE.md:139` — «**Draft-først (#1516):** … `gh pr ready` er øktas
  siste handling …» i steg 3, med peker til `docs/forge-workflow.md` (commit 793f0861).
- [x] **K8 — dogfood:** DENNE PR-en opprettes som draft; lokal decide-kjøring mot den
  (read-only) viser `noop` mens draft; `gh pr ready` kjøres som øktas siste handling.
  **EVIDENS:** PR #1518 opprettet med `gh pr create --draft` (`gh pr view 1518` →
  `isDraft: true`); K1-røyken over ER dogfood-beviset (decide mot #1518 → noop mens
  draft). Ready-flippen utføres som øktas siste handling etter evaluator-verdikt +
  runde-fil — se runde-fila for sluttføringen.

## Gates

| Gate | Kommando | Scope |
|---|---|---|
| Unit | `npx vitest run lib/loops` | endrede lib-filer (co-located tests) |
| Full | `npm run build` | lib/-endring → full gate (§T2; tsc alene utilstrekkelig) |
| YML | node-parse av `discord-pr-card.yml` med yaml-parser fra node_modules | trigger-endringen |
| Decide-røyk | `GITHUB_TOKEN=$(gh auth token) PR_NUMBER=<denne-PR> npx tsx scripts/loops/decide-pr-card.ts` (read-only) | K1/K8 |

## Kant-tilfeller (fasit for tester og review)

| Input | Forventet |
|---|---|
| draft=true ved decide | noop, ingen label, «draft»-logglinje |
| draft=false | uendret klassifisering |
| draft=true ved merge-re-sjekk (race: re-draftet etter decide) | `{ok:false}` → knapp-kort |
| ready_for_review med pending checks | WAIT_FOR_CHECKS-poll (30 s × 21) til settle |
| ready_for_review på allerede kortet PR | noop (dedup-label holder) |
| workflow_run på siste bokførings-push mens draft | noop — selve #1516-racen lukket |
| workflow_dispatch mot draft | noop + logglinje |
| Fork-PR ready (read-only token) | guard/merge fail-closed som i dag |

## Ombyggingskostnad / reversibilitet

Liten og reversibel: gaten er tre isolerte punkter (decide-linje, merge-helper-linjer,
yml-trigger). Å rulle tilbake = revert av én commit; ingen data, ingen migrasjoner.
