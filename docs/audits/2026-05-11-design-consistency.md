# Design-consistency audit — 2026-05-11

## Summary

Audit scope: every route under `app/`, all shared primitives in `components/ui/`, the recently-shipped hole-redesign components in `components/hole/`, plus `components/IosInstallHint.tsx`, `components/PwaBoot.tsx`, and `app/games/[id]/leaderboard/LeaderboardConfetti.tsx`. Light-mode only (project is currently locked to `data-theme="light"`).

The codebase is split cleanly into two visually-different worlds:

1. **Polished surfaces** that use the forest-and-champagne token system correctly: `/login`, `/` (home), `/games/[id]/leaderboard`, `/admin/games/[id]` (game detail), and every component in `components/ui/` + `components/hole/`. These already use `text-text`, `text-muted`, `bg-primary`, `bg-primary-soft`, `border-border`, `font-serif`, `tabular-nums`, and the `Banner` / `Card` / `PageHeader` / `Button` primitives consistently.

2. **Stale Tailwind-default surfaces** that have never been migrated off zinc/green/blue/red literals: `/complete-profile`, `/profile`, `/games/[id]` (game home), `/games/[id]/scorecard`, `/games/[id]/submit` (incl. `SubmitForm`), `/games/[id]/approve` (incl. `ReviewActions`), `/games/[id]/leaderboard/holes`, every page under `/admin/courses` and `/admin/invitations` and the `/admin/games` listing, the `/admin/games/new` form (`GameForm`), `StartGameButton`, `EndGameButton`, `ApprovePlayerButton`, `DeleteCourseButton`, and `components/IosInstallHint.tsx`. These are the source of the "text colors are subtly inconsistent" feeling.

The split correlates with shipping date: the surfaces that received a deliberate redesign pass (home/login/leaderboard/admin-detail/hole) use tokens; the surfaces that haven't been touched since the Phase 0-5 scaffolding still use Tailwind's neutral palette. About **160 distinct off-token usages** were found across 19 files. PWA manifest also ships an off-brand `theme_color`.

## Canonical tokens (recap)

From `app/globals.css`:

| Token | Hex | Tailwind utility | Use for |
|---|---|---|---|
| `--bg` | `#f8f6f0` | `bg-bg` | Page background (linen) |
| `--surface` | `#ffffff` | `bg-surface` | Card surface |
| `--border` | `#e5e0d3` | `border-border` | Hairlines, dividers |
| `--text` | `#1a2e1f` | `text-text` | Primary text |
| `--text-muted` | `#5c5347` | `text-muted` | Secondary text, captions, helper |
| `--primary` | `#1b4332` | `bg-primary`, `text-primary` | Primary actions, brand mark |
| `--primary-hover` | `#2d5a40` | `bg-primary-hover` | Primary hover |
| `--primary-soft` | `#e8efe8` | `bg-primary-soft` | Tinted hover/selected backgrounds |
| `--accent` | `#c9a961` | `text-accent`, `bg-accent` | Champagne — winners, kickers, highlights |
| `--success` | `#4a7c59` | `text-success` | Success states |
| `--danger` | `#b8463e` | `text-danger`, `bg-danger` | Destructive actions, errors |
| `--warning` | `#d89b3a` | `text-warning`, `bg-warning` | Warnings |

Font families: `font-serif` (Fraunces) for hierarchy + numbers; `font-sans` (Inter) for UI body. Spacing scale: `4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 24` px. Radii: `7 / 9 / 12 / 16 / 9999`.

## Per-surface inventory

### `/login` — `app/(auth)/login/page.tsx`

- **Text**: `text-text` (heading via `text-center text-text`), `text-muted` (footer paragraph).
- **Background**: `bg-bg` (via `AppShell`), `bg-surface` (via `Card`).
- **Border**: `border-border` (via `Card`, `Input`).
- **Typography**: `font-serif` heading; `font-sans` body via inherited `body`. Norwegian glyphs OK.
- **Spacing notes**: `mt-8`, `mb-6`, `mb-4`, `space-y-4`, `mt-6`, `mt-2`. All on-scale.
- **Verdict**: ✅ Clean, fully tokenised.

### `/complete-profile` — `app/complete-profile/page.tsx`

- **Text**: literal `text-zinc-600 dark:text-zinc-400` (intro paragraph, line 59) — should be `text-muted`.
- **Background**: via `AppShell` + `Card` — clean.
- **Border**: via `Card` + `Input` — clean.
- **Typography**: heading via `PageHeader` → `font-serif`. Body inherits sans.
- **Spacing notes**: `mb-5` is one-off (not on the canonical 4/6/8/10/12/14/16/18/24 scale, but Tailwind's default 20px). Worth flagging.
- **Verdict**: ⚠️ One stray zinc literal. Otherwise primitive-driven.

### `/profile` — `app/profile/page.tsx`

- **Text**: `text-zinc-700 dark:text-zinc-300` for the e-post label, `text-zinc-600 dark:text-zinc-400` for the e-post value, `text-zinc-500` for the helper line, `text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100` for the "Avbryt" link.
- **Background**: via `AppShell` + `Card` — clean.
- **Border**: via `Card` + `Input` — clean.
- **Typography**: heading via `PageHeader`. Plain `<label>` is hand-rolled (Input primitive not used for e-post field because it's read-only — fair, but it duplicates label styling outside the design system).
- **Spacing notes**: `mb-1.5` and `mt-1.5` on hand-rolled label/helper. Acceptable.
- **Verdict**: ⚠️ Multiple zinc literals on text. Cancel-link has no semantic role in tokens; should be `text-muted hover:text-text`.

### `/` (home) — `app/page.tsx`

- **Text**: `text-text` for headings, `text-muted` for secondary lines and arrows, `text-accent` for the trophy/admin section label, `text-danger` for the logout button.
- **Background**: `bg-bg` (shell), `bg-surface` (cards via `Card`), `bg-primary-soft` for card hover; status-pill uses `bg-primary-soft`, `bg-warning/10`, `bg-border/40`.
- **Border**: `border-border`, `border-primary/30` on hover, `border-warning/30`, `border-primary/20`.
- **Typography**: `font-serif text-lg font-medium tracking-tight` for game card titles; section labels are `text-[10px] uppercase tracking-[0.18em]` — premium spec.
- **Spacing notes**: `mb-6`, `mb-3`, `mt-1`, `mt-10`, `pt-2`, `space-y-6`, `space-y-3`. On-scale.
- **Radius**: pills use `rounded-full`, cards inherit `rounded-2xl` from `Card`.
- **Verdict**: ✅ The reference implementation. Fully tokenised, premium typographic treatment.

### `/games/[id]` (game home) — `app/games/[id]/page.tsx`

**Heavy zinc/green/blue usage throughout. The single most inconsistent surface in the app.**

- **Status badge map** (lines 22-29): `bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200`, `bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 border-green-200`, `bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200`. The admin equivalent at `app/admin/games/[id]/page.tsx` uses tokenized variants (`bg-warning/10 text-warning`, `bg-primary-soft text-primary`, `bg-accent/[0.10] text-accent`) — these two pages render the same data shape with different palettes.
- **"← Hjem" link** (line 181): `text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100` — `PageHeader.action` slot.
- **"Gjennomgå" link** (line 221): `text-sm font-medium text-blue-700 underline` — only place `text-blue-700` appears outside status badges.
- **Card section headings** (lines 232, 248): `text-sm font-medium text-zinc-700 dark:text-zinc-300`.
- **Card body** (lines 235, 253, 257, 261, 287, 299): `text-base text-zinc-900 dark:text-zinc-100`.
- **`<dt>` labels** (lines 252, 256, 260): `text-zinc-500`.
- **CTA buttons** (lines 271, 339, 351, 366): `w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg`. The home and leaderboard pages use `bg-primary hover:bg-primary-hover` + `rounded-full`. Two visual languages on adjacent screens.
- **"Se leaderboard" finished-state CTA** (line 271): `bg-blue-600` — accent collision: blue=finished here, but `text-accent` (champagne) is the finished/win color on `/`.
- **Inactive-game card** (line 276): `border-zinc-200` + `text-zinc-500`. Same idea as `border-border` + `text-muted`.
- **Submitted-state cards** (lines 379, 387): `border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300`.
- **Tee-box meta** (line 239): `text-xs text-zinc-500` — should be `text-xs text-muted tabular-nums` (it contains "Slope 113 · CR 70.0" which are numbers).
- **`<dl>` numeric data row** (lines 253, 257, 261): "Lag 1", "Flight 1", course handicap — no `tabular-nums`.
- **Card hover** (lines 286, 298): `hover:bg-zinc-50 dark:hover:bg-zinc-800` — home page uses `hover:bg-primary-soft`.
- **Radius**: CTA buttons are `rounded-lg` (not in the spec) and `min-h-[44px]`; home/leaderboard CTAs are `rounded-full`.
- **Typography**: `<p>`/`<h2>`/`<span>` body uses default `font-sans`. The game title comes from `PageHeader` so heading is serif, but the *content* uses sans + zinc — feels generic.
- **Verdict**: ⚠️⚠️⚠️ Highest-priority surface for the sweep. This is the screen Jørgen most likely sees as "off".

### `/games/[id]/holes/[holeNumber]` (hole entry — recent redesign) — `page.tsx`, `HoleClient.tsx`

- **Text/colors**: every literal that appears here is from the documented allowed-exceptions list (`#2F5A3C`, `#7A2F2A`, `#7A5410`, `#9A8F7C`, `#5C5347`, `#F0EDE5`, `#EFE9DA`, `#D9D2C0`, `#E5E0D3`, the `rgba(...)` pill backgrounds, `rgba(229,224,211,0.5)` settings-pill bg, `rgba(201,169,97,0.5)` confirmed border, `rgba(15,22,18,0.4)` modal scrim). Avatar fg `#F0EDE5` and "Lagret" green dot `#4A7C59` are equivalent to `--bg` and `--success` respectively — strictly literal-vs-token (low severity).
- **Background**: `bg-bg` via the page wrapper.
- **Border**: `var(--border)` inline (correct token usage via CSS variable).
- **Typography**: `font-serif` for name/number/par, `font-sans` for kickers/helpers. Tabular-nums on numbers. Spec-perfect.
- **Spacing**: `padding: 14px 18px 8px`, `padding: 14`, `gap: 10`, `padding: 6 14px 8`, `padding: '10px 24px 12px'`, `padding: '20px 18px 24px'`, `padding: '10px 16px 18px'`, `padding: '14px 16px'`, `padding: '12px 12px 12px 16px'`, `gap: 14`, `gap: 4`, `gap: 8`, `gap: 6`. All on the 4/6/8/10/12/14/16/18/24 scale.
- **Radii**: 7 (HoleStrip cell), 9 (stepper buttons), 9999 (delta pill, settings pill, drag handle, avatar 50%), 12 (sheet buttons, OnboardingBanner), 14 (BottomActionBar button), 16 (ScoreCard), 18 (sheet top corners), 50% (avatar, radio dot). **`14` and `18` are not in the spec set `7 / 9 / 12 / 16 / 9999`** — borderline outliers, but documented in quick-win-1 design spec for the bottom action and sheet handles.
- **Numbers**: `38` (score number), `44` (hole hero), `20` (par), `22` (specific-value), `17` (player name), `16` (settings title) — these are pixel font-sizes, not in any token system. Acceptable as a self-contained design spec.
- **Verdict**: ✅ This is the polished area. Per the audit-prompt exceptions, the literals here are sanctioned. Worth noting that the design spec for this area effectively *forked* its own scale (font-px and radii 14/18) — fine for one feature, but if we ever expand the hole-redesign treatment to other surfaces we'll want to lift these into `globals.css` first.

### `/games/[id]/scorecard` — `app/games/[id]/scorecard/page.tsx`

- **Text**: zinc throughout (`text-zinc-500/600/700/900` + dark variants), 9 distinct occurrences.
- **Background**: table head/foot uses `bg-zinc-50 dark:bg-zinc-800/50`.
- **Border**: `border-t border-zinc-200`, `border-t-2 border-zinc-300`.
- **CTA**: `bg-green-600 hover:bg-green-700 text-white ... rounded-lg` (lines 172, 179).
- **Typography**: heading via `PageHeader`. Table body is sans without `tabular-nums` — yet it's all numeric data (par, SI, slag, +slag).
- **Spacing notes**: `py-2`, `py-2.5`, `px-3` — on-scale-ish; `py-2.5` is 10px which is on-scale.
- **Verdict**: ⚠️⚠️ Whole table is generic Tailwind grey + green CTA. The table that displays your own round should feel like the leaderboard's premium treatment, not a default admin grid.

### `/games/[id]/submit` — `app/games/[id]/submit/page.tsx` + `SubmitForm.tsx`

- **Text**: 12+ zinc utilities across labels, summary text, table cells, and entered-by name.
- **Background**: zinc table head/foot tints.
- **Border**: `border-zinc-200 dark:border-zinc-800` divider, `border-zinc-300` for edit-back button.
- **CTA (Lever ✓)**: `bg-green-600 hover:bg-green-700` (SubmitForm line 37) — primary action of the whole flow.
- **Secondary button**: "Rediger" link uses `border-zinc-300 ... text-zinc-700`, should be `Button` ghost/secondary variant or token-equivalent.
- **Typography**: numbers in summary (`{totalBrutto}`, `{playedHoles.length}/18`) have no `tabular-nums`.
- **Verdict**: ⚠️⚠️ Same problem as scorecard — entire surface is pre-design-system.

### `/games/[id]/approve` — `app/games/[id]/approve/page.tsx` + `ReviewActions.tsx`

- **Text**: 13+ zinc literals. Approve copy ("Vis 18-hulls-kort", helper text on rejection reason) all zinc.
- **Background/Border**: zinc throughout.
- **CTAs**:
  - Approve: `bg-green-600 hover:bg-green-700` (ReviewActions line 31).
  - Reject toggle (Avvis): `bg-zinc-100 ... text-zinc-900` (line 39).
  - Cancel-reject: `bg-zinc-100 ... text-zinc-900` (line 77).
  - Send reject: `bg-red-600 hover:bg-red-700` (line 83). Should be `bg-danger`.
- **Reason textarea**: `border-zinc-300 dark:border-zinc-700 ... bg-white dark:bg-zinc-900 placeholder-zinc-400 focus:ring-green-600` — completely off-system. Should reuse `Input` styling or at least its border/focus tokens.
- **Verdict**: ⚠️⚠️ Major workflow page, fully unstyled-by-tokens.

### `/games/[id]/leaderboard` — `app/games/[id]/leaderboard/page.tsx`

- **Text**: `text-text`, `text-muted`, `text-accent`, `text-warning` — all tokenized.
- **Background**: `bg-surface` (via `Card`), `bg-primary-soft` (tab toggle), `bg-accent/[0.06]` (1st-place card).
- **Border**: `border-accent` for 1st, `border-muted/40`, `border-warning/40`, `border-border`.
- **Shadow**: `shadow-[0_2px_12px_rgba(201,169,97,0.15)]` for 1st — champagne-tinted, on-system.
- **Typography**: `font-serif` for team total + team name; `tabular-nums` everywhere numeric. ✅
- **CTA**: secondary cards use `border border-border hover:bg-primary-soft text-text ... rounded-full` — primary-styled.
- **Verdict**: ✅ Reference quality. The pattern other table pages should match.

### `/games/[id]/leaderboard/holes` — `app/games/[id]/leaderboard/holes/page.tsx`

- **Text**: `text-zinc-600/900` for "← Leaderboard" link (line 156), team name (line 191), members (line 194), total number (line 198), hole rows (lines 207, 209, 213).
- **Body players**: `font-semibold text-zinc-900 dark:text-zinc-100` for contributors, `text-zinc-500 dark:text-zinc-400` for non-contributors.
- **Contributor "vinner" tag**: `text-emerald-600 dark:text-emerald-400` (line 242). Only emerald in the codebase. Should be `text-success` or `text-accent` to signal a contributor.
- **Background**: `bg-surface` via `Card`. Dividers `divide-zinc-200`.
- **Typography**: `tabular-nums` on team total and per-hole player rows ✅; team total uses `text-2xl font-bold` (not `font-serif`) — diverges from the leaderboard page that uses `font-serif` and the same scale.
- **Verdict**: ⚠️⚠️ Sibling of the leaderboard but doesn't match it. The cross-page break is jarring because users will swipe between the two via the `ModeToggle`.

### `/admin/games/[id]` (game detail) — `app/admin/games/[id]/page.tsx`

- **Text**: fully tokenized — `text-text`, `text-muted`, `text-accent`, `text-warning`, `text-success`.
- **Background**: `bg-primary-soft`, `bg-warning/10`, `bg-accent/[0.10]`, `bg-border`, `bg-primary`.
- **Border**: `border-border`, `border-primary/20`, `border-warning/30`, `border-accent/30`.
- **Typography**: `font-serif` for bane name + `text-xl font-medium tracking-tight`. Players table uses `tabular-nums` ✅.
- **CTA**: `bg-primary hover:bg-primary-hover text-white rounded-full` ✅.
- **Spacing**: `mb-5`, `mb-4`, `py-3`, `mb-1.5` — mostly on-scale.
- **Verdict**: ✅ Reference quality. Status-badge map here is the canonical version; the `/games/[id]` and `/admin/games` versions are stale duplicates.

### `/admin/courses` — `app/admin/courses/page.tsx`

- "← Tilbake" link: `text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 ...`.
- "+ Ny bane" CTA: `bg-green-600 hover:bg-green-700 ... rounded-lg`.
- Course list items: `text-zinc-900` (name), `text-zinc-500` (tee count, date), `bg-zinc-50` (hover), `divide-zinc-200`.
- Empty state: `text-zinc-500`.
- **Verdict**: ⚠️ Standard pre-token treatment.

### `/admin/courses/new` and `/admin/courses/[id]/edit`

- Page chrome uses the same zinc back-link pattern.
- Inherits all of `CourseForm.tsx` — see below.
- Edit page also renders `DeleteCourseButton.tsx`: `text-red-600 hover:text-red-700 hover:bg-red-50 ... border-red-200`. Should be `text-danger` + `hover:bg-danger/[0.08]` + `border-danger/30`.

### `app/admin/courses/CourseForm.tsx`

- Section headings: `text-sm font-medium text-zinc-700 dark:text-zinc-300` (4 occurrences).
- Helper text: `text-xs text-zinc-500`.
- Tee-box container: `border border-zinc-200 dark:border-zinc-800 rounded-lg`. Should be `border-border rounded-xl` (the `Card` radius) or at minimum `border-border`.
- "Fjern" link: `text-red-600 hover:text-red-700` — should be `text-danger`.
- "+ Legg til tee-boks" button: `text-zinc-700 ... bg-zinc-100 ... rounded-lg`. Use the `Button` ghost/secondary variant.
- **Verdict**: ⚠️⚠️ Large form, no token usage. Spans both Ny-bane and Rediger-bane pages.

### `/admin/games/new` — `app/admin/games/new/page.tsx` + `GameForm.tsx`

The biggest single client component in the app (544 lines) and entirely pre-token:

- Section headings (6 of them): `text-sm font-medium text-zinc-700 dark:text-zinc-300`.
- Helper text (4 occurrences): `text-xs text-zinc-500`.
- Counter pill: `${eightSelected ? 'text-green-700 dark:text-green-400' : 'text-zinc-500'}`. Should be `text-success` / `text-muted`.
- Player checkbox row when checked: `border-green-500 bg-green-50 dark:bg-green-950/30` — only place `border-green-500` appears.
- Native `<select>` styling: `bg-white dark:bg-zinc-900 text-zinc-900 ... border-zinc-300 ... focus:ring-green-600` (3 different selects). Should harmonize with `Input` (which uses `border-border` and `focus:ring-accent/40 focus:border-accent`).
- Checkbox color: `text-green-600 focus:ring-green-600` — Tailwind native, not aligned.
- "Trekk tilfeldig" / "Tøm lag" / sub-labels: all `text-zinc-*` + `bg-zinc-*`.
- Team container `border-zinc-200 ... rounded-lg`; flight container same. Should be `border-border rounded-xl`.
- "Lag {team}" tiny label: `text-xs font-medium uppercase tracking-wide text-zinc-500` — compare with home page section labels `text-[10px] uppercase tracking-[0.18em] text-muted` (different size, tracking, AND token).
- **Verdict**: ⚠️⚠️⚠️ Massive surface, end-to-end pre-token. Touches admin's most common task (creating a game).

### `/admin/games` (listing) — `app/admin/games/page.tsx`

- Same status-badge map as `/games/[id]` (lines 48-55) — the third copy of the zinc/green/blue trio. The `/admin/games/[id]` detail page uses the tokenized version (`bg-warning/10`, `bg-primary-soft`, `bg-accent/[0.10]`). Three pages, two designs, one data shape.
- "+ Nytt spill" CTA: `bg-green-600 ... rounded-lg`.
- List rows: `text-zinc-900` name, `text-zinc-500` meta, `bg-zinc-50` hover.
- **Verdict**: ⚠️ Listing pages all use the same generic pattern. Worth doing all three (`/admin/courses`, `/admin/invitations`, `/admin/games`) in one stroke.

### `/admin/invitations` — `app/admin/invitations/page.tsx`

- Back link: zinc.
- Section heading "Tidligere invitasjoner": `text-zinc-700 dark:text-zinc-300`.
- Row text: `text-zinc-900` email, `text-zinc-500` date.
- Status pill: `bg-green-100 text-green-800` for accepted, `bg-zinc-100 text-zinc-700` for pending. No dark-mode green variant — inconsistent with the game status badge that has both light/dark variants.
- Empty state: `text-zinc-500`.
- **Verdict**: ⚠️ Same generic pattern; accepted-pill is a 4th status-color variant (no dark mode).

### `components/ui/AppShell.tsx`

- `bg-bg text-text` — ✅ tokenized.

### `components/ui/Banner.tsx`

- Success: `bg-primary-soft border-success/40 text-success` ✅
- Error: `bg-danger/[0.08] border-danger/30 text-danger` ✅
- Info: `bg-accent/[0.10] border-accent/40 text-text` ✅
- One small concern: Success banner uses `bg-primary-soft` (green tint) but text is `text-success` (sage). On the home page, `bg-primary-soft` is also the hover bg for cards. Not visually wrong but conceptually mingles "soft primary" with "soft success".

### `components/ui/BrandMark.tsx`

- `bg-primary text-white` for the T tile, `text-text` wordmark, `text-muted` tagline ✅

### `components/ui/Button.tsx`

- Primary: `bg-primary hover:bg-primary-hover text-white` ✅
- Secondary: `border-border hover:bg-primary-soft text-text` ✅
- Danger: `bg-danger hover:opacity-90 text-white` ✅
- Ghost: `hover:bg-primary-soft text-text` ✅
- Radius `rounded-full` — note this is *different* from the `rounded-lg` used by the inline CTA divs on the unstyled pages.

### `components/ui/Card.tsx`

- `bg-surface border-border rounded-2xl` ✅
- Shadow: literal rgba `rgba(26,46,31,0.04)` × 2 — equivalent to `var(--text)` with low alpha. Strictly literal-vs-token; the values match the design intent.
- `rounded-2xl` = 16px = on the radius spec ✅.

### `components/ui/Input.tsx`

- `bg-surface text-text placeholder-muted/70 border-border focus:ring-accent/40 focus:border-accent` ✅
- Error state uses `text-danger`, `border-danger` ✅
- Radius `rounded-xl` (12px) ✅.

### `components/ui/PageHeader.tsx`

- `font-serif text-3xl font-medium tracking-tight text-text` heading ✅
- `text-sm text-muted` subtitle ✅

### `components/hole/*`

See the `/games/[id]/holes/[holeNumber]` entry above. All literals come from the documented allowed-exceptions list. ✅

### `components/IosInstallHint.tsx`

- `bg-zinc-900 text-zinc-100` for the toast bg/fg (line 47).
- `text-zinc-400 hover:text-zinc-100` for the close (line 61).
- This is the ONLY surface in the whole app that intentionally uses a dark toast — looks deliberate, but it's still off-system. Should be `bg-text text-bg` (forest-on-linen reversed) or a deliberate "ink" token.

### `components/PwaBoot.tsx`

No JSX — pure effect component. Nothing to audit.

### `app/games/[id]/leaderboard/LeaderboardConfetti.tsx`

- Confetti palette literals: `#C9A961` (accent), `#D4B870` (dark-mode accent), `#1B4332` (primary), `#4A7C59` (success), `#85B589` (dark-mode primary).
- All 5 values match canonical tokens. Strictly literal-vs-token (low severity).

### `app/icon.tsx`, `app/icon0.tsx`, `app/apple-icon.tsx`

- Background `#1B4332` (primary), color `#F8F6F0` (bg). Matches tokens — literal-vs-token only.

### `app/manifest.ts`

- `background_color: '#fafafa'` — generic neutral white. Should be `#f8f6f0` (`--bg`, linen).
- `theme_color: '#16a34a'` — bright Tailwind green-600. Off-brand. Should be `#1b4332` (`--primary`, forest). This is what iOS/Android show as the app's "skin color" when the PWA is installed.

### `app/layout.tsx`

- `themeColor: "#1b4332"` ✅ (consistent with primary).
- This means the *viewport* theme-color (browser chrome) is correct, but the PWA manifest is wrong. Two sources of truth, only one is right.

## Findings — categorized

### 1. Unauthorized hex / Tailwind-default literals outside the allowed exceptions

| File:line | Value | Suggested replacement |
|---|---|---|
| `app/manifest.ts:11` | `#fafafa` (PWA bg) | `#f8f6f0` (--bg) |
| `app/manifest.ts:12` | `#16a34a` (PWA theme) | `#1b4332` (--primary) |
| `app/complete-profile/page.tsx:59` | `text-zinc-600 dark:text-zinc-400` | `text-muted` |
| `app/profile/page.tsx:73` | `text-zinc-700 dark:text-zinc-300` | `text-text` (form label) |
| `app/profile/page.tsx:76` | `text-zinc-600 dark:text-zinc-400` | `text-text` |
| `app/profile/page.tsx:79` | `text-zinc-500` | `text-muted` |
| `app/profile/page.tsx:122` | `text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100` | `text-muted hover:text-text` |
| `app/games/[id]/page.tsx:22-29` | zinc / green / blue status-badge map | mirror the tokenized map in `app/admin/games/[id]/page.tsx:27-31` |
| `app/games/[id]/page.tsx:181` | back link `text-zinc-600 hover:text-zinc-900 ...` | `text-muted hover:text-text transition-colors` |
| `app/games/[id]/page.tsx:221` | `text-blue-700 underline` | `text-primary underline` |
| `app/games/[id]/page.tsx:232, 248` | section heading `text-zinc-700` | `text-muted` uppercase kicker (match home/admin) |
| `app/games/[id]/page.tsx:235, 253, 257, 261, 287, 299` | `text-zinc-900 dark:text-zinc-100` | `text-text` |
| `app/games/[id]/page.tsx:239` | `text-zinc-500` (tee-box meta) | `text-muted tabular-nums` |
| `app/games/[id]/page.tsx:252, 256, 260` | `<dt> text-zinc-500` | `text-muted` |
| `app/games/[id]/page.tsx:271` | CTA `bg-blue-600` | `bg-primary` + `rounded-full` |
| `app/games/[id]/page.tsx:276, 379, 387` | `border-zinc-200 text-zinc-500/700` info card | `border-border text-muted` |
| `app/games/[id]/page.tsx:286, 298` | hover `bg-zinc-50 dark:bg-zinc-800` | `bg-primary-soft` |
| `app/games/[id]/page.tsx:290, 302` | arrow `text-zinc-400` | `text-muted` |
| `app/games/[id]/page.tsx:311` | back-to-home link | `text-muted hover:text-text` |
| `app/games/[id]/page.tsx:339, 351, 366` | CTA `bg-green-600 ... rounded-lg` | `bg-primary hover:bg-primary-hover ... rounded-full` |
| `app/games/[id]/page.tsx:356, 371` | subtext `text-zinc-500` | `text-muted` |
| `app/games/[id]/scorecard/page.tsx:111` | back-link | `text-muted hover:text-text` |
| `app/games/[id]/scorecard/page.tsx:122` | head row `text-zinc-500 bg-zinc-50` | `text-muted bg-primary-soft/50` (or `bg-bg`) |
| `app/games/[id]/scorecard/page.tsx:134, 155, 220, 246` | row borders `border-zinc-200`/`border-zinc-300` | `border-border` |
| `app/games/[id]/scorecard/page.tsx:136, 139, 142, 145, 148, 158, 161` | body cells `text-zinc-700/900` | `text-text` or `text-muted` + `tabular-nums` on numbers |
| `app/games/[id]/scorecard/page.tsx:172, 179` | CTA `bg-green-600 ... rounded-lg` | `bg-primary ... rounded-full` |
| `app/games/[id]/scorecard/page.tsx:187` | helper link | `text-muted hover:text-text` |
| `app/games/[id]/submit/page.tsx:169, 184, 187, 193, 200-201, 208, 220, 222, 225, 228, 231, 234, 245, 247, 250, 252, 268` | zinc-everywhere; same patterns as above | tokenized equivalents; "Rediger" should be `Button variant="secondary"` |
| `app/games/[id]/submit/SubmitForm.tsx:37` | Lever ✓ button `bg-green-600 ... rounded-lg` | `bg-primary ... rounded-full` (use `Button` primitive) |
| `app/games/[id]/approve/page.tsx:171, 192, 209, 211, 214, 220, 221, 227, 246, 248, 251, 254, 257` | zinc body, dividers | tokenized |
| `app/games/[id]/approve/ReviewActions.tsx:31` | Godkjenn `bg-green-600` | `bg-primary` (or `Button` primary) |
| `app/games/[id]/approve/ReviewActions.tsx:39, 77` | Avvis/Avbryt `bg-zinc-100 ... text-zinc-900` | `Button variant="secondary"` |
| `app/games/[id]/approve/ReviewActions.tsx:63` | label `text-zinc-500` | `text-muted` |
| `app/games/[id]/approve/ReviewActions.tsx:71` | textarea `border-zinc-300 ... focus:ring-green-600 placeholder-zinc-400` | match `Input` primitive: `border-border bg-surface focus:ring-accent/40 focus:border-accent placeholder-muted/70` |
| `app/games/[id]/approve/ReviewActions.tsx:83` | Send avvisning `bg-red-600` | `bg-danger` (or `Button variant="danger"`) |
| `app/games/[id]/leaderboard/holes/page.tsx:156, 191, 194, 198, 207, 209, 213, 227-228` | zinc body + back link | tokenized |
| `app/games/[id]/leaderboard/holes/page.tsx:198` | team total `text-2xl font-bold` | match leaderboard: `font-serif text-3xl font-medium tracking-tight` |
| `app/games/[id]/leaderboard/holes/page.tsx:203` | divider `divide-zinc-200` | `divide-border` |
| `app/games/[id]/leaderboard/holes/page.tsx:242` | `text-emerald-600 dark:text-emerald-400` "vinner" tag | `text-success` or `text-accent` |
| `app/admin/courses/page.tsx:87, 109, 117, 124, 126, 129, 132, 141` | zinc + green CTA | tokenized; CTA → `Button` primary |
| `app/admin/courses/[id]/edit/page.tsx:105` | back link | `text-muted hover:text-text` |
| `app/admin/courses/[id]/edit/DeleteCourseButton.tsx:25` | `text-red-600 hover:text-red-700 hover:bg-red-50 ... border-red-200` | `text-danger hover:bg-danger/[0.08] border-danger/30` |
| `app/admin/courses/new/page.tsx:47` | back link | `text-muted hover:text-text` |
| `app/admin/courses/CourseForm.tsx:105, 108, 117, 154, 161, 164, 171, 244` | all zinc headings/text/borders + red link | tokenized; use `Button variant="secondary"` for the "Legg til tee-boks" CTA |
| `app/admin/games/page.tsx:48-55` | status-badge map (3rd duplicate) | reuse the canonical one from `/admin/games/[id]` |
| `app/admin/games/page.tsx:99, 121, 136, 140, 143, 146, 162` | zinc + green CTA | tokenized |
| `app/admin/games/new/page.tsx:97` | back link | `text-muted hover:text-text` |
| `app/admin/games/new/GameForm.tsx:260, 275, 288, 302, 313, 330, 334, 340, 351, 358, 360, 374, 377, 384, 391, 401, 403, 417, 437, 440, 452, 454, 457, 465, 483, 507, 510, 513` | zinc body, green focus rings, native select styling, checked-row green | full tokenization; `<select>` styling should match `Input` (border-border, focus:ring-accent/40) |
| `app/admin/games/[id]/StartGameButton.tsx:25` | CTA `bg-green-600 ... rounded-lg` | `bg-primary ... rounded-full` |
| `app/admin/games/[id]/EndGameButton.tsx:24` | CTA `bg-blue-600 ... rounded-lg` | `bg-primary ... rounded-full` (or accent if we want gold-finish ceremony) |
| `app/admin/games/[id]/ApprovePlayerButton.tsx:24` | CTA `bg-green-600 ... rounded-lg` | `bg-primary ... rounded-full` |
| `app/admin/invitations/page.tsx:75, 114, 122, 125, 132-133, 142` | zinc + green accepted pill | tokenized; accepted pill → `bg-primary-soft text-primary border-primary/20` (matches active-game pill on home) |
| `components/IosInstallHint.tsx:47, 61` | `bg-zinc-900 text-zinc-100 ... text-zinc-400` toast | `bg-text text-bg` (forest toast on linen) OR introduce explicit dark-toast token |

### 2. Same role, inconsistent token usage (token-vs-literal duplication)

These are cases where two surfaces render the same semantic role but pick different vocabularies.

- **Status badge for game state** is defined three times:
  - Tokenized: `app/admin/games/[id]/page.tsx:27-31` — the canonical version (`bg-primary-soft text-primary border-primary/20` for active, etc.).
  - Stale zinc/green/blue: `app/games/[id]/page.tsx:22-29` and `app/admin/games/page.tsx:48-55`.
  - The home page `StatusPill` (`app/page.tsx:285-290`) uses yet a fourth set, also tokenized but with slightly different intent (`bg-warning/10 text-warning` for draft vs admin's same — actually matches the admin one, good).
- **Card hover background**:
  - Home: `hover:bg-primary-soft`.
  - Game home + admin listings: `hover:bg-zinc-50 dark:bg-zinc-800`.
  - The Card primitive itself does not specify a hover; every consumer rolls their own.
- **Back-link copy** is repeated 10+ times with the literal `text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100` pattern, except in `app/admin/games/[id]/page.tsx:202` and `app/games/[id]/leaderboard/page.tsx:174` which use the tokenized `text-muted hover:text-text transition-colors`. **This is the single most repeated literal pattern in the codebase** — extracting it into a `<BackLink>` primitive would remove ~10 duplications in one stroke.
- **Section-label kicker** has two forms:
  - Premium: `text-[10px] font-semibold uppercase tracking-[0.18em] text-muted` (home, admin/games/[id], leaderboard).
  - Generic: `text-xs font-medium uppercase tracking-wide text-zinc-500` (admin/games/new GameForm "Lag {team}").
- **CTA button** has two forms:
  - Token: `bg-primary hover:bg-primary-hover ... rounded-full` (Button primitive, home, leaderboard, admin/games/[id]).
  - Literal: `bg-green-600 hover:bg-green-700 ... rounded-lg` (every other surface).
- **"Hover bg for primary action"** is `bg-primary-soft` in the Button primitive AND in Banner success — overloads "soft green" semantics.
- **Confetti palette literals** (LeaderboardConfetti) match canonical tokens but are duplicated as hex; if we ever shift `--accent` we'd silently lose visual consistency. Low severity.

### 3. Same token, different semantic roles

- `text-accent` is used for:
  - Winner highlight (TeamCard 1st-place number colour).
  - Champagne section labels in home page admin section + admin game detail.
  - Kicker on HoleHero + ScoreCard `+N SLAG` badge.
  - The arrow rendered on swipe inside ScoreCard.
  - The chip on the trophy emoji in finished home cards.
  - Banner "info" border + text colour.
  - These uses are aligned conceptually ("things of note / things to celebrate / things championship-y") but four of them are visual highlights and one (Banner info) is straight informational. Worth a product decision: should info banners be accent (champagne) or something else (muted/text)?
- `bg-primary-soft` is used as:
  - Card hover background on home.
  - Success banner background (Banner tone="success").
  - Mode-toggle background (leaderboard).
  - The active pill background (StatusPill, home).
  - Both hover-affordance and success-state share the same token. Not wrong, but adjacency of "this is hover" + "this succeeded" will look the same.
- `border-warning/30` is used for:
  - The end-game readiness preview warning panel (`bg-warning/10 text-warning`) — semantic warning.
  - The 3rd-place card in TeamCard (because bronze ≈ amber). Borderline overload; probably fine, but worth noting.

### 4. Typography mismatches

- Tables: scorecard, submit, approve, leaderboard/holes (player rows), admin/games/[id] (players table). Of these:
  - admin/games/[id] uses `tabular-nums` on `<table>` ✅.
  - leaderboard/holes uses `tabular-nums` on team total ✅.
  - scorecard, submit, approve do NOT use `tabular-nums` despite displaying par/SI/slag columns.
- Number sizing: leaderboard team total is `font-serif text-3xl/4xl` ✅. leaderboard/holes team total is `text-2xl font-bold` (sans). Same data, different treatment.
- Section labels: see "Same role" in §2 — premium 10px champagne kicker vs generic xs uppercase zinc.
- Form labels: tokenized via `Input` primitive (uses `text-text`). Pages that hand-roll labels (`profile/page.tsx`, `complete-profile/page.tsx`, `GameForm.tsx` select labels) use `text-zinc-700`. Inconsistent.
- The dark `bg-zinc-900` toast in `IosInstallHint` mixes `font-sans` (good) but the rest is alien to the design system.

### 5. Spacing one-offs

- `mb-5` in `complete-profile/page.tsx:59` (20px) — Tailwind default, not on the 4/6/8/10/12/14/16/18/24 scale.
- `py-2.5` (10px) — on-scale, OK.
- `px-3.5` — 14px, on-scale, OK.
- `py-0.5` — 2px, off-scale, used in status badges (`app/page.tsx:293`, `app/games/[id]/page.tsx:190`, etc.). Acceptable for pill geometry but worth a deliberate "pill spacing" mini-spec.
- `max-w-[10rem]` (truncation on entered-by name in submit table) — arbitrary clamp, fine for a one-off.

### 6. Radius outliers

Canonical set: `7 / 9 / 12 / 16 / 9999`.

- `rounded-lg` (8px) — appears 30+ times across the unstyled pages on CTAs, inputs, table cards. **Not on the canonical scale.** Consensus replacement: `rounded-full` for buttons, `rounded-2xl` (16px) or `rounded-xl` (12px) for containers.
- `rounded-2xl` (16px) — used by `Card` ✅.
- `rounded-xl` (12px) — used by `Input`, `Banner` ✅.
- `rounded` (4px, no suffix) — used in admin listings on hover containers (`-mx-2 px-2 py-1 rounded`). 4px is off-scale.
- `14` and `18` px in BottomActionBar + sheet handles — in the documented hole-redesign spec, not flagged.
- Numeric inline radii in hole components: 7, 9, 12, 14, 16, 18, 9999. The 14 and 18 are outside the canonical small-set but are limited to the hole feature.

## Prioritized recommendations

### High — visible inconsistency within a single view

These have the highest impact because the user sees the difference in one screen.

1. **`/games/[id]` (game home)** — single most-inconsistent page. Status badges, dl-rows, hover bgs, CTA buttons (green vs primary), arrow colours, the "Mitt scorekort" link card colour: every one of these uses a stale token. This screen is the natural landing pad from the home page so the contrast against `/` is jarring.
2. **`/games/[id]/scorecard`, `/games/[id]/submit`, `/games/[id]/approve`** — the player's submission flow. Three adjacent screens that ALL use zinc tables and green CTAs while sitting between the polished hole-entry and the polished leaderboard. Sweep them together.
3. **`/games/[id]/leaderboard/holes`** — directly reachable from `/games/[id]/leaderboard` via tab. The tab toggle is shared but the contents look like a different app. Fix the team total typography (`font-serif`) and player row colors.
4. **Status-badge map duplication** — three copies (game home, admin/games, admin/games/[id]). Extract once to `lib/games/statusBadge.ts` (or similar) and reuse. Eliminates 24 lines of color literals in one motion.

### Medium — cross-page inconsistency for the same semantic role

5. **Back-link in `PageHeader.action`** — 10+ duplications of the same zinc literal. Extract `<BackLink href="…">{label}</BackLink>` to `components/ui/`. After the sweep, lint for the literal pattern to prevent regression.
6. **Admin form surfaces** — `CourseForm.tsx` and `GameForm.tsx` are both 100% zinc. They're admin-only so user impact is lower, but the inconsistency is just as real, and admin = Jørgen, who's the one reporting the bug. Sweep these together.
7. **Admin listing pages** — `/admin/courses`, `/admin/invitations`, `/admin/games`. All three use the same generic pattern (zinc rows, green CTAs, divide-zinc-200). One mini-sweep handles all three.
8. **CTA-button drift** — adopt the `Button` primitive (or its inline equivalent: `bg-primary hover:bg-primary-hover text-white rounded-full`) everywhere. Banish `bg-green-600`, `bg-blue-600`, `bg-red-600` from the codebase except where they're explicitly typed (danger → `bg-danger`).

### Low — stylistic cleanup with no visual impact

9. **`manifest.ts`** — fix `theme_color` to forest and `background_color` to linen. Cosmetic, but it's what iOS shows during app launch and on Android share sheets. Hit-and-run fix.
10. **Hex-to-token literals** that already match canonical values: `Card.tsx` shadow, `LeaderboardConfetti.tsx` palette, `icon.tsx`/`apple-icon.tsx`/`icon0.tsx` colors. Match by value already — fix lets us keep theme changes coherent in the future.
11. **`IosInstallHint.tsx`** — decide whether this toast intentionally uses an "ink" treatment (forest-dark on light) or should match Banner styling. If keeping the dark-toast pattern, add `--ink` / `--on-ink` tokens in `globals.css` so it's at least named.
12. **`mb-5` in `complete-profile/page.tsx`** — snap to `mb-4` (16px) or `mb-6` (24px).

### Suggested sweep order

A consistency sweep is most efficient if grouped by "shared replacement vocabulary" rather than by route order. Recommended order for a single phase:

1. **Extract** `<BackLink>` + a shared `statusBadge` map + `Button` adoption guide (~30 minutes).
2. **Player-facing scoring flow** — game home → scorecard → submit → approve → leaderboard/holes (one PR). This is the path Jørgen and his friends will most-walk and the most-visible cluster.
3. **Admin listing pages** — courses + invitations + games (one PR). Share the same pattern; can almost copy-paste once the first is done.
4. **Admin forms** — CourseForm + GameForm (one PR). Heavy lift but mechanical.
5. **Misc** — manifest.ts, IosInstallHint, complete-profile/profile small fixes (one PR or include in #2 if small enough).

After: add a CI grep guard that fails any `text-zinc-`, `bg-zinc-`, `border-zinc-`, `bg-green-[0-9]`, `text-emerald-`, `bg-blue-[0-9]`, `bg-red-[0-9]`, `focus:ring-green-` substring outside `node_modules`. This is the cheapest way to prevent regression.

## Open questions for product

These need a Jørgen decision before the sweep:

1. **`text-accent` (champagne) semantic scope** — currently used for winners, championship moments (trophy emoji), highlight kickers, admin section labels, AND info-banner text. Should we lock it down to "winners + premium accents" and pick a different token for info banners (e.g. `text-text` over `bg-primary-soft`)?
2. **"Finished game" affordance color** — the leaderboard treats 1st as accent (gold), but `/games/[id]` uses `bg-blue-600` for "Se leaderboard" on finished games. Should the finished-game CTA be gold (accent), forest (primary), or something else?
3. **Status pill for "active vs draft vs finished"** — `/admin/games/[id]` says: draft=warning, active=primary-soft, finished=accent. Is that the canonical set we want everywhere?
4. **"Submitted, waiting" state copy + tone** — currently uses generic `border-zinc-200 text-zinc-700`. Should it be warning (amber)?  Primary-soft (calm)? It's a longish wait state and we should pick deliberately.
5. **`rounded-lg` (8px)** — currently used on a lot of pre-design-system CTAs and containers. The canonical set is `7 / 9 / 12 / 16 / 9999`. Do we want to add 8px to the spec, or migrate the lot to `rounded-xl` (12px) / `rounded-full`?
6. **IosInstallHint toast styling** — keep the dark forest-on-light contrast (and codify as a new "ink" token), or rebrand as a standard `Banner tone="info"` lookalike?
7. **The "+N vinner" tag in `/leaderboard/holes`** is `text-emerald-600`. Should this be `text-success` (sage), `text-accent` (champagne — "they helped the team win"), or `text-primary` (deep forest, neutral)?
8. **CourseForm "Fjern" and DeleteCourseButton** — both destructive. Both use red literals today. Should they use `text-danger` (brick) only on the destructive verb, or get the full `Button variant="danger"` red-on-fill treatment? Currently no destructive `Button` is used anywhere in the app.

---

*Audit performed against the working tree on 2026-05-11. No source files were modified. Findings reference exact file:line locations so the cleanup sweep can be planned as a single phase or split per high/medium/low.*
