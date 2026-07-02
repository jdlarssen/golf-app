# Contract: #1008 — AI-rundereferat ved avsluttet spill (Pressetribunen v1)

**Issue:** https://github.com/jdlarssen/golf-app/issues/1008 (del 2 av 4 i epic #1006)
**Branch:** `claude/xenodochial-poincare-63b7de`
**PR body:** `Closes #1008` + `Part of #1006`

## Goal

When a game is finished, generate one short Norwegian match report (3–6 sentences, sports-journalist tone) from the final leaderboard facts, store it once on the game row, and show it (1) on the finished leaderboard/result view, (2) in the game-finished email, (3) on the public spectator link. Failures never block the finish flow; without `ANTHROPIC_API_KEY` the feature silently degrades to today's behavior.

## Gray-area decisions (owner not present — recorded assumptions)

| # | Question (from issue) | Decision | Rationale |
|---|---|---|---|
| 1 | Language: always Norwegian or per-locale? | **Norwegian only, single stored string.** Block *heading* is catalog-keyed (no + en); the body renders as stored for every viewer/recipient. | Report is generated once and stored (issue requirement). Per-locale generation doubles cost/complexity for a segment that is Norwegian kompisgjenger. Precedent: `game_players.result_summary` is also stored single-shape. |
| 2 | Format coverage v1? | **All 22 modes** via `buildModeResultForGame` (`lib/scoring/buildModeResultForGame.ts:80`). Fact-serializer branches on `ModeResult.kind` **bands**: placement (strokeplay/stableford/scramble/points games), matchplay duel, skins. Patsome/round-robin simplified to totals + native segment subtotals. | The 16 result kinds collapse to ~3 narrative shapes (precedent: `computeResultSummaries`, `buildShareCardData`). Marginal cost per format is a serializer branch, not new scoring. |
| 3 | DNF / thin data? | `buildModeResultForGame` returns `null` → **skip**. Additionally skip when fewer than **6 holes** have any recorded score (computed deterministically from the result's hole rows). Otherwise generate; prompt scales length to holes played. | Mirrors the documented 🏆-fallback contract; <6 holes has no story. |
| 4 | Feature flag? | **No separate flag. `ANTHROPIC_API_KEY` presence gates** (VAPID pattern B: `lib/notifications/push/vapid.ts` — `isConfigured()` + silent no-op). | The issue itself specifies "uten nøkkel: degraderer stille". A three-state flag (passkey pattern) adds nothing server-side. |
| 5 | Placement + max length on result page? | **Below the podium/result content**, composed into the existing `footerSlot` (before `WithdrawnPlayersSection`) in every format renderer's finished branch. Max length enforced: prompt says 3–6 sentences, `max_tokens: 800`, output > 1500 chars → log + skip storing. | `footerSlot` is the established post-content hook (#386) already threaded through podium/duel views. Podium stays the emotional payoff; the story reads below. |
| 6 | Storage shape? | **Nullable `text` column `games.round_report`** (migration `0125_games_round_report.sql`). NULL = not generated → all surfaces fall back silently. | 0096-precedent (`result_summary`): "computed at endGame, service-role write, no RLS change". Row-level SELECT policies on `games` cover new columns automatically; spectator path bypasses RLS via admin client. Own table = more moving parts for one text value. |
| 7 | Model / API | **`claude-haiku-4-5`** (fixed in the issue), official `@anthropic-ai/sdk`, plain `messages.create`, `max_tokens: 800`, client `timeout` 20 000 ms, `maxRetries: 1`. No thinking/temperature params. | Issue pins the model for cost (~øre/game: ≲5 øre at $1/$5 per MTok with ~3K in / ~250 out). |
| 8 | Reopen → re-finish? | `reopenGame` **clears `round_report` to null**. Re-finishing regenerates. | Unlike the deterministic summaries, the LLM step can be skipped (missing key) — a stale report with wrong numbers must not survive a reopen. |
| 9 | Never contradict the leaderboard | The prompt receives a **deterministic fact JSON built in TS from `ModeResult`** (winner, top-3 with totals and margins, lead changes, matchplay margin/`decidedAtHole`/momentum via `runningMatchStatus`, skins pots/carry). System prompt forbids numbers not present in the facts. **The LLM never aggregates raw scores.** | Issue acceptance criterion; enforced by construction + Type A tests on the fact-builder. |
| 10 | Log prefix | Module prefix `[generateRoundReport]` (house style, like `[persistResultSummaries]`), not the issue's suggested `[endGame]` prefix. Deviation noted in closing comment. | Both end-actions call the same helper; module prefix identifies the failing step. |

## Architecture (verified against code 2026-07-02)

- **Generation module:** `lib/games/generateRoundReport.ts` — `import 'server-only'`, sibling of `persistResultSummaries.ts` (the template: admin client, whole-body try/catch, `console.error` + return status, NEVER throws). Pure, unit-testable pieces exported separately: fact-builder (`ModeResult` + name map → fact object), prompt builder (facts → system/user strings), output sanitizer.
- **Wiring (exactly two finish paths, verified):** `endGame` (`app/[locale]/admin/games/[id]/actions.ts:432`) and `endGameWithSideWinners` (`app/[locale]/admin/games/[id]/avslutt/actions.ts:53`). Call `generateAndPersistRoundReport(gameId)` as a fourth best-effort step after `notifyAchievementUnlocks`, **before** `buildGameFinishedRecipients`/mail blast (report must exist for the mail) and before `revalidateTag('game-${id}', 'max')`. `endGameMarkingWithdrawals` delegates to `endGame` — no own hook.
- **Read path:** add `round_report` to `getGameWithPlayers` (`lib/games/getGameWithPlayers.ts`): select string (~line 167), `GameForHole` type, **keyParts bump `'gwp2'` → `'gwp3'`** (documented stale-cache trap). Both the authed leaderboard page and `/spectate/[token]` consume this helper via `renderLeaderboardContent` — one wiring covers both surfaces. Note: `ShareResultButton`'s client-fetch pattern does NOT work on spectate (URL regex `/games/…/leaderboard` fails there) — that is why the report must be server-threaded, not client-fetched.
- **Result-page block:** presentational `RoundReportCard` (heading kicker «Fra pressetribunen» / en "From the press box", prose body, on-brand callout styling — champagne-gold accent border like `registrationRejected`'s blockquote). Composed into `footerSlot` in each format renderer's **finished** branch (formats/*.tsx + the best_ball default branch in `leaderboardContent.tsx` + matchplay duel views), report text threaded from `gwp.game.round_report`. Active/live views never render it.
- **Mail:** optional `roundReport?: string | null` on `GameFinishedNotificationParams` (`lib/mail/gameFinishedNotification.ts:143`), passed identically to all recipients from both call sites (game-scoped — does NOT belong in `buildGameFinishedRecipients`). Conditional block after the body line, `escapeHtml()` in the HTML branch, blockquote styling per `registrationRejected.ts:56–63` precedent. Catalog key `mail.gameFinished.reportHeading` in **both** `messages/no.json` and `messages/en.json` (catalogParity test enforces).
- **Migration `0125_games_round_report.sql`:** `alter table public.games add column if not exists round_report text;` + `comment on column` + header with issue ref + staging-first warning + the 0096/0123 RLS audit note ("inherits existing row-RLS; written via service-role; NULL until finish → nothing leaks pre-finish"). Additive nullable → safe to apply to prod before code deploys. Apply: staging (`snwmueecmfqqdurxedxv`) via Supabase MCP → verify → prod (`glofubopddkjhymcbaph`) → `npm run gen:types`.
- **Env:** `ANTHROPIC_API_KEY` added to `.env.example` with Norwegian comment block. Owner gets copy-paste Vercel instructions in the closing comment (Settings → Environment Variables). Known consequence: prod has no key until the owner adds it → feature stays dark, which is the designed rollout.

## Chunks

1. **Migration + types** — write 0125, apply to staging via MCP, verify column, apply to prod (additive nullable), `npm run gen:types`, commit.
2. **Generation module (TDD)** — `@anthropic-ai/sdk` dep; Type A tests first for fact-builder bands (placement solo/team, matchplay incl. margin + decidedAtHole + momentum, skins carry/pots, thin-data guard, name map via `formatRevealName`, never raw UUIDs), prompt builder (fasit numbers embedded verbatim, Norwegian instruction, 3–6 sentence constraint), sanitizer (trim, strip code fences, >1500 chars → reject). Then `generateAndPersistRoundReport`: missing key → `'skipped'` without SDK call; SDK error → logged, returns `'failed'`, never throws; success → `.update({ round_report }).eq('id', …).select()` via admin client.
3. **Finish-flow wiring** — call from both end-actions (before mail), clear on `reopenGame`, pass `roundReport` to `sendGameFinishedNotification` at both call sites.
4. **Mail block** — template change + Type B discipline: ONE new extractor keyed on the block's distinct styling, one present-case snapshot (no), existing `baseParams` cases lock absence, chrome lock untouched. Catalog keys no + en.
5. **Result page + spectate** — `getGameWithPlayers` column + keyParts bump; `RoundReportCard` (ONE Type C render test, max); footerSlot composition in all finished branches; verify `npm run build`.
6. **Verify + ship** — full gates, staging click-through (see below), version bump minor + CHANGELOG Funksjoner line, PR.

## Success criteria (from issue + derived)

- [ ] Finished game with full scoring gets a report on the result page, in the mail, and on the spectator link (staging-verified; see verification note)
- [ ] Report failure (API down, missing key, thin data) does not affect the finish flow — game finishes exactly as today (unit-proven + staging degrade-path verified, since staging has no key by default)
- [ ] The report never states numbers contradicting the leaderboard: prompt receives deterministic fact JSON (Type A tests assert fact JSON == ModeResult numbers and that the prompt embeds them); LLM never aggregates raw scores
- [ ] Type B snapshot test on the mail integration: one chrome lock (untouched), report block as extracted body, subject snapshots unchanged («Resultatet er klart — …» is locked)
- [ ] No API call on read — generation happens only inside the two end-actions (grep-provable: SDK imported only from `lib/games/generateRoundReport.ts`)
- [ ] All 22 modes produce facts (band coverage in Type A tests); `null` result / <6 scored holes → skip
- [ ] `reopenGame` clears the stored report
- [ ] Gates green: `npm run lint`, `npm run build` (includes tsc), `npx vitest run` (full suite), catalogParity
- [ ] Version bump (minor, feat) + CHANGELOG Funksjoner line

**Verification note (no ANTHROPIC_API_KEY on staging):** generation is verified by unit tests with the SDK mocked at the module boundary + (if a usable key exists in the build environment) one live smoke call. Display surfaces are verified on staging by writing a report string to a finished staging game via service role and checking all three surfaces render it; the finish flow is verified on staging in degrade mode (no key → finishes as today, no block rendered).

## Gates

- `npm run lint`
- `npm run build` (catches cacheComponents/tsc traps — never filter "pre-existing")
- `npx vitest run` (full; new tests + `lib/mail/gameFinishedNotification.test.ts` + colocated tests of changed files)
- Staging click-through of the affected flow before merge

## Out of scope (v1)

- Per-locale report generation; regeneration UI; retry queue for failed generations (issue: "feilet referat = ingen referat")
- Money-game settlement facts (`kr_per_unit`), side-tournament winner garnish in the prompt (may be added later)
- Backfill of already-finished games (a `scripts/backfill…` follow-up if the owner wants it)
- Push/in-app notification changes — only the three surfaces named in the issue
