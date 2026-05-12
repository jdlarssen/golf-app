# Plan — Hull-skjerm score-input redesign (quick-win-1)

**Spec source:** `docs/design/realized/quick-win-1/README.md` + `design-reference.html`
**Goal:** Replace today's `app/games/[id]/holes/[holeNumber]/page.tsx` + `HoleScoreInput.tsx` with the redesigned default-to-par interaction. Keep existing Dexie + sync wiring (`writeScore`, `localDb`, `syncWorker`).

## Constraints

- Mobile-first, tap-targets ≥44px (per CLAUDE.md).
- Norwegian user copy; English identifiers/comments.
- No change to data shape — scores still go through `lib/sync/writeScore.ts`.
- Use existing tokens in `app/globals.css` (no new CSS variables). Score-tone derivatives from spec (`#2F5A3C`, `#7A2F2A`, `rgba(74,124,89,0.16)`, etc.) get baked into Tailwind utility classes or inline styles — they're presentation-layer, not tokens.
- Keep `lib/scoring/strokeAllocation.ts:strokesForHole` for the `+slag` badge math (unchanged).
- Auth guards, RLS reads, `me.submitted_at` redirect, `game.status === 'draft'` redirect — all preserved.

## Resolved decisions (no need for subagent to surface)

1. **Hole length (meters):** schema has no per-hole length. Render right column as `Par {par}` over `indeks {stroke_index}` only (no `· meter`).
2. **Tournament name in header:** add `name` to the existing `games` select. Show truncated, centered, uppercase tracking-widest per spec.
3. **Back chevron destination:** `/games/{id}` (game home — keeps users in the game flow; Mitt kort reachable from there).
4. **Hole 18 bottom CTA:** when `holeNumber === 18` and all confirmed, label becomes `Lever scorekort` and navigates to `/games/{id}/scorecard`. Other holes: `Neste hull · {N+1}` → `/games/{id}/holes/{N+1}`.
5. **"Confirmed" semantics:** a card is confirmed when there is a non-null `strokes` value in Dexie for that user+hole. (We do NOT introduce a new "user touched but didn't save" state — every score-set fires `writeScore` immediately, just like today.)
6. **Sync dot for the page-level status line:** derive from the page-level syncing flag (700ms after any local write). Per-card sync state already exists in today's component but the new design lifts it to one status line at bottom of cards list, not per-card.
7. **`gameInactive`:** if `game.status !== 'active'`, render the page in read-only mode — cards show current scores, no tap/swipe/buttons fire. Settings still works.
8. **Onboarding banner:** `localStorage["torny-hole-hint-dismissed"] === "1"` → don't show. Dismissed on first interaction OR on × tap. Only shown on hole 1.

## File map

**New files:**
- `lib/scoring/scoreTone.ts` (+ `.test.ts`) — pure helpers: `deltaLabel`, `scoreTone`, color/bg classification
- `lib/hooks/useInputMode.ts` (+ `.test.ts`) — `useInputMode()` reads/writes `localStorage["torny-input-mode"]`, returns `[mode, setMode]`. SSR-safe.
- `components/hole/ScoreCard.tsx` — presentational card with both swipe and buttons modes (pointer-events for swipe, ⋯ trigger for sheet, +/− steppers in buttons mode)
- `components/hole/ScoreCard.test.tsx` — gesture/tap unit tests via `@testing-library/react` + `fireEvent.pointerDown/Move/Up`
- `components/hole/HoleStrip.tsx` — 1–18 horizontal strip, server-rendered links
- `components/hole/HoleHero.tsx` — kicker + big hole number + par/indeks right column
- `components/hole/OnboardingBanner.tsx` — first-run forest banner with champagne accent
- `components/hole/SyncStatusLine.tsx` — dot + sentence (no spinner)
- `components/hole/BottomActionBar.tsx` — full-width CTA
- `components/hole/SettingsSheet.tsx` — bottom sheet with two radio cards (klikk-og-dra / + − knapper)
- `components/hole/SpecificValueSheet.tsx` — bottom sheet with par−2..par+5 grid

**Modified:**
- `app/games/[id]/holes/[holeNumber]/page.tsx` — server component fetches game.name + flight + hole + scores, passes to new client wrapper. Renders new header + hole strip + hero + cards client component + bottom bar.
- `app/games/[id]/holes/[holeNumber]/HoleScoreInput.tsx` — **deleted**, replaced by a new client wrapper.

**New client wrapper:**
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — orchestrates Dexie reads (one `useLiveQuery` for the whole flight's hole scores), maps to card props, wires callbacks to `writeScore` → `drainQueue`, manages `inputMode` (from hook), `showHint`, `syncing` flag with 700ms reset, `savedAt` from server-acked time, opens/closes both sheets, handles `gameInactive` read-only.

## Acceptance criteria (from spec)

- [ ] Score defaults to par; card shows par as a ghost value (color #9A8F7C, opacity 0.55) before any interaction
- [ ] Single tap on a card confirms par and fires `writeScore`
- [ ] Swipe up ≥16px → +1, swipe down ≥16px → −1 (swipe mode), tap = par
- [ ] Long-press 500ms (movement ≤4px) → opens specific-value sheet (swipe mode)
- [ ] +/− steppers + ⋯-for-specific-value (buttons mode), no drag, `touch-action: auto`
- [ ] Input mode persists in `localStorage["torny-input-mode"]`, default `"swipe"`
- [ ] Sync status row: green dot + `Lagret · HH:MM` idle, amber dot + `Sender…` syncing — no spinners
- [ ] Card background stays white on confirm; border color shifts to `rgba(201,169,97,0.5)`
- [ ] Score number colors: under par `#2F5A3C`, par/+1 `#1A2E1F`, +2 or worse `#7A2F2A`
- [ ] Delta pill colors per spec (under/par/+1/+2 backgrounds and foregrounds)
- [ ] Bottom CTA full-width, disabled (bg `#D9D2C0`, color `#9A8F7C`) until all 4 confirmed
- [ ] Safe-area top padding 54px and bottom 34px respected
- [ ] Onboarding banner shows only on hole 1, only if not dismissed; dismisses on first interaction or × tap; persists to localStorage
- [ ] Hole strip: current = forest bg + bg-tint text, completed = `#EFE9DA` bg + border, future = transparent
- [ ] Tap any hole cell → navigate to that hole
- [ ] `+1 SLAG` badge in champagne when player has handicap strokes on this hole

## Task breakdown (subagent-sized)

### T1 — Pure helpers + tests
Files:
- `lib/scoring/scoreTone.ts` + `.test.ts`
- `lib/hooks/useInputMode.ts` + `.test.ts`

Surface area: small, no React rendering. TDD-disiplin (write tests first, run them red, implement, green, commit).

### T2 — ScoreCard component
Files:
- `components/hole/ScoreCard.tsx` + `.test.tsx`

Most complex single piece (gesture handling). Tests cover: tap = par, swipe up = par+1, swipe down = par−1, long-press fires onLong, stepper buttons clamp [1, 12], buttons mode doesn't react to drag.

### T3 — Supporting components
Files:
- `components/hole/HoleStrip.tsx`
- `components/hole/HoleHero.tsx`
- `components/hole/OnboardingBanner.tsx`
- `components/hole/SyncStatusLine.tsx`
- `components/hole/BottomActionBar.tsx`
- `components/hole/SettingsSheet.tsx`
- `components/hole/SpecificValueSheet.tsx`

Mostly presentational. Light test coverage — render + key prop wiring (e.g., disabled state on bottom bar, sheet close on backdrop click).

### T4 — Page integration
Files:
- `app/games/[id]/holes/[holeNumber]/page.tsx` (modified)
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` (new)
- `app/games/[id]/holes/[holeNumber]/HoleScoreInput.tsx` (deleted)

Wires it all together. Single `useLiveQuery` over the flight's 4 scoreKeys, derives `confirmed` from non-null strokes, maps Dexie reads to ScoreCard props, fires `writeScore` + `drainQueue` on callbacks, manages syncing timing (700ms reset) and `savedAt`. Tests: light — most behavior is in T1/T2.

After all 4: visual smoke test on the user's phone, deploy.
