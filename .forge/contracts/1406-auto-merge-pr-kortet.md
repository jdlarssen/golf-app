# Spec: Auto-merge — PR-kortet merger selv når PR-en ikke inneholder noe produktvalg

**Issue:** #1406 (milestone «Selvkjørende loops»)
**Branch:** claude/contract-issue-1406-8bc631
**Kontrakt skrevet:** 2026-07-30 (autonom økt — antagelser er merket; eieren har veto via issue-kommentaren)

## Problem

Eierbeslutningen 2026-07-28 fjernet merge-porten hos eieren: PR-er uten produktvalg skal lande selv når portene er grønne. Interaktive økter gjør dette allerede (CLAUDE.md «Branch + PR-flyt» steg 5), men loop-siden — Discord-PR-kortet (#1159) — holder fortsatt menneske-porten: hvert grønt PR-kort venter på et knappetrykk. Konsekvensen er at natt- og loop-PR-er blir liggende til eieren rekker mobilen, uten at det finnes noe valg å ta. Kortet skal oppgraderes fra godkjenningskort til kvitteringskort: merge selv når PR-en er kvalifisert, post kvittering i produktspråk, og behold knappen kun der eieren faktisk trengs.

## Research Findings

- **Merge-API:** `PUT /repos/{o}/{r}/pulls/{n}/merge` med `merge_method: "rebase"` og `sha`-param — head må matche `sha`, ellers **409** (race-guard mot nye commits). **405** = «merge cannot be performed» (konflikt/draft). 200 = merget. (GitHub REST-docs, hentet 2026-07-30.)
- **Anti-rekursjon + unntaket (løftebærende):** events utløst av Actions-`GITHUB_TOKEN` starter IKKE nye workflow-runs — men `workflow_dispatch`/`repository_dispatch` «always create workflow runs». En GITHUB_TOKEN-merge trigger altså ALDRI `main-verify.yml` (#1075-sikkerhetsnettet) via push — den må dispatches eksplisitt etterpå. (GitHub Actions-docs «Triggering a workflow from a workflow», hentet 2026-07-30.)
- **`main-verify.yml`** har `workflow_dispatch` + `paths-ignore: **.md, docs/**, .forge/**` — docs-only-merges trenger ingen dispatch (kan ikke komponere rød main).
- **Vercel-deploy påvirkes ikke:** Vercel trigges av GitHub-App-webhooks, ikke Actions — anti-rekursjonsregelen gjelder kun workflow-runs.
- **Selv-modifikasjon er allerede mitigert:** workflowen sjekker alltid ut `scripts/loops` + `lib/loops` fra **main** før kjøring (#1181-steget), og `workflow_run`/`workflow_dispatch` bruker workflow-fila fra main — en PR kan ikke svekke sin egen klassifisering. Steget skal bestå.
- **«Bruker-synlig» har allerede ett hjem:** bindings §T7 / commit-msg-hooken: commit-prefiks `feat|fix|perf` uten `[no-changelog]`. Gjenbrukes som predikat (commits hentes via `GET /pulls/{n}/commits`) — ingen ny fil-glob-heuristikk for dette.
- **Staging-bevis har allerede ett hjem:** `staging-verified`-labelen på PR-en (#1076, settes av staging-verify-skillet).

## Prior Decisions (bæres videre)

- **Rebase, aldri squash** (repo-policy; mottakeren `executeAction/merge_pr` gjør det samme).
- **`workflow_run`, ikke `check_suite`** (#1162) og **WAIT_FOR_CHECKS ved dispatch** (#1301) — uendret.
- **Post FØRST, label etterpå** (tapt kort er verre enn dobbelt) — samme rekkefølge for kvitteringskortet.
- **Discord er best-effort** — Discord-feil feller aldri en merge som alt er gjort; morgenbriefen er backstop.
- **Funksjonell-setningen** kommer fra `extractPrSummary(pr.body)` (taglinen, #1159) — kvitteringskortet gjenbruker den; fallback PR-tittel.
- **Knapp-handlingene består uendret** (`merge_pr`, A/B, 🗑, ⏸ i `discordActions.ts` + interactions-endepunktet) — kun sender-siden endres.

## Design

### 1. Tre-utfalls-klassifisering (decide-steget)

`CardPlan` utvides: `outcome: 'auto-merge' | 'card' | 'noop'` erstatter `shouldCard`; nye felt `headSha: string | null` og `demotedReason?: string | null` (hvilken port som degraderte auto-merge → card; kun logging/observability). `decide-pr-card.ts` skriver `outcome` + `is_gui` til `$GITHUB_OUTPUT`; workflow-stegene gater på `outcome != 'noop'` (post) og `+ is_gui` (skjermbilder — tas for begge kort-typer).

Portrekkefølge i decide (første treff avgjør):

1. Som i dag → `noop`: ingen kandidat-PR · PR ikke åpen · allerede kortet (`discord:merge-kort`-label) · checks ikke grønne (`classifyChecks`/`waitForChecksToSettle` uendret).
2. → `card` (knapp-kort som i dag) når NOEN av disse treffer:
   - base-branch ≠ `main`
   - PR-tittel inneholder `WIP` (ord, case-insensitiv) — WIP-vern for økter underveis
   - **aldri-lista:** minst én endret fil matcher `NEVER_AUTO_MERGE_GLOBS` (se §3)
   - **valg-markør:** PR-body har en markdown-heading som matcher `/^#{1,6}\s+(produktvalg\b|alternativ\s+[a-e]\b)/im`, ELLER et lenket issue (parset fra body: `closes|fixes|resolves|refs|part of #N`) har labelen `autonomy:needs-decision`
   - **staging-porten:** PR-en er bruker-synlig (≥1 commit med `feat|fix|perf`-prefiks uten `[no-changelog]` i meldingen) OG mangler `staging-verified`-labelen
3. Ellers → `auto-merge`.

Nye rene predikater i `lib/loops/` (samme mønster som `prCard.ts` — rene funksjoner, unit-testet): `touchesNeverList(files)`, `hasChoiceMarker(body)`, `linkedIssueNumbers(body)`, `isUserVisibleByCommits(commitMessages)`, pluss komposisjonen `classifyAutoMerge(...)` som returnerer `{outcome, demotedReason}`. Decide henter i tillegg commits (`GET /pulls/{n}/commits`, per_page 100, maks 3 sider — samme mønster som filene) og labels på lenkede issues.

### 2. Merge-mekanikk (post-steget)

`post-pr-card.ts` ved `outcome === 'auto-merge'` — via en ren, testbar helper med injisert GitHub-klient (samme mønster som `executeAction`; `executeAction/merge_pr` gjenbrukes IKKE direkte fordi dens CI-port leser kun `ci.yml`-runs og ville avvist docs-only-PR-er som kun har Vercel-checks):

1. Re-verifiser: PR fortsatt åpen · check-runs fortsatt grønne (`classifyChecks` mot `plan.headSha`).
2. Draft → GraphQL `markPullRequestReadyForReview` (draft-PR-er ER kvalifisert — det er loop-leveransekonvensjonen; se Key Decisions).
3. `PUT …/merge` med `merge_method: 'rebase'` og `sha: plan.headSha`.
4. **Suksess** → post kvitteringskort → main-verify-dispatch (steg 3 under) → dedup-label (dagens rekkefølge).
5. **Enhver feil i 1–3** (409 sha-mismatch, 405 konflikt/ikke-mergeable, un-draft-feil, HTTP-feil) → **fall tilbake til dagens knapp-kort i samme kjøring** (fail-closed til menneske-porten, aldri stille drop) + logg grunnen.

**main-verify-dispatch:** etter vellykket merge, `POST /repos/{o}/{r}/actions/workflows/main-verify.yml/dispatches {ref: 'main'}` — MED MINDRE alle endrede filer matcher main-verifys egne ignore-globs (`**.md`, `docs/**`, `.forge/**`). Dispatch-feil etter merge → logg + **exit non-zero** så failure-alarmen åpner CI-vakt-issue (mergen står, men sikkerhetsnettet feilet — det skal aldri dø stille). Discord-feil forblir best-effort (exit 0).

`ghClient.ts` utvides med `PUT` (og `graphql`-kall). `DRY_RUN=1` dekker auto-merge-stien: logger tiltenkt merge + payloads, ingen skriv.

Workflow-endringer i `discord-pr-card.yml`: `permissions` utvides med `contents: write` (merge) + `actions: write` (dispatch); `pull-requests: write`/`issues: write`/`checks: read` består. Steg-gating byttes fra `should_card` til `outcome`.

### 3. Aldri-lista (`NEVER_AUTO_MERGE_GLOBS` — én eksportert konstant i `lib/loops/`)

- `supabase/**` — migrasjoner (prod-brannmur #1074), RLS, DB-config (bredere enn issue-ets `supabase/migrations/**`; fail-closed)
- `**/slett/**`, `**/slett-konto/**` — destruktive flyter
- `proxy.ts`, `lib/auth/**`, `lib/supabase/**`, `app/api/**`, `app/[locale]/(auth)/**` — auth-/sikkerhetsflater
- `**/betaling/**`, `lib/payment/**` — koster penger
- `.github/**`, `.githooks/**`, `.claude/**` — enforcement-/guard-rail-flater: automatikk som endrer automatikkens egne rammer beholder menneske-porten

### 4. Kvitteringskortet

`buildReceiptPayload` i `lib/loops/`: innhold `✅ **Merget** — PR #N: <tittel>` + funksjonell-setning (`extractPrSummary` ?? tittel) + PR-lenke; komponenter: KUN lenke-knappen «Åpne PR» (ingen `merge_pr`-knapp). Skjermbilder festes som i dag (Del B-riggen gjenbrukes uendret — `is_gui` styrer). Samme 2000-tegns-trunkering.

### 5. Docs (samme PR)

- `docs/loops/discord-pr-kort.md`: «Menneske-porten står» + «Auto-merge: aldri» erstattes av tre-utfalls-designet; nytt avsnitt om aldri-lista, valg-markøren, staging-porten og main-verify-dispatchen; fix-protokollen får radene «auto-merge falt tilbake til knapp-kort (se demotedReason i loggen)» og «main-verify-dispatch feilet → CI-vakt-issue».
- `docs/loops/morgenbriefen.md`: «Godkjenn PR #M»-linjer under «Trenger deg nå» gjelder kun PR-er som fortsatt har knapp-kort (valg/aldri-liste/manglende staging-bevis); auto-mergede PR-er rapporteres under «Skjedde i natt» (verifisert, med ↳-funksjonell som i dag). Arkiv-PR-regelen «ALDRI selvmerget» oppdateres: arkiv-PR-en dispatches som før og er docs-only → kvitteringsutfallet er forventet og riktig.
- `CLAUDE.md` steg 5: setningen «til da består knappen for loop-PR-er» erstattes med kryssreferanse hit; valg-markør-konvensjonen nagles: **økter som presenterer produktvalg MÅ ha en `## Alternativ A/B`-heading (eller `## Produktvalg`) i PR-body-en** — det er maskin-markøren kortet leser.

## Edge Cases & Guardrails

- **Nye commits mellom decide og merge** → 409 via `sha`-param → knapp-kort (knappen re-verifiserer CI ved trykk, så kortet er trygt selv om checkene er stale).
- **Rebase-konflikt** → 405 → knapp-kort; eierens knappetrykk får samme ærlige GitHub-feilmelding fra mottakeren som i dag.
- **Dobbel-fyring** → concurrency-gruppa + dedup-label som i dag; post-stegets re-sjekk «PR fortsatt åpen» gjør et allerede-merget løp til ren no-op.
- **Merge OK, Discord-post feiler** → mergen står; ingen label (som i dag ved post-feil — ufarlig: PR-en er lukket, ingen re-card); morgenbriefens «Skjedde i natt» er backstop.
- **Docs-only dispatch-flyt (#1301)** → `WAIT_FOR_CHECKS` venter til Vercel-checkene lander → kvalifiserer typisk → auto-merge; main-verify-dispatch hoppes over (docs-only).
- **`[no-changelog]`-fix + ren feat i samme PR** → én feat-commit uten escape er nok: bruker-synlig (any-kvantor).
- **Retroaktivt sveip finnes ikke:** klassifiseringen kjører kun på nye events (workflow_run/dispatch) — eksisterende åpne kort-PR-er røres ikke (dedup-labelen gater dem uansett i port 1).
- **Ingen stille tak:** hver degradering fra auto-merge logges med `demotedReason`.

## Key Decisions

- **Merge i post-steget, ikke decide:** merge + kvittering + fallback hører sammen; «Merget»-påstanden postes først etter faktisk 200 (I2/I3).
- **GITHUB_TOKEN + eksplisitt main-verify-dispatch, ikke PAT:** least-privilege, ingen ny secret, og dispatch-unntaket er dokumentert. PAT-alternativet (ville trigget push-workflows naturlig) krever eier-steg og bredere token i Actions — avvist.
- **Egen merge-helper fremfor gjenbruk av `executeAction/merge_pr`:** mottakerens CI-port (kun `ci.yml`-runs) ville blokkert docs-only-PR-er; check-runs-porten (`classifyChecks`) er riktig for kortet. Mottakeren består uendret.
- ASSUMPTION 1: **Draft-PR-er er kvalifisert** (un-draft før merge) — draft er loop-leveransekonvensjonen («ferdig, venter»), ikke WIP-signal; WIP-vernet er tittel-markøren. Alternativ (ekskluder drafts) ville latt nesten alle loop-PR-er beholde knappen og uthulet issuet.
- ASSUMPTION 2: **Enforcement-flatene (`.github/**`, `.githooks/**`, `.claude/**`) og hele `supabase/**` + `app/api/**` står på aldri-lista** — fail-closed-utvidelse av issue-ets liste; kostnaden er at slike PR-er (inkl. denne leveransen selv) beholder knapp-kortet.
- ASSUMPTION 3: **Bruker-synlig = commit-prefiks-regelen (§T7)**, ikke fil-globs — gjenbruker det hook-håndhevede hjemmet; commit-disiplinen er allerede enforced, så vi stoler på den.
- ASSUMPTION 4: **Staging-bevis = `staging-verified`-labelen alene** — bevis-kommentar uten label teller ikke (labelen ER portens kontrakt fra #1076).

**Claude's Discretion:** fil-plassering av nye predikater (utvide `prCard.ts` vs. ny `lib/loops/autoMerge.ts`); eksakt kvitterings-layout innenfor §4; glob-matching-implementasjon (håndrullet prefiks/suffiks-match à la `isVisualChange` — ingen ny dependency); loggformat for `demotedReason`; commit-oppdeling (ikke-bump-prefikser `ci`/`chore(loops)`/`docs`, alle med `Refs #1406` — ingenting her er app-bruker-synlig, ingen versjonsbump/CHANGELOG).

## Success Criteria

1. [x] `npx vitest run lib/loops` grønn med nye tester som låser: aldri-liste-globs (minst én fixture per punktliste-rad i §3 → `card`), valg-markør-regexen (`## Alternativ B`/`## Produktvalg`-treff; «Alternativer vurdert»-prosa uten heading = IKKE treff), `isUserVisibleByCommits` (feat/fix/perf ± `[no-changelog]`), `linkedIssueNumbers`, `classifyAutoMerge`-portrekkefølgen, kvitterings-payload (ingen `merge_pr`-knapp), og merge-helperen med mocket klient (suksess → kvittering; 409/405/un-draft-feil → knapp-kort-fallback). — BEVIS: `npx vitest run lib/loops` → 164 passed (4 files); nye tester i `lib/loops/autoMerge.test.ts` + `lib/loops/prCard.test.ts` (buildReceiptPayload).
2. [x] `decide-pr-card.ts` skriver `outcome` + `headSha` i planen og `outcome`/`is_gui` til `$GITHUB_OUTPUT`; alle dagens `noop`-stier består (verifiserbart i fil + én DRY_RUN-aktig lokal kjøring med fabrikert event). — BEVIS: lokal kjøring uten GITHUB_TOKEN → `$GITHUB_OUTPUT` fikk `outcome=noop`/`is_gui=false`, planfila fikk `outcome:"noop"`, `headSha:null`; wiring i `decide-pr-card.ts:emit()` + `classifyAutoMerge`-kallet.
3. [x] `post-pr-card.ts` med fabrikert plan (`outcome: 'auto-merge'`) og `DRY_RUN=1` logger tiltenkt merge + kvittering uten noen skriv (kommando-output som bevis). — BEVIS: `DRY_RUN=1` mot fabrikert auto-merge-plan → «ville rebase-merget mot headSha … (sha-guard), postet kvittering og dispatchet main-verify. Ingen skriv.» + kvitterings-JSON (kun lenke-knapp); docs-only-variant → «uten main-verify-dispatch (docs-only)».
4. [x] `discord-pr-card.yml`: `contents: write` + `actions: write` lagt til; steg-gating på `outcome`; main-fra-checkout-steget (#1181) urørt (fil-review, `file:line`). — BEVIS: `.github/workflows/discord-pr-card.yml:35-36` (contents/actions: write), `:98` + `:131` (`outcome != 'noop'`); «Bruk main sin versjon av loop-skriptene» på `:69` urørt, concurrency `:30`, guard `:46`, failure-alarm `:140` urørt.
5. [x] Docs-endringene i §5 er gjort i samme PR (alle tre filene), inkl. valg-markør-konvensjonen i CLAUDE.md. — BEVIS: commit `fb0f7515` — `docs/loops/discord-pr-kort.md` (tre-utfall + fix-protokoll), `docs/loops/morgenbriefen.md` (knapp-kort-linjer + arkiv-PR-regel), `CLAUDE.md` steg 5 (kryssref + `## Produktvalg`/`## Alternativ A/B`-markør).
6. [x] `npm run typecheck`, `npm run lint` og `npm run build` grønne. — BEVIS: `tsc --noEmit` ren; `npm run lint` 0 errors (kun pre-eksisterende warnings, ingen i berørte filer); `npm run build` EXIT 0 (etter kopiering av worktree-`.env.local`, jf. worktree-env-note).
7. [ ] PENDING FIRST USE (blokkerer ikke ACCEPT; issuet holdes åpent til bevist): første reelle kandidat — dispatch mot en grønn docs-only-PR → auto-merget + kvitteringskort i Discord; første bruker-synlige PR uten `staging-verified` → knapp-kort med `demotedReason` i loggen.

## Gates

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npx vitest run lib/loops`
- [x] `npm run build`

## Files Likely Touched

- `scripts/loops/cardPlan.ts` — `CardPlan` v2 (`outcome`, `headSha`, `demotedReason`)
- `scripts/loops/decide-pr-card.ts` — portrekkefølgen, commits-/issue-label-henting
- `scripts/loops/post-pr-card.ts` — merge-sti, kvittering, fallback, main-verify-dispatch
- `scripts/loops/ghClient.ts` — `PUT` + `graphql`
- `lib/loops/prCard.ts` (evt. ny `lib/loops/autoMerge.ts`) + tester — predikater, aldri-lista, kvitterings-payload, merge-helper
- `.github/workflows/discord-pr-card.yml` — permissions + gating
- `docs/loops/discord-pr-kort.md`, `docs/loops/morgenbriefen.md`, `CLAUDE.md` — §5

## Out of Scope

- GitHubs innebygde auto-merge/branch protection (Pro-gated) — vi merger selv (per issue).
- Endringer i interactions-endepunktet/knapp-handlingene (`merge_pr`, A/B, 🌙, ⏸) — består uendret.
- Å lære nattkjøreren/staging-verify å sette `staging-verified` oftere — egen sak; uten label er utfallet korrekt (knapp-kort).
- Retroaktiv behandling av allerede-åpne PR-er/kort.
- DENY-promotering av bash-guardens merge-REMIND (#1076-beslutning, evidens-drevet senere).
- Morgenbrief-*routinens* prompt (kun `morgenbriefen.md`-spec-docen endres her).
