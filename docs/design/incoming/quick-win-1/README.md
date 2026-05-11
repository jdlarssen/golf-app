# Handoff: Quick Win #1 — Hull-skjerm score-input

## Overview
This handoff packages the redesigned **Hull-skjerm** (hole screen) for the Tørny golf tournament app. The core change: score input goes from a 1–9 numeric grid that the player must read and tap to a **default-to-par** pattern — the score is pre-filled with par, the player taps to confirm, swipes (or uses +/− buttons) only when adjusting. One tap covers ~95% of scores. Aimed at shaving 5–10 seconds per hole × 18 holes × 4 players.

## About the Design Files
The files in this bundle are **design references created in HTML/React** — a prototype showing intended look, motion, and interaction. They are not production code to copy directly. The task is to **recreate the design in the target codebase's existing environment** (the Tørny app is Next.js + Supabase, React, Tailwind), using its established patterns: `next/font/google` for Fraunces + Inter, the existing color tokens in `app/globals.css`, the `Card`/`Button` primitives already in `components/ui/`.

## Fidelity
**High-fidelity.** The mock is pixel-precise on a ~390px-wide iPhone canvas. Final colors, type, spacing, motion, and copy. Recreate pixel-perfectly using the codebase's existing libraries.

## Screens / Views

### Hole screen (one screen, multiple states)

**Purpose:** Marker enters scores for the active hole — own score and three flight-mates — then advances to the next hole.

**Layout (top → bottom, mobile portrait, ~390px wide):**
1. **Safe-area top padding** — 54px (status bar / dynamic island clearance).
2. **Header row** — 14px / 18px / 8px padding. Three columns:
   - Back chevron `‹` (left, 18px, no background, hit area ~32px)
   - Tournament name (centered), uppercase tracking-widest, 10px, weight 600, color `--text-muted`
   - `⋯` settings pill (right) — 34×30, 1px border `--border`, background `rgba(229,224,211,0.5)`, radius 9999, fontSize 16, color `--text`
3. **Hole strip (1–18)** — horizontal scroll, 6px / 14px / 8px padding, 4px gap. Each cell 26×32, radius 7, Fraunces tabular-nums 13px.
   - Current hole: bg `--primary` (#1B4332), text `--bg-tint` (#F0EDE5), weight 600
   - Completed hole: bg #EFE9DA, 1px border `--border`, text `--text`, weight 500
   - Future hole: bg transparent, no border, text `--text-muted`, weight 500
4. **Hero hole block** — 10px / 24px / 12px padding, 1px solid `--border` bottom. Two columns space-between, baseline-aligned:
   - Left: `HULL` kicker (Inter 10px / 600 / uppercase tracking 0.20em, color `--accent` #C9A961) + Fraunces 44px / 600 / -0.03em / tabular-nums number (color `--text`). 10px gap, baseline aligned.
   - Right: `Par 4` (Fraunces 20px / 500 / -0.01em) over `355 m · indeks 7` (Inter 11px, color `--text-muted`).
5. **Onboarding banner** (first-run only, dismissable) — forest `--primary` bg, `--bg-tint` text, 12px / 14px padding, 12px radius, 14px margin-left/right, 14px margin-top. Champagne arrow chip on left (22×22, radius 50%, bg `--accent`, color `--primary`). Body 12px, "Prøv:" prefix in champagne 600. Close × top-right, champagne color.
6. **Score cards list** — flex-1, overflow-y auto, 14px padding all sides, 10px gap.
7. **Sync status row** — 11.5px Inter, color `--text-muted`, with 6px circle dot. Green dot (#4A7C59) + "Lagret · HH:MM" when idle; amber dot (#D89B3A) + "Sender…" while syncing.
8. **Bottom action bar** — 10px / 16px / 18px padding, 1px solid `--border` top, bg `--surface`. Full-width "Bekreft alle scorer" or "Neste hull · 8" button. Enabled when all 4 cards confirmed.
9. **Safe-area bottom padding** — 34px (home indicator clearance).

### Score card (component, two input modes)

**Common chrome:**
- Background `#FFFFFF` (always — does NOT change on confirmed)
- Border 1px: `#E5E0D3` unconfirmed → `rgba(201,169,97,0.5)` confirmed
- Radius 16, transition `border-color 160ms`
- Shadow: `0 1px 2px rgba(26,46,31,0.04), 0 2px 6px rgba(26,46,31,0.03)`
- Padding: `14px 16px` (swipe mode) / `12px 12px 12px 16px` (buttons mode)
- Flex row, align center, gap 14px (swipe) / 10px (buttons)

**Left column — Avatar:**
- 36×36 circle, bg `--primary`, color `--bg-tint`
- Initial in Fraunces 15px / 500 / -0.02em

**Middle column — Name + helper:**
- Name: Fraunces 17px / 500 / -0.005em
- `+1 SLAG` badge (when player has handicap strokes on this hole): Inter 9.5px / 600 / uppercase / tracking 0.18em / color `--accent`
- Helper line (Inter 11px, color `--text-muted`):
  - Confirmed: `"Bekreftet"`
  - Unset, swipe mode: `"Tap = par. Sveip for +/−."`
  - Unset, buttons mode: `"Tap kort = par. Bruk − / +."`
  - Adjusted but unconfirmed: `"Justert · tap igjen for å bekrefte"`

**Right column — Score display:**
- Big number: Fraunces 38px / 600 / -0.02em / tabular-nums. Right-aligned, min-width 42, line-height 1.
  - Unset (showing par as ghost): color #9A8F7C, opacity 0.55
  - Set, under par: color #2F5A3C
  - Set, par or +1: color `--text` (#1A2E1F)
  - Set, +2 or worse: color #7A2F2A
- Delta pill: Inter 11px / 600 / tracking 0.06em / tabular-nums, 3px / 7px padding, radius 9999, min-width 28, center-aligned.
  - Under par: bg `rgba(74,124,89,0.16)`, color #2F5A3C
  - Par (E): bg `rgba(92,83,71,0.10)`, color #5C5347
  - +1: bg `rgba(216,155,58,0.18)`, color #7A5410
  - +2 or worse: bg `rgba(184,70,62,0.16)`, color #7A2F2A
  - Unset: bg `rgba(92,83,71,0.10)`, color #5C5347, label `—`

**Right column (buttons mode only) — Stepper:**
- Vertical column, 6px gap, margin-left 4
- `+` button: 38×30, 1px border `--border`, radius 9, bg `--surface`, Inter 16/600
- `−` button: 38×30, same chrome, fontSize 18
- `⋯` button (opens specific-value sheet): height 18, transparent, color `--text-muted`, fontSize 14

## Interactions & Behavior

### Score input — swipe mode (default)
- **Tap card** → sets score to par, marks confirmed, fires sync.
- **Drag up** (≥16px) → score += 1 (from current value, or par if unset). Card translates `translateY(dy * 0.25)` with max ±10px, champagne `↑` arrow fades in on left side (opacity = min(1, |dy|/30)).
- **Drag down** (≥16px) → score -= 1 (symmetric).
- **Long press** (500ms still, ≤4px movement) → opens specific-value sheet.
- `touch-action: none` so vertical drags don't scroll the list.

### Score input — buttons mode
- **Tap card** → sets to par + confirms.
- **Tap +** → +1 from current (or par if unset). Clamps to [1, 12]. Marks confirmed.
- **Tap −** → -1 (symmetric).
- **Tap ⋯** → opens specific-value sheet.
- No drag, no long-press. `touch-action: auto`.

### Specific-value sheet (bottom sheet, both modes)
- Backdrop: `rgba(15,22,18,0.4)`, full-screen.
- Sheet: bg `--surface`, top corners radius 18, padding 20/18/24, drag-handle on top (36×4 pill, `--border`, centered).
- Kicker: `SPESIFIKK SCORE` — Inter 10/600/uppercase/tracking 0.20em, color `--accent`.
- Grid: 4 cols, 8px gap. Values: par-2 through par+5 (8 buttons). Each 14px/0 padding, 1px border `--border`, radius 12, bg `--bg`, Fraunces 22/600/tabular-nums.
- Tap value → sets score + confirms + closes sheet.

### Settings sheet (input mode toggle)
- Triggered by `⋯` in header.
- Same chrome as specific-value sheet.
- Title `INNSTILLINGER` kicker + `Hvordan vil du legge inn score?` (Fraunces 20/500/-0.01em).
- Two radio cards: "Klikk og dra" / "+ / − knapper". Each is a button row with a custom radio dot (16×16, border 2px `--border` / `--accent` when selected; inner 3px-inset `--primary` circle when selected), title (Fraunces 16/500), body (Inter 12, color `--text-muted`).
- Selected state: bg `--surface-2` (#F0EDE5), border 1px `--accent`.
- Footer caption: `"Valget lagres på enheten."`
- Persists to `localStorage["torny-input-mode"]` = `"swipe" | "buttons"`. Default `"swipe"`.

### Sync indicator
- After any score change, set `syncing = true` and clear after ~700ms.
- Idle: green dot + `"Lagret · ${time}"`, time formatted with `nb-NO` locale, hour+minute 2-digit.
- Syncing: amber dot + `"Sender…"`.
- Dot transition: `background 200ms`.
- **No spinners, no skeleton.** Sync is a sentence, not a hourglass.

### Hole strip
- Tap any hole cell → switch to that hole, reset all 4 score states for the new hole.
- When advancing to next hole via bottom button, do the same.

### Bottom button
- Disabled (bg #D9D2C0, color #9A8F7C, cursor not-allowed) until all 4 players are confirmed.
- Enabled: bg `--primary`, color `--bg`, 1px-translateY lift on `:hover` (not part of this prototype but called out in design system).

## State Management

```ts
type Player = { id; name; hcp; score: number | null; plus: number; confirmed: boolean };
type InputMode = "swipe" | "buttons";

const [holeIdx, setHoleIdx] = useState(0);           // 0..17
const [players, setPlayers] = useState<Player[]>([]); // 4 entries
const [syncing, setSyncing] = useState(false);
const [savedAt, setSavedAt] = useState<string>("");
const [showHint, setShowHint] = useState(true);       // dismissed on first interaction
const [settingsOpen, setSettingsOpen] = useState(false);
const [sheet, setSheet] = useState<{pid:number} | null>(null);
const [inputMode, setInputMode] = useState<InputMode>(
  () => (localStorage.getItem("torny-input-mode") as InputMode) || "swipe"
);
```

**Persistence:**
- `inputMode` ↔ `localStorage["torny-input-mode"]` (read on mount, write on change).
- Score writes should go through the Supabase mutation already in the app — this redesign does not change the data shape, only the input UX.

**Behavior to preserve from the existing app:**
- Optimistic write + reconcile pattern (the green/amber dot reflects this).
- Handicap strokes (`+slag`) calculation — unchanged.
- 4-player flight constraint — unchanged.

## Design Tokens

All tokens already exist in `app/globals.css`. The card colors in this design use these custom variables:

```css
/* Light (forest-and-champagne) — confirmed values used in prototype */
--primary:    #1B4332;  /* deep forest green */
--accent:     #C9A961;  /* champagne gold — for winners + highlights */
--bg:         #F8F6F0;  /* warm linen */
--bg-tint:    #F0EDE5;  /* tint of bg used for foreground on forest */
--surface:    #FFFFFF;  /* card */
--surface-2:  #F0EDE5;  /* selected card / sheet emphasis */
--border:     #E5E0D3;  /* warm beige */
--text:       #1A2E1F;  /* deep forest */
--text-muted: #5C5347;  /* warm taupe */
--success:    #4A7C59;  /* sage */
--danger:     #B8463E;  /* muted brick */
--warning:    #D89B3A;  /* amber */

/* Score-tone derivatives (used on number + delta pill) */
--score-under-fg:  #2F5A3C;   --score-under-bg:  rgba(74,124,89,0.16);
--score-par-fg:    #5C5347;   --score-par-bg:    rgba(92,83,71,0.10);
--score-over1-fg:  #7A5410;   --score-over1-bg:  rgba(216,155,58,0.18);
--score-over2-fg:  #7A2F2A;   --score-over2-bg:  rgba(184,70,62,0.16);
```

**Dark-mode variants exist** in `app/globals.css` and should be respected.

**Typography:**
- `font-serif` → Fraunces (variable, `next/font/google`). Used for: headings, numbers, player names.
- `font-sans` → Inter. Used for: body, labels, kickers, helper text.
- All numbers get `tabular-nums` (`font-variant-numeric: tabular-nums`).

**Spacing scale used:** 4, 6, 8, 10, 12, 14, 16, 18, 24 px.

**Radii:** 7 (hole cells), 9 (small buttons), 12 (sheets, mini cards), 16 (score cards), 9999 (pills, dots).

**Shadows:**
- Card resting: `0 1px 2px rgba(26,46,31,0.04), 0 2px 6px rgba(26,46,31,0.03)`
- Champagne tag: `0 2px 6px rgba(26,46,31,0.15)`

**Motion:**
- 160ms `border-color` transitions on score cards.
- 200ms `background` on sync dot.
- 80ms stagger fade-in (not in this prototype, but a system rule).
- No page transitions. No loading spinners. No bounce.

## Assets

- **`assets/brand-mark.svg`** — full Tørny wordmark with tagline "Fyr opp golfturneringen på et par minutter". Use existing `components/ui/BrandMark.tsx` instead of importing this SVG.
- **`assets/brand-mark-icon-only.svg`** — square T-mark only, for app icon / tight contexts.
- **`assets/flag-pin.svg`** — pin-flag motif (used elsewhere in the system; not used on this screen).

## Acceptance criteria

- [ ] Score defaults to par; card shows par as a ghost value before any interaction
- [ ] Single tap on a card confirms par and fires sync
- [ ] Swipe up ≥16px → +1, swipe down ≥16px → −1 (swipe mode)
- [ ] Long-press 500ms → specific-value sheet (swipe mode)
- [ ] +/− steppers + ⋯-for-specific-value (buttons mode)
- [ ] Input mode persists in `localStorage["torny-input-mode"]`
- [ ] Sync status is a sentence ("Lagret · 14:32" / "Sender…"), never a spinner
- [ ] Card background does NOT change on confirm — only border color shifts to champagne tint
- [ ] Score number changes color by score-tone (sage under par / forest at par / brick over par)
- [ ] Bottom CTA always visible; score list scrolls if it overflows
- [ ] Safe-area top (54px) and bottom (34px) padding respected
- [ ] Onboarding banner shows on first hole only, dismisses on first interaction or × tap

## Files

- `design-reference.html` — the React prototype (open in a browser to see interaction)
- `colors_and_type.css` — design-system CSS variables (Tørny full token set; this screen uses a subset)
- `assets/*` — logo + supporting SVGs
- `README.md` — this file

## Things explicitly out of scope

- Network/offline handling (the existing app's Supabase mutation already covers it)
- Animations beyond the listed micro-transitions
- Changing the data model
- Replacing the existing `BrandMark` component — keep it; this design just references it
