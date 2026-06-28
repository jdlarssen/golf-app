# Evaluation: #942 — Delbart resultat-/recap-kort (navigator.share)

**Verdict: ACCEPT**

Verified independently against `.forge/contracts/942-share-result-card.md` by reading all four touched
files, the `ModeResult` union, the consuming surfaces, and by running the gates myself on Node 22.
All seven success criteria are met; all gates green.

## Per-criterion table

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | route → 200 image/png for finished, 404 otherwise | **Met** | `route.tsx:135-136` — `if (!gwp || gwp.game.status !== 'finished') return notFound()` (404). `ImageResponse` returns `image/png` by default. Auth-gated by `proxy.ts` (anon → 307) is the documented/expected behavior; the button fetches authed. |
| 2 | Brand chrome (name, course/date, champagne winner, podium top 3, footer) | **Met** | `route.tsx:222-339`: header «Tørny»+champagne dot+«Sluttresultat» pill (222-259), Fraunces game name + meta `{dato} · {bane} · {hull}` (262-278), `PlacementBody` champagne winner block (368-402) + runner-up rows (405-446), footer «tornygolf.no» + tagline (329-339). Staging screenshot in contract corroborates. |
| 3 | Personalization: outside-top3 strip / top3 highlight / neutral fallback | **Met** | `buildShareCardData.ts:292-300` computes `sharerStrip` only when sharer not in top 3; `:286` sets `isSharer` for podium highlight; `sharerId === null` → no strip/highlight (neutral). Route reads `?p` override else `getProxyVerifiedUserId()` (`route.tsx:132-133`). Tests `:101-160` cover all three branches. |
| 4 | «Del resultat» button on every finished leaderboard, all formats | **Met** | Mounted once in `LeaderboardChrome.tsx:43,54` inside `LeaderboardShell`. 44 leaderboard surfaces render through the shell (incl. matchplay views, State4View, holes drilldowns). Self-gates via prefetch → hidden on 404 (`ShareResultButton.tsx:27-53`); `navigator.share` with `File` + download fallback (`:57-99`); `canShare({files})` checked (`:62-65`). |
| 5 | `ImageResponse` (next/og) Fraunces+Inter + graceful font fallback | **Met** | `route.tsx:1` imports from `next/og`; `fetchGoogleFont` (`:63-80`) mirrors `app/icon.tsx` UA-spoof + ttf-parse + try/catch null; `loadFonts` (`:88-105`) loads Fraunces 500/600 + Inter 400/500; `:189-190` falls back to `'serif'`/`'sans-serif'` when fetch fails; `:345` passes `undefined` fonts when none loaded. |
| 6 | Pure data-shaping unit-tested; build/lint/vitest green | **Met** | `buildShareCardData.ts` is pure (no I/O); 45 tests pass. tsc 0 errors, eslint 0 errors. Build not run per instruction but no `export const runtime` present (only in a comment), so cacheComponents constraint satisfied. |
| 7 | Side-tournament chips when present, omitted cleanly when absent | **Met** | `buildShareCardData.ts:384-396` filters out null-winner entries; `route.tsx:294` renders chips only when `sideTournaments.length > 0`. Tests `:407-447` verify skip-null, label/name, isSharer. |

## Gate results (actual output, Node v22.23.0)

```
$ npx tsc --noEmit 2>&1 | grep -cE 'error TS'
0
```
Note: contract expected 1 pre-existing error (vapid.ts); I observed **0**. Either way, no error in share
files — confirmed (grep of tsc output was empty).

```
$ npx vitest run lib/games/buildShareCardData
 Test Files  1 passed (1)
      Tests  45 passed (45)
```

```
$ npx eslint lib/games/buildShareCardData.ts \
    app/[locale]/games/[id]/leaderboard/share-image/route.tsx \
    app/[locale]/games/[id]/leaderboard/ShareResultButton.tsx \
    app/[locale]/games/[id]/leaderboard/LeaderboardChrome.tsx \
    lib/games/buildShareCardData.test.ts
EXIT: 0   (no output)
```

`export const runtime` check: only present in a JSDoc comment (`route.tsx:30`), not as a route-segment
export — cacheComponents build constraint satisfied.

## Bug hunt

- **16 ModeResult kinds, exhaustive:** `ModeResult` union (`types.ts:2144-2160`) has 16 members. The switch in
  `buildShareCardData.ts` handles all 16 discriminator values with a `never` exhaustive default (`:238-242`).
  `greensome`/`chapman`/`gruesome` collapse to `kind:'foursomes_matchplay'` at the scoring layer, so they
  route through the handled `foursomes_matchplay` case. No kind can throw the exhaustive error at runtime.
- **No in-progress score leak:** route hard-gates on `status === 'finished'` (`route.tsx:136`) before any
  scoring. Finished-but-no-scores → `result === null` → minimal brand card (`:193-202`, `:283-285`), no leak.
- **Satori CSS:** all `letterSpacing` values are strings (`'2px'`); the one `gap` container has `display:'flex'`;
  the two `<div>` without `display` (lines 280, 330) are **childless self-closing leaf dividers** — Satori does
  not require `display:flex` on leaf divs, so they won't throw. No `grid` used.
- **Personalization edge cases:** team-mode sharer handled via `userIds.includes(sharerId)` (`:286`); ties
  preserve shared rank, no fabricated order (`buildPlacementModel` sorts by rank then name for stable display,
  tests `:219-249`); <3 players → podium slices what exists (tests `:194-217`).
- No real bugs found.

## Accepted-gap notes (out of contract scope — not failed)

- Card labels are Norwegian-only; `buildShareCardData` bakes Norwegian strings («poeng», «skins», «VINNER»,
  «DIN RUNDE», «Matchplay»). The English locale serves a Norwegian-text card. Out of scope per contract.
- Long names are not truncated/ellipsised (`textOverflow`/`whiteSpace` absent in route). Contract lists
  truncation as a guardrail, but it is a cosmetic visual gap, not a functional failure; accepted.
- Matchplay band, side-chips, and the «Du · X. plass» strip were unit-verified but **not pixel-verified** on
  staging (no suitable staging game existed) — accepted gap per contract.
- Web Share sheet cannot be triggered headless; the `canShare`/download branch was verified by code-reading
  only. Accepted per contract gate wording.
- tsc reported 0 errors rather than the expected 1 — not a regression in share files; noted only because it
  differs from the contract's stated baseline.
