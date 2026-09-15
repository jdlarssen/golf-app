# golf-app bindings

Repo-specific bindings for the agent-discipline package. Procedures reference sections
here by trigger id (§T1–§T7, §T9 — T8's repo specifics live in §Enforcement) plus
§Enforcement and §Domain triggers. When porting the
package to another repo, this is the only file you rewrite — see README.md. Rules here
are pointers into their single-home documents; the authoritative text lives at the
target.

## §Domain triggers — extra mandatory rules by area (checked at T1)

| Touching | Rule / reading |
|---|---|
| `lib/scoring/` | New test FIRST — no exceptions (`lib/scoring/AGENTS.md`) |
| `lib/sync/` | Dexie DB name `'golf-app'` is frozen — rename deletes users' local data (pre-commit blocks removal). Sync flow + realtime `setAuth()` trap: `lib/sync/AGENTS.md` |
| Any DB write / migration / RLS | §T3 below + `docs/bug-prevention.md` (the five traps); who may read which scores: `lib/supabase/AGENTS.md` §RLS |
| `lib/mail/` | `lib/mail/AGENTS.md` (Type B snapshot rules); the best-effort send pattern's home is CLAUDE.md §Nøkkelfiler |
| Forms in wizard/game flows | State that must survive submit needs always-mounted hidden inputs (§T4 row 7); heed the warning comment in `components/ui/Disclosure.tsx` |
| `messages/*.json` or `t()`/`t.rich()` call sites | New keys, or values with `{placeholders}`/rich tags → render the route and watch the console (§T4 row 5). Plain-text edit of an existing key present in BOTH locales → the T7 click-through suffices; don't verify twice |
| A user flow (create → join → play → finish) | Fires when a STEP, SCREEN or DECISION POINT is added/removed/renamed/reordered — not for styling/copy inside an existing step. Update the `docs/flows/` diagram + regenerate the PNG in the same PR (`docs/flows/README.md`) |
| Next.js API not used this session | `node_modules/next/dist/docs/` — Next 16 breaking changes; middleware = `proxy.ts` |
| A destructive user action | Dedicated confirmation page under a `/slett`-style route — never inline toggle or `<details>` popout |
| Caching (`unstable_cache`, `cacheLife`) | Every cached read gets a tag; every mutation path calls `revalidateTag` — enumerate them (#1045). The game cache: `lib/games/AGENTS.md` |
| New/changed Norwegian copy | Run the `humanizer:humanizer` skill before commit; the pre-commit hook warns on only 4 patterns — full catalog + preserved exceptions: `docs/copy-style.md` |
| Login, OTP codes or invitations (`app/[locale]/(auth)/login/`, `lib/mail/inviteNotification.ts`) | `docs/auth-flow.md` — the OTP flow, why no magic link, mail debugging |
| UI styling, palette or brand copy | `docs/style-and-brand.md` |
| The owner must act in a third-party UI (Supabase/Vercel/Resend dashboard, DNS registrar) | `docs/collaboration.md` — who does what, plus the four-step message template |

## §Enforcement — hook inventory and sanctioned workarounds

- Guards: `.githooks/` (commit-msg, pre-commit, pre-push) + `.claude/hooks/` (bash-guard,
  mcp-guard). Denial texts name the rule and the remedy — read them.
- Forbidden bypasses (I7): `--no-verify` · `git push --force` · `ALLOW_MAIN_PUSH=1` ·
  rewording commands to dodge a matcher that fired correctly.
- Sanctioned workarounds (NOT dodges): `--body-file` for issue/PR bodies whose PROSE
  trips the prod-firewall or Closes-detection matchers · `--force-with-lease` inside the
  documented rebase flow · owner-approved `touch .claude/approve-prod` (one-shot, 10 min)
  for prod DB writes.
- `expectAffected`/`expectOne` (`lib/supabase/affectedRows.ts`) partially enforce I3 for
  mutations.

## §T9 — Session start / fresh worktree / post-compaction

1. Verify hooks are wired: `git config core.hooksPath` must print `.githooks`
   (postinstall writes it to the shared config; worktrees inherit it). Empty → run
   `git config --worktree core.hooksPath .githooks`.
2. Node 22: `source ~/.nvm/nvm.sh && nvm use 22` — app and test suite break on Node 20.
3. `npm install` — the pre-push hook SKIPS all gates with a warning when `node_modules`
   is missing, so a fresh worktree pushes ungated (I3: a skipped gate is a silent no-op).
   Driving staging in the browser also needs `.env.staging.local` copied into the
   worktree.
4. After context compaction: re-read the notes file, `git status`,
   `git log --oneline -5` before the next edit.

## §T1 — Task intake

- **Anchor recipe:** Grep `docs/user-flows.md` for the feature's nouns; a hit inside a
  flow section (P1–P5 / A1–A4) = anchored. Ambiguous → check the future-core diagrams
  `docs/flows/*-fremtid.svg` (they define what we build toward). Zero hits → owner
  question (interactive) or `ASSUMPTION: not in flows, building because <reason>`
  (autonomous). Anchoring applies to backlog issues you picked up — a direct owner
  request in this session is itself the mandate (`docs/issue-workflow.md`
  §Brukerflyt-forankring).
- **Routing (this repo):** an implementation-plan document exists → run it via the
  subagent-driven-development skill (choice already made — §Utførelse below).
  Expected ≥ 5 files or > 100 LOC → implementer subagent, or the forge contract-first
  flow when forge is invoked — never `/forge:auto` without a contract file or a contract
  comment on an open issue (`docs/forge-workflow.md`). Below the threshold → direct
  edits with FULL intake. Bug reports → direct systematic debugging (§T4), not a
  contract.
- **Notes file:** put it in the session scratchpad directory (path in the system
  prompt).

## §T2 — Change propagation

- **Full gate = `npm run build`**, not bare tsc: cacheComponents-only errors (e.g.
  `export const runtime`) surface only in next build. Neither pre-push nor CI runs
  build — this gate is pure discipline.
- New `GameMode` members must satisfy every exhaustive switch and `Record` map — the
  build gate is the enumerator.
- Known multi-home rules: player-count limits (DB CHECK + validator + RLS + wizard UI);
  tee slope/CR bounds. Layer-agreement exemplar to copy:
  `lib/courses/teeRatingDbCheck.test.ts`. Pattern: `docs/bug-prevention.md` §4.

## §T3 — Database and authz

- **DB-trap catalog:** `docs/bug-prevention.md` (incidents + full patterns). Mutation
  patterns: `lib/supabase/AGENTS.md`.
- **Introspection:** Supabase MCP `list_tables` / read-only `execute_sql`, or
  `npm run gen:types` (reads PROD). For a schema not yet in prod: apply the migration to
  staging first, then introspect STAGING via MCP — gen:types won't see it.
  TS types for a staging-only column: generate them against the staging ref
  (`npx supabase gen types typescript --project-id snwmueecmfqqdurxedxv`) — first choice,
  and the one the CI drift check agrees with: on PRs `schema-drift.yml` diffs against
  STAGING (#1532), so staging-generated types are green even before prod is applied.
  Fallback: hand-extend `lib/database.types.ts` with a `// TODO: regen after prod apply`
  marker and run `npm run gen:types` once the migration reaches prod — the marker stays
  the trace for that path, but expect the PR's drift check to be red until the types
  match staging.
  `docs/schema-ground-truth.md` is a dated snapshot, not authority.
- **Affected rows:** `expectAffected` / `expectOne` in `lib/supabase/affectedRows.ts`.
- **Hostile-request rig:** DB-enforced authz here is Postgres RLS (+ BEFORE-triggers for
  column-level rules). Copy an existing pgTAP test, e.g.
  `supabase/tests/game_players_update_rls_test.sql`; run `npm run test:rls`.
  ⚠️ `test:rls` exits 0 even when it SKIPS (supabase CLI missing) — the run only counts
  if the output shows pgTAP results, not the "[skipped, not failed]" banner. CLI
  missing → write the test anyway + `VERIFICATION GAP: test:rls not run`.
- **Error-boundary artifact:** a co-located `error.tsx` on every route with a creation
  flow.
- **Order:** staging first (`torny-staging`, ref `snwmueecmfqqdurxedxv`) via Supabase
  MCP → verify → then prod. Prod writes are firewalled (mcp-guard/bash-guard); the only
  legitimate escape is §Enforcement's approve-prod sentinel. The firewall matches PROSE
  mentioning prod too — use §Enforcement's `--body-file` workaround.
  Post-merge, the ledger gate (`.github/workflows/migration-ledger.yml`, #1410) reds
  daily while a merged migration file has no row in prod's `schema_migrations` — apply
  it under the file's slug (name minus `NNNN_`), or the gate keeps an alert issue open.
- **Migration numbering:** check `supabase/migrations/` on `origin/main`, not just your
  branch.

## §T4 — Debugging

- Project policy: **no quick fixes** — systematic debugging with diagnostics FIRST
  (CLAUDE.md §Feilhåndtering; `superpowers:systematic-debugging` when available).
- Environment-cause table — write MATCH/NO-MATCH per row (T4 step 4):

| # | Symptom smells like | Actually check first |
|---|---|---|
| 1 | Stale data after a mutation | `unstable_cache` tag `game-${id}` not revalidated; REST/MCP mutations bypass tags entirely |
| 2 | Wrong time; a window opens hours late | UTC-vs-Oslo: Vercel runs UTC — use the Oslo helpers (`osloParts`/`osloCalendar` in `lib/format/`), never local getters (#648) |
| 3 | Write "succeeded" but nothing changed | RLS matched 0 rows and `error == null` (`docs/bug-prevention.md` §2, #704) |
| 4 | Animation missing on iOS | `prefers-reduced-motion` suppression in `app/globals.css` |
| 5 | Raw i18n key or English fallback on page; or a route crashing to the error boundary | `MISSING_MESSAGE` is a logged fallback, never a crash by itself — but `t.rich` tag-vs-placeholder drift CAN hard-crash the route (#897). Check console AND error boundary; verify placeholder syntax in BOTH locales |
| 6 | Scores not syncing between players | Dexie offline queue state; realtime channel health — auth must be primed with no-arg `await realtime.setAuth()` BEFORE subscribe (the join payload is snapshotted synchronously), and the token must never be passed as an argument: that sets `_manuallySetToken` and disables supabase-js' own upkeep (#1366). `subscribeRealtimeChannel` owns subscribe + resubscribe |
| 7 | Form value silently lost at submit | Conditionally-mounted input — only mounted DOM inputs reach FormData; mirror state via always-mounted hidden inputs (#1011) |

## §T5 — Testing

- Doctrine: `docs/test-discipline.md` (Type A–D + decision tree) is authoritative;
  CLAUDE.md §Test-disiplin points there.
- Staging, never prod: `docs/staging-testing.md` (setup, Node 22, autonomous login,
  prod guard).
- Area overlays: `lib/scoring/AGENTS.md` · `lib/mail/AGENTS.md`.
- E2E: assert on `data-testid`/role, never on Norwegian copy.
- Time idiom: `Date.now()` offsets or vitest fake timers.

## §T6 — Commit and PR

- **Metadata rules** (prefix → a new `.changes/` note file, `Refs #N`, escapes
  `[no-changelog]` / `[no-issue]`): `.changes/README.md` §Versjonering +
  `docs/pr-workflow.md` — enforced
  by `.githooks/commit-msg`; its block text names the remedy. Note template + field
  limits: `.changes/README.md`. Never bump `package.json` or edit `CHANGELOG.md` in a
  normal commit — the weekly release job (`.github/workflows/ukesversjon.yml`) owns both,
  and the hook blocks any non-`chore(release)` commit that changes the version field.
- **Untracked work:** decide at intake — `gh issue create` with `type:`/`area:` labels +
  milestone (mandatory, `docs/issue-workflow.md`), or the rare genuine `[no-issue]`. Tier 1/Tier 5 milestone
  titles are mojibake-corrupted — set by number:
  `gh api -X PATCH repos/jdlarssen/golf-app/issues/N -F milestone=<num>`.
- **Gates:** `npx vitest run <path>` for every changed file with a co-located `*.test.*`
  sibling (glob for it — zero siblings is a checkable fact, not an excuse) +
  `npm run build` (§T2).
- **PR form** (Fordeler/ulemper, `## Alternativer (produktvalg)`), draft-first, the
  auto-merge policy and the product-choice marker: `docs/pr-workflow.md`.
- **PR-checks command:** `gh pr checks` — every required check "pass", zero "skipping".
- **Merge:** `gh pr merge --rebase --delete-branch` (squash is denied); afterwards rebase
  the local branch onto `origin/main` before further work, then sweep the leftovers:

  ```bash
  git fetch --prune origin                    # drop remote-tracking refs that are gone
  git branch --format '%(refname:short) %(upstream:track)' \
    | awk '$2 == "[gone]" {print $1}' | xargs -r git branch -D
  git worktree prune                          # drop worktree records for deleted dirs
  ```

  `--delete-branch` only covers merges you run yourself. A merge through the API — the
  Discord card, GitHub-MCP from a remote session — does NOT fire GitHub's
  `delete_branch_on_merge` (#1675). The card now deletes its own head branch, and
  `.github/workflows/branch-sweep.yml` sweeps the rest weekly; a `claude/*` branch you
  left behind by hand is still yours to remove.
- **Closing comment** on every closed issue: `## Teknisk` + `## Funksjonell`
  (`docs/issue-workflow.md` §Closing-kommentar) — the main chat writes it, not a subagent. ONE per
  issue: list the thread's comments first; if a delivery/closing comment already
  exists (a build or night session posted it before merge), PATCH its stale
  statements — merge SHA, prod-migration status, deviations — instead of posting a
  second one (#1907; bash-guard reminds you when the thread already has one).
- **Findings (reviewer, evaluator, your own reading):** fixed in this PR, or one line
  under `## Observert, ikke rørt` in the PR body — never a new issue, except the single
  documented exception (migration / auth-RLS / product choice outside the issue, and
  reproduced). Closing comment carries `Nye issues: 0` (`docs/issue-workflow.md` §Null-vekst, #2096).

## §T7 — Done verification

- **User-visible = the commit prefix is feat/fix/perf without `[no-changelog]`** (reuses
  the hook-enforced definition, so the two homes cannot drift). Such a change → staging
  click-through of the affected flow BEFORE merge: `preview_start("torny-staging")`,
  autonomous OTP login per `docs/staging-testing.md`. A staging-minted code never validates
  against prod — confirm the data is staging-shaped before writing anything.
- Prod is in real use — never test against prod (`docs/staging-testing.md`).
- Issue-closing comment (one per issue, `## Teknisk` + `## Funksjonell`, `Nye issues: 0`):
  `docs/issue-workflow.md`.

## §Utførelse — subagenter vs direkte

Moved verbatim from CLAUDE.md §Arbeidsflyt (#2100). Read at intake routing (§T1).

**Plan-eksekvering: alltid subagent-drevet.** Når det finnes et implementeringsplan-dokument (typisk `docs/plans/*-implementation.md`), kjøres den via `superpowers:subagent-driven-development`-skillet — fresh subagent per task, review mellom tasks. Ikke spør brukeren hvilket alternativ — valget er gjort.

**Byggeøkter fra hovedchat (orkestratoren):** når hovedchatten skal få et issue bygget, starter den en egen Claude Code-økt per issue via orkestrator-pluginen (`/orchestrator:run`, `/orchestrator:dispatch <N>`) — ikke en subagent. Prosjektreglene arbeiderne får ligger i `.claude/orchestrator.json`; kladdeboka i `.claude/orchestrator/` er lokal og gitignorert. Pluginen bor i eierens private repo `jdlarssen/claude-plugins`, installert som plugin-samlingen `jdl-plugins` (`~/.claude/plugins/marketplaces/jdl-plugins/orchestrator/README.md`).

**Modell-routing per subagent:** Sett `model`-parameteren eksplisitt på hvert `Agent`-kall — ikke arv Opus i blinde.
- **sonnet** for implementer-subagenter (følger ferdigskrevet plan), spec-compliance-reviewer (regel-følging), fix-subagenter med klare instrukser. Mekanisk arbeid med detaljert spec.
- **opus** for code-quality-reviewer (krever skjønn om tradeoffs), final whole-branch-review, brainstorming-co-pilot.
- **haiku** for trivielle lookups (sjelden verdt en subagent).

- **Substansielle oppgaver** (ny phase, ny side fra null, refaktorering over flere filer, ny komponent med tester): dispatch implementer-subagent via `Agent`-tool. Etterpå: spec-reviewer + code-quality-reviewer per workflow i `superpowers:subagent-driven-development`-skill. Holder hovedchat-konteksten ren.
- **Småfikser** (typo, en-linje-bug, justering av kopi): rediger direkte. Subagent er overkill.
- **Debugging og utforskning:** direkte (les filer, sjekk DNS, kjør curl). Subagent kun hvis det er tydelig avgrenset feltarbeid.
- **TDD for ren logikk** (scoring, sync, math): subagent-disiplin. Skriv test → feile → implementer → grønn → commit.

Ved tvil: hvis oppgaven kan beskrives ferdig i én prompt og forventes å produsere 5+ filer eller mer enn 100 LOC — bruk subagent.
