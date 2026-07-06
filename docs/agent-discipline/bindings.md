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
| `lib/sync/` | Dexie DB name `'golf-app'` is frozen — rename deletes users' local data (pre-commit blocks removal) |
| Any DB write / migration / RLS | §T3 below + `docs/bug-prevention.md` (the five traps) |
| `lib/mail/` | `lib/mail/AGENTS.md` (Type B snapshot rules); the best-effort send pattern's home is CLAUDE.md §Nøkkelfiler |
| Forms in wizard/game flows | State that must survive submit needs always-mounted hidden inputs (§T4 row 7); heed the warning comment in `components/ui/Disclosure.tsx` |
| `messages/*.json` or `t()`/`t.rich()` call sites | New keys, or values with `{placeholders}`/rich tags → render the route and watch the console (§T4 row 5). Plain-text edit of an existing key present in BOTH locales → the T7 click-through suffices; don't verify twice |
| A user flow (create → join → play → finish) | Fires when a STEP, SCREEN or DECISION POINT is added/removed/renamed/reordered — not for styling/copy inside an existing step. Update the `docs/flows/` diagram + regenerate the PNG in the same PR (`docs/flows/README.md`) |
| Next.js API not used this session | `node_modules/next/dist/docs/` — Next 16 breaking changes; middleware = `proxy.ts` |
| A destructive user action | Dedicated confirmation page under a `/slett`-style route — never inline toggle or `<details>` popout |
| Caching (`unstable_cache`, `cacheLife`) | Every cached read gets a tag; every mutation path calls `revalidateTag` — enumerate them (#1045) |
| New/changed Norwegian copy | Run the `humanizer:humanizer` skill before commit; the pre-commit hook warns on only 4 patterns — full catalog + preserved exceptions: `docs/copy-style.md` |

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
  request in this session is itself the mandate (CLAUDE.md §Brukerflyt-forankring).
- **Routing (this repo):** an implementation-plan document exists → run it via the
  subagent-driven-development skill (choice already made — CLAUDE.md §Arbeidsflyt).
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
  (`npx supabase gen types typescript --project-id snwmueecmfqqdurxedxv`), or hand-extend
  `lib/database.types.ts` with a `// TODO: regen after prod apply` marker and run
  `npm run gen:types` once the migration reaches prod.
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
| 6 | Scores not syncing between players | Dexie offline queue state; the realtime channel needs explicit `supabase.realtime.setAuth()` |
| 7 | Form value silently lost at submit | Conditionally-mounted input — only mounted DOM inputs reach FormData; mirror state via always-mounted hidden inputs (#1011) |

## §T5 — Testing

- Doctrine: `docs/test-discipline.md` (Type A–D + decision tree) is authoritative;
  summarized in CLAUDE.md §Test-disiplin.
- Area overlays: `lib/scoring/AGENTS.md` · `lib/mail/AGENTS.md`.
- E2E: assert on `data-testid`/role, never on Norwegian copy.
- Time idiom: `Date.now()` offsets or vitest fake timers.

## §T6 — Commit and PR

- **Metadata rules** (prefix → bump type, CHANGELOG line, `Refs #N`, escapes
  `[no-changelog]` / `[no-issue]`): CLAUDE.md §Versjonering + §Branch/PR-flyt — enforced
  by `.githooks/commit-msg`; its block text names the remedy.
- **Untracked work:** decide at intake — `gh issue create` with `type:`/`area:` labels +
  milestone (mandatory), or the rare genuine `[no-issue]`. Tier 1/Tier 5 milestone
  titles are mojibake-corrupted — set by number:
  `gh api -X PATCH repos/jdlarssen/golf-app/issues/N -F milestone=<num>`.
- **Gates:** `npx vitest run <path>` for every changed file with a co-located `*.test.*`
  sibling (glob for it — zero siblings is a checkable fact, not an excuse) +
  `npm run build` (§T2).
- **PR-checks command:** `gh pr checks` — every required check "pass", zero "skipping".
- **Merge:** `gh pr merge --rebase --delete-branch` (squash is denied); afterwards rebase
  the local branch onto `origin/main` before further work.
- **Closing comment** on every closed issue: `## Teknisk` + `## Funksjonell`
  (CLAUDE.md §Closing-kommentar) — the main chat writes it, not a subagent.
- **Reviewer findings** → issues (with milestone) before merge (CLAUDE.md
  §Reviewer-funn).

## §T7 — Done verification

- **User-visible = the commit prefix is feat/fix/perf without `[no-changelog]`** (reuses
  the hook-enforced definition, so the two homes cannot drift). Such a change → staging
  click-through of the affected flow BEFORE merge: `preview_start("torny-staging")`,
  autonomous OTP login per CLAUDE.md §Testing. A staging-minted code never validates
  against prod — confirm the data is staging-shaped before writing anything.
- Prod is in real use — never test against prod (CLAUDE.md §Testing — staging, aldri
  prod).
