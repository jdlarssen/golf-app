# Evaluation: #1363 reopen-notifications

**Verdict: ACCEPT** (locally verifiable scope — staging click-through of both flows remains, by design, the main session's pre-merge gate)

- Branch: `claude/1363-reopen-notifications` (2 commits: contract d051fb7e + feat 1ec03bcb)
- Evaluated: 2026-08-11, fresh-context skeptical pass. All commands run in this session.
- Context given to evaluator: migration 0158 already applied to staging (independently re-verified below); prod absence is by design (owner applies via #1074 gate before merge).

## Per-criterion results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| C1 | Reopened scorecard → player gets in-app varsel with game name, deeplink to game home | PASS (unit) / DEFERRED-TO-STAGING (e2e) | `actions.ts:373-385` notify with `game_name: game!.name` after successful UPDATE; `deeplink.ts` case `scorecard_reopened` → `/games/${game_id}`; unit tests `actions.test.ts` («reopens a submitted scorecard and notifies the player») + `deeplink.test.ts` («#1363: both reopen kinds land on game home») green |
| C2 | Reopened game → all active (non-withdrawn) participants notified | PASS (unit) / DEFERRED-TO-STAGING (e2e) | `actions.ts:547-561`: roster `select('user_id').eq('game_id',…).is('withdrawn_at', null)`, actor excluded via `.filter((p) => p.user_id !== user.id)`, fan-out via new `notifyPlayersGameReopened` (`events.ts:168-193`, `Promise.allSettled` + `console.error`); `events.test.ts` 4 new tests green |
| C3 | Failed notify does not change the reopen outcome | PASS | `actions.ts:373-385`: try/catch closes at :385, redirect at :390 outside it. Unit test «notify failure does not change the outcome of the reopen» asserts redirect + `console.error('[reopenScorecard] scorecard_reopened notify failed', …)`. Helper never rejects (allSettled); `events.test.ts` «logger notify-rejection uten å kaste» asserts `resolves.toBeUndefined()` |
| C4 | No varsel on no-op reopen (card never submitted) | PASS | `actions.ts:332-358`: `expectAffected(… .select('user_id'), 'reopenScorecard')`; `NoRowsAffectedError` → revalidateTag + `?status=scorecard_reopened` success redirect WITHOUT `logAdminEvent` and WITHOUT `notify` — exact mirror of the `adminApproveScorecard` precedent (:198-210). Unit test asserts `notifyMock` AND `logAdminEventMock` not called |
| C5 | Kind-CHECK extended + applied to staging; types/zod/cardContent/deeplink/EMOJI/mark-read cover both kinds; tsc/lint/vitest green | PASS | See migration, staging, layer, and gates sections below |
| C6 | Staging verification of both flows before merge | DEFERRED-TO-STAGING | Main session's job per evaluation brief; migration presence on staging already independently confirmed here |

## Migration 0158 (`supabase/migrations/0158_reopen_notifications.sql`)

- **Numbering:** `git ls-tree origin/main supabase/migrations/` tops at 0157 → 0158 is free. PASS
- **Value list (mechanical set-diff):** 0158 has 28 kinds = 0149's 26 + exactly `scorecard_reopened`, `game_reopened`. `comm -23` (0149 minus 0158) empty → nothing dropped, nothing renamed. PASS
- **Union cross-check:** `lib/notifications/types.ts` `NotificationKind` union (28 members) set-diffs empty against 0158's list. PASS
- **Atomic drop+add in one file, deploy-order header present** (lines 15-19: "MÅ ligge i basen før koden … deployes"). PASS
- **Staging applied — independently verified:** read-only `pg_get_constraintdef` on staging (`snwmueecmfqqdurxedxv`) returns the CHECK with all 28 kinds including both new ones. PASS
- **Prod:** not applied — BY DESIGN; owner applies via firewall #1074 before merge. This is a never-auto-merge PR per contract.

## Types / render layer (compile-enforced, tsc exit 0)

- `types.ts`: union + `scorecardReopenedSchema`/`gameReopenedSchema` (both `actor_name: z.string().min(1).nullable().optional()` — no hardcoded Norwegian fallback in payload, per contract) + both in `schemas` map (:337, :339). PASS
- `cardContent.ts`: cases for both kinds; `actor_name ?? t('organizerFallback')` resolves fallback at render time. PASS
- `deeplink.ts`: both kinds → `/games/${game_id}` (grouped with `scorecard_rejected` case, explicit comment why not `/leaderboard` or `/submit`). PASS
- `NotificationCard.tsx` EMOJI: `scorecard_reopened: '🔓'`, `game_reopened: '🔄'` — with collision rationale vs ↩️/🏁/⛳. PASS

## Call-sites (`app/[locale]/admin/games/[id]/actions.ts`)

Hostile-read checklist from the brief:

- notify on error path? **No** — both DB-error branches redirect before any notify.
- payload missing `game_name`? **No** — present at both sites.
- game select actually extended? **Yes** — `select('name, status')` at :318 (reopenScorecard); reopenGame already selected `name`.
- redirect swallowed by catch? **No** — notify try/catch ends :385, redirect :390; in reopenGame there is no try/catch around the redirect at :567 (helper cannot reject). The NEXT_REDIRECT throws inside the expectAffected-catch (:354, :357) propagate freely — unit tests confirm via `rejects.toBeInstanceOf(RedirectError)`.
- reopenScorecard uses `loadAdminContext` (not #1362's variant) — contract-compliant: builds are independent.

## mark-read (`app/[locale]/games/[id]/(home)/page.tsx`)

Both kinds added to the `markNotificationsRead` batch (:320 `scorecard_reopened`, :325 `game_reopened`), alongside `scorecard_rejected`, with #1358-regression rationale. PASS

## i18n

- `messages/no.json` + `en.json`: `inbox.organizerFallback` + `inbox.kinds.scorecardReopened.{title,detail}` + `inbox.kinds.gameReopened.{title,detail}` in BOTH catalogs; placeholder sets syntactically identical (`{actorName}`, `{gameName}` in both locales' details). PASS
- `npx vitest run messages/catalogParity.test.ts` → 1 file, 2 tests passed. PASS

## Tests

- `git diff origin/main..HEAD --name-status`: only new files are the contract + migration 0158 — all three test files are `M` (extensions in existing files, no new test files). PASS
- `npx vitest run lib/notifications/ 'app/[locale]/admin/games/[id]/actions.test.ts' components/notifications/NotificationCard.test.tsx messages/catalogParity.test.ts` → **16 files, 174 tests, all passed**. PASS

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0; 0 errors, 55 warnings. Two warnings touch changed files (`cardContent.ts` complexity 45, `deeplink.ts` complexity 29) — **verified pre-existing** by linting origin/main's versions (41 and 27, already over the 25 threshold; growth inherent to adding kinds, same as every prior kind extension) |
| `npm run build` | exit 0 |
| e2e `@gate` vs staging | DEFERRED-TO-STAGING (main session / CI) |

## Metadata

- Feat commit 1ec03bcb: body ends `Refs #1363`. PASS
- `package.json` 1.232.0 → **1.233.0** (minor, correct for feat); `package-lock.json` diff is version-only (both fields). PASS
- CHANGELOG: `1.233 · Beskjed når kortet ditt åpnes igjen` Funksjon entry with #1363 link. PASS

## Scope audit

Every changed file is in the contract's «Files Likely Touched» list (+ `actions.test.ts`, covered by the contract's test clause «evt. én call-site-assert» — three call-site tests is more than «én», but each maps 1:1 to a success criterion (happy path, C4 no-op, C3 notify-failure), so justified, not drive-by). No unrelated edits found. PASS

## Findings (non-blocking)

| Signature | Severity | Note |
|---|---|---|
| `lib/notifications/events.test.ts` + C2 | cosmetic | Test name «… til hver innsendt spiller» — should read «aktiv» (semantics is every active player, not submitters); assertions are correct, name only |
| `app/[locale]/admin/games/[id]/actions.ts:356` + C4 | info | 0-row path calls `revalidateTag` but skips the `revalidatePath` calls of the full-success path — exact mirror of the sanctioned `adminApproveScorecard` precedent, and nothing changed on a no-op, so correct; noted for completeness |

## Unverifiable in this session

- Staging click-through of both flows (C1/C2/C6 end-to-end) — main session's pre-merge gate.
- Prod migration application — owner-gated (#1074), hard merge-order requirement stands: **apply 0158 to prod BEFORE merging** (main auto-deploys; code before CHECK = silent insert failures identical to the bug being fixed).
