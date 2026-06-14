# Evaluation: #624 — App-wide game.name localization

**Verdict: ACCEPT**
**Date:** 2026-06-14
**Commits:** c1a9bc9b (contract), dc3b05c1 (wave 1), f061ac0f (extension)
**Version:** 1.129.4 → 1.129.6

## Process

1. **Wave 1** (dc3b05c1, 1.129.5) — all surfaces in the contract's Groups A/B/C wrapped with `localizeGameName`.
2. **Formal skeptical evaluation** (fresh opus sub-agent) — ran tsc/test/eslint independently, verified the leaderboard prop-shadowing architecture (no `gwp.game.name` bypass, `game.name` is display-only, localized copy declared before all branch returns), verified every Group B select carries `courses(name)` alongside the type field (no silent no-op), verified /no byte-identity. **Verdict: ACCEPT.** Noted additional player-facing surfaces outside the issue's enumerated list.
3. **Extension wave** (f061ac0f, 1.129.6) — owner chose "engelsk måned overalt"; #624 is the app-wide-sweep umbrella, so the evaluator-found surfaces were wrapped too (player slett, admin avslutt + avslutt-likevel, player avslutt, admin trekk-spiller, spillere, approve + scorecard back-label, holes/[holeNumber] header, team-signup H1 fallback).

## Final gate results

- `npx tsc --noEmit` — CLEAN.
- `npx vitest run lib/games/autoGameName.test.ts` — 46/46 pass; **0 diff lines vs main** (no new render tests, per Type C ceiling).
- `npx eslint <changed>` — only two PRE-EXISTING warnings (`teamsTotalLabel` admin/games/[id]/page.tsx:436, `tScorecard` approve/page.tsx:162) — both unrelated to this change, in untouched sub-scopes.
- `npx next build` — Compiled successfully, 256/256 static pages generated.
- Whole-app sweep — zero remaining raw `game.name` display renders. Only safe categories remain: notification payloads (recipient-locale, not request-locale), the helper's own input arg, a comment, the edit-form initial value, and the CSV export cell.

## Criteria

All contract success criteria met (Groups A/B/C + cross-cutting) plus the extension wave. `/en` shows English month names in every game-name display title; `/no` byte-identical (helper early-returns for 'no', every wrap passes the real locale). Cached `getGameWithPlayers` deliberately NOT extended — slim parallel `courses(name)` fetches used at leaderboard/holes/consumer call-sites, honoring the documented no-course-join-in-cache decision.
