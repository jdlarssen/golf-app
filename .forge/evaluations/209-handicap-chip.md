# Evaluation: #209 Handicap-chip på hjem-siden

**Date:** 2026-05-25
**Branch:** claude/ecstatic-swanson-aaa7b1
**Commits:** `1dd0421` (chunk 1: component + tests), `17075de` (chunk 2: wire-up + version bump)
**Verdict:** ACCEPT

## Criterion checks

- **K1** ✓ — `components/handicap/HandicapChip.tsx:15-49` exports named `HandicapChip` with the exact three props (`hcpIndex: number`, `handicapUpdatedAt: string`, `nextPath: string`). Renders a `SmartLink` to `` `/profile?next=${encodeURIComponent(nextPath)}` ``  with the «HCP» label (`font-sans text-[10px] uppercase tracking-[0.16em] text-muted`) and the tabular-nums number formatted via `toLocaleString('nb-NO', ...)`. Wired into both states in `app/page.tsx:164-171` (computed once) and consumed at line 252 (`PageHeader.action`) and line 196 (`<div className="mt-5">{handicapChip}</div>` in empty state).

- **K2** ✓ — Stale branch (line 30-33): `border-accent/60 bg-surface` + `text-accent` on the number; fresh: `border-border bg-surface` + `text-text`. Tests at `HandicapChip.test.tsx:44-63` cover both. `npm test -- --run components/handicap/HandicapChip.test.tsx` → 7/7 passing, including both styling assertions.

- **K3** ✓ — `git diff 586701f -- app/page.tsx` confirms one select-string was extended to `'name, email, is_admin, profile_completed_at, hcp_index, handicap_updated_at'` (line 105). No new round-trip; profile fetch still part of the same `Promise.all` with active/finished games.

- **K4** ✓ — Non-empty state (line 250-253): `<PageHeader title={...} action={handicapChip} />`. Empty state (line 191-197): the chip sits between welcome paragraph (`<p>` at 191) and CTA `<LinkButton>` (197-205), as `<div className="mt-5">{handicapChip}</div>`. Hierarchy reads Medallion → Kicker → h1 → paragraph → chip → CTA → PullQuote → footer (unchanged).

- **K5** ✓ — Chip href: `/profile?next=%2F`. `app/profile/actions.ts:17-18` reads `next` from FormData and runs `safeNextPath()` (`app/profile/safeNext.ts`) — `'/'` passes (`startsWith('/') && !startsWith('//')`). Line 68 redirects to `nextSafe ?? '/profile?profile=updated'`, so user returns to `/` after save. No new redirect code paths.

- **K6** ✓ — `npm test`: 85 files, 986 tests passing (matches plan: 979 → 986 = +7 chip tests).

- **K7** ✓ — `npm run lint`: 5 errors, all in `e2e/sync/offline-sync.spec.ts` from commit `5866728` (the pre-existing baseline noted in the brief). 8 unrelated warnings, none from this PR. `npm run build` succeeded (full route table generated, including `/`).

- **K8** ✓ — `package.json` version `"1.20.0"`. `CHANGELOG.md`:
  - New `## 1.20.y — Handicap-chip på hjem-siden` heading open at top with serie-sammendrag (lines 13-15).
  - `### [1.20.0] - 2026-05-25` entry with stakeholder tagline as blockquote (line 19).
  - Previous `1.19.y` series wrapped in `<details><summary><strong>1.19.y — Handicap-sjekk før runden (1 oppføring) — klikk for å vise</strong></summary>` (lines 40-76).
  - Tagline scanned for AI tells: no em-dash chains (one em-dash used naturally), no anglicisms, no «Tap» (user-facing wording is «Trykk for å oppdatere»). Aria-label inside the component also uses «Trykk». The one «Tap →» occurrence is in a developer JSDoc comment in `HandicapChip.tsx:10` — not user-visible, fine.

## Gates

- `npm test` — 986 passed (85 files)
- `npm run lint` — 5 pre-existing errors only (e2e/sync/offline-sync.spec.ts from `5866728`), no new errors
- `npm run build` — succeeded

## Strengths

- The chip is computed once (line 164-171) and reused in both states — no duplication of the defensive null-check.
- Defensive guard `profile?.hcp_index != null && profile?.handicap_updated_at` correctly allows `0` and `54.0` (default beginner) while rejecting nulls.
- `Number(profile.hcp_index)` coerces from the Supabase numeric type — proper defensive typing.
- Test coverage exceeds the contract's «foreslår én enkel component-test» — 7 tests covering label, decimal-comma, whole-number formatting, default `54.0`, href-encoding (with a complex path), fresh styling, stale styling, aria-label.
- Tap target uses `min-h-[44px] px-3.5` per CLAUDE.md mobile-first rule.
- Reuses all #168 infrastructure (`isHandicapStale`, `safeNextPath`, `?next=` mechanic) — no parallel implementations.

## Notes

- Empty-state hierarchy gains a chip between paragraph and CTA. Visual balance must be confirmed on Vercel preview per project's «production-only testing» convention — not in code-spec scope.
- `Suspense` boundary in `app/page.tsx` wraps `HomeBody`, so the chip arrives with main content (no separate skeleton — acceptable per contract's «Loading state» edge case).
- One minor inconsistency: the JSDoc comment in `HandicapChip.tsx:10` uses «Tap» (English noun) while the user-facing aria-label and CHANGELOG use «Trykk». Developer prose, not flagged by the humanizer hook (which skips comments) — acceptable. Could be tightened in a follow-up but not blocking.
- `npm run lint` does not differentiate new vs. pre-existing in its output. Manually verified the 5 errors trace to `e2e/sync/offline-sync.spec.ts` (commit `5866728`, on `main` before this branch), not to any file touched in this PR.
- First-login flow safety verified: `app/page.tsx:135-137` redirects to `/complete-profile` before the chip-rendering code runs, so brand-new users never hit the chip with a half-populated profile.
