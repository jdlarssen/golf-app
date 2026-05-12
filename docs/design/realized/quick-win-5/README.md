# Handoff: Quick Win #5 — Leaderboard pokal-moment

## Overview
This handoff packages the **leaderboard reveal** and its **per-team hull-for-hull drilldown** for the Tørny golf tournament app. The brief said "lage mer karakter på leaderboard, større drama på avsløring." The redesign delivers that through three coordinated moves:

1. **Champagne-tiered hierarchy.** 1st place is not just the top row of a uniform list — it is a separate, taller card with its own visual language (laurels, pinflag flanking, champagne hairline, oversized serif rank numeral). 2nd–4th are quieter standard rows. The jump in weight makes the win feel earned.
2. **One-shot confetti burst** on first view of the leaderboard, in the brand palette (champagne + forest + linen). Spawns from the top of the leader card. No loop, no replay-on-scroll. A `Replay` pill in the header re-fires it on demand for celebration moments.
3. **Drilldown that reads like a scorecard.** Tap any team → 18-hole table broken into UT (1–9) and INN (10–18), with each player's gross, +slag mark, the team's best-ball net (the used score bolded), a tone-coded vs-par pill, and a champagne dot on holes the team won outright.

## About the Design Files
The files in this bundle are **design references created in HTML/React** — a prototype showing intended look, motion, copy, and data shape. They are not production code. Recreate in the existing Next.js + Supabase environment using `next/font/google` (Fraunces + Inter), the color tokens in `app/globals.css`, and the established `Card`/`Button` primitives.

## Fidelity
**High-fidelity.** Pixel-precise on a ~390px-wide iPhone canvas. Final colors, type, spacing, motion timing, and Norwegian copy. Numbers in the prototype are illustrative — the data shape is what to copy.

## Screens / Views

### A. Leaderboard (the reveal)

**Purpose:** Show the final (or live-in-progress) rankings for the round. The 1st-place card is the hero.

**Layout (top → bottom, mobile portrait, ~390px wide):**

1. **Safe-area top** — 54px.
2. **Header row** — 14/18/8 padding. Three columns:
   - Left: `‹` back chevron (18px, color `--text`, hit area ~32px).
   - Center: tournament name as kicker (Inter 10/600 uppercase tracking-0.20em, color `--text-muted`). E.g. `LØRDAGSSLAGET`.
   - Right: **Replay pill** — 4/9 padding, bg `rgba(229,224,211,0.5)`, 1px border `--border`, radius 9999, Inter 10/600 tracking-0.12em uppercase color `--text-muted`, label `Replay`. Tapping re-fires the confetti burst over the leader card.
3. **Title block** — 6/24/14 padding, centered.
   - `Leaderboard` — Fraunces 28/500/-0.02em line-height 1.1.
   - Subtitle Inter 11.5 tabular-nums, color `--text-muted`: `Etter 18 hull · Best ball netto · Stableford`. The first segment swaps to `Etter {N} hull` while the round is live.
4. **Leader card** — 0/14 horizontal padding, 12px margin-bottom. The card itself:
   - bg `linear-gradient(180deg, #FFFFFF 0%, #FBF8EE 100%)`
   - radius 18, padding 22/22/20
   - shadow at rest: `inset 0 0 0 1px rgba(201,169,97,0.55), 0 1px 2px rgba(26,46,31,0.04), 0 4px 16px rgba(26,46,31,0.08)`
   - on entry (240ms after mount): runs `leaderShimmer` 1600ms ease-out — the inset champagne hairline goes from 0 → 1.5px / opacity 0.95 → settles at 1px / 0.55. One-shot, no loop.
   - **Laurel grenade SVGs** — flanking the rank, top:18 / left:14 and top:18 / right:14, height 68px, opacity 0.55, champagne stroke. Right one is `transform: scaleX(-1)`. See `<LaurelLeft/>` in the reference.
   - **Centered column:**
     - Kicker `Leder · 1. plass` — Inter 10/600 uppercase tracking-0.20em, color `--accent`, animation `leaderBadgePulse 3s ease-in-out infinite` (opacity 0.92 ↔ 1.0). The pulse is *very* subtle.
     - Rank numeral `1` — Fraunces 64/600/-0.04em tabular-nums, color `--accent`, `textShadow: 0 1px 0 rgba(184,148,70,0.3)`, margin 4/0.
     - Team name row — Fraunces 26/500/-0.015em color `--text`, flanked by two `<PinIcon size={14} color="#C9A961"/>` with 8px gap.
     - Motto — Fraunces italic 12, color `--text-muted`, margin-top 2, wrapped in `«»`.
   - **Score row** — margin-top 18, padding-top 14, 1px solid `rgba(201,169,97,0.4)` top border. Two columns space-between, baseline-aligned:
     - Left: kicker `Total netto` (muted) → Fraunces 34/600/-0.02em tabular-nums number.
     - Right: kicker `Mot par` (muted) → Fraunces 34/600/-0.02em tabular-nums. Color: `#2F5A3C` if under par, else `--text`.
   - **Players line** — margin-top 14, Inter 12, color `--text-muted`, centered. Full names joined with ` · `.
   - **Tap target** — invisible button overlay (`position:absolute; inset:0; background:transparent`) so the entire card opens the drilldown.
5. **Other teams (2nd, 3rd, 4th)** — 6/14/14 padding, column, gap 8. Each row:
   - 14/16 padding, bg `--surface`, 1px border `--border`, radius 14, shadow `0 1px 2px rgba(26,46,31,0.04), 0 2px 6px rgba(26,46,31,0.03)`.
   - Stagger animation `row-in 360ms cubic-bezier(.2,.7,.2,1) backwards`, `animationDelay: 140 + i*80 ms`.
   - Columns: 24px-wide rank (Fraunces 20/500 muted tabular-nums center) · name+meta · score block · `›` chevron.
   - Name (Fraunces 17/500/-0.005em) over meta (Inter 11.5 muted): `{firstNames} · +{gap} bak leder`.
   - Score block (text-right): big total (Fraunces 22/600/-0.02em tabular-nums) over small kicker `{±N} PAR` (Inter 10/600 tracking-0.12em uppercase muted tabular-nums).
6. **Footer caption** — 4/24/22 padding, centered, Fraunces italic 11, color `--text-muted`. Copy: `Tap et lag for hull-for-hull`.
7. **Safe-area bottom** — 34px.

### B. Drilldown (per team, hull-for-hull)

**Purpose:** Show one team's round in full — every hole, every player's contribution, where they won.

**Layout:**

1. **Header** — same chrome as leaderboard. Left: `‹` (returns to leaderboard). Center kicker: `{TEAM NAME} · {RANK}. PLASS`. Right: nothing.
2. **Team hero** — 6/18/14 padding, row flex, gap 14.
   - Left: rank numeral — Fraunces 48/600/-0.04em tabular-nums. Color `--accent` if rank===1, else `--text-muted`. min-width 50, center-aligned.
   - Middle: team name (Fraunces 22/500/-0.015em) over player meta (Inter 11.5 muted) `{Firstname} (HCP {hcp}) · {Firstname} (HCP {hcp})`.
   - Right: total net (Fraunces 24/600/-0.02em tabular-nums) over `{±N} PAR` kicker.
3. **Legend** — 0/18/8 padding, row flex, gap 14, Inter 10.5, color `--text-muted`:
   - `● vinner av hullet` (7px champagne dot)
   - `• +slag` (champagne small bullet)
   - Right-aligned italic Fraunces 11: `fet = brukt netto`
4. **Front nine** — 6/18 padding, kicker `Ut · hull 1–9` muted.
5. **Front nine table** — 0/14 margin, bg `--surface`, 1px border `--border`, radius 14, shadow `0 1px 2px rgba(26,46,31,0.03)`, overflow hidden.
   - Each row uses `display: grid` with `gridTemplateColumns: "28px 30px 1fr auto 32px 14px"` and `gap: 10`, `padding: 10/14`, `borderTop: 1px solid --border` (first row excluded via natural overflow-hidden):
     - **Col 1 (28px):** hole number — Fraunces 15/500 tabular-nums center.
     - **Col 2 (30px):** `P{par}` — Inter 10/600 tracking-0.12em uppercase muted tabular-nums.
     - **Col 3 (1fr):** player gross scores — inline-flex gap 6. Each:
       - Fraunces 13 tabular-nums. Bolded (weight 600, color `--text`) if this player's net is the team's best; otherwise weight 400 color `#9A8F7C`.
       - If the player got a +slag stroke on this hole, append `<sup>•</sup>` in champagne (8px, Inter 600).
       - Between players: ` / ` separator in `#D9D2C0`.
     - **Col 4 (auto):** team net — Fraunces 18/600/-0.015em tabular-nums, right-aligned. Color by score-tone (sage under par / `--text` at par / amber +1 / brick +2 or worse).
     - **Col 5 (32px):** vs-par pill — Inter 10/600 tabular-nums center, 2/0 padding, radius 9999. Same tone bg/fg as the score number (uses the score-tone variables — see `colors_and_type.css`).
     - **Col 6 (14px):** champagne 8px dot if this team is the outright winner of this hole. `boxShadow: 0 0 0 2px rgba(201,169,97,0.18)`. No dot on ties.
   - Stagger entry: `row-in` animation, `animationDelay: 40 + ii*22 ms`.
   - **Summary row at bottom of table:** `borderTop: 1.5px solid --border`, `background: --surface-2`. Same grid columns. Col 1: `UT` (Fraunces 13/600 muted tracking-0.04em center). Col 2: `P{frontPar}`. Col 3: empty. Col 4: front-nine net total (Fraunces 18/600). Col 5: vs-par mini text muted.
6. **Back nine** — kicker `Inn · hull 10–18` muted, padding 18/18/6. Same table chrome with summary row labeled `INN`.
7. **Total bar** — 18/14/8 margin, 14/18 padding, bg `--primary` (#1B4332), color `--bg-tint`, radius 14. Row flex space-between:
   - Left: kicker `Totalt` color `--accent` over Inter 11.5 opacity 0.75: `{N} hull vunnet`.
   - Right: big total (Fraunces 32/600/-0.02em tabular-nums).
8. **Footer pull-quote** — 4/24/22 padding, centered, Fraunces italic 11, color `--text-muted`. Team motto wrapped in `«»`.

## Confetti spec

Implementation lives in `<ConfettiBurst trigger={replayKey}/>` in the reference. Key params:

- **Count:** 54 pieces.
- **Colors (uniform random):** `["#C9A961","#D7BC78","#B89446","#1B4332","#2E5C42","#F0EDE5"]`. Six values so champagne hits land more often than forest.
- **Piece shape:** absolutely-positioned `<span>`, width `3 + rand*4 px`, height `6 + rand*8 px`, radius 1, marginLeft `-w/2`. Origin: top of container, 50% horizontal.
- **Trajectory per piece:**
  - `angle = (rand - 0.5) * 1.3π` → spans roughly −75° to +75° from vertical.
  - `speed = 90 + rand*120`.
  - `dx = sin(angle) * speed`.
  - `dy = 80 + cos(angle) * speed * 0.6 + rand*120`.
  - `dr = (rand - 0.5) * 720deg`.
- **Animation:**
  ```css
  @keyframes confetti {
    0%   { transform: translate3d(0,0,0) rotate(0); opacity: 0; }
    8%   { opacity: 1; }
    100% { transform: translate3d(var(--dx),var(--dy),0) rotate(var(--dr)); opacity: 0; }
  }
  ```
  Easing `cubic-bezier(.15,.55,.35,1)`.
- **Duration:** `900 + rand*600 ms` per piece.
- **Delay:** `rand*180 ms` per piece — gives staggered release.
- **Container:** `position: absolute; top: 0; left: 0; right: 0; height: 0; pointer-events: none; z-index: 20; overflow: visible`. Placed inside the leader card's outer wrapper so pieces fall from the top of that card. Pieces extend visibly above due to `overflow: visible`.

**One-shot rule:** fire automatically once on mount of the leaderboard view (the first time per session). Persist a `sessionStorage["torny-leaderboard-confetti-seen"]` flag to prevent re-fires on remount. The header `Replay` pill always re-fires it manually (bumps an internal `replayKey`).

**Performance:** pieces are pure DOM nodes with CSS keyframes (GPU-accelerated transforms). No canvas, no JS-driven raf loop. 54 elements × ~1.5s = trivial. Set `will-change: transform, opacity` on each piece. Remove them from DOM 200ms after the longest animation completes (or just on next replay — the key-prop re-mount handles cleanup).

## Animation timing (full sequence)

```
t=0    Leaderboard view mounts
t=60   Leader card row-in begins (rowIn 360ms)
t=140  2nd place row-in begins
t=220  3rd place row-in begins
t=240  Leader card shimmer begins (leaderShimmer 1600ms)
t=300  4th place row-in begins
t=420  Confetti pieces start releasing (over ~180ms window)
t=1840 Shimmer settles to resting state
t=2400 All confetti gone
```

## State Management

```ts
type Player = { name: string; hcp: number; gross: number[] /* 18 */ };
type Team   = { id: string; name: string; motto: string; players: Player[] };
type HoleRow = {
  par: number;
  playerNets: { gross: number; net: number; stroke: 0 | 1 }[];
  teamNet: number;
  vs: number;          // teamNet - par
};
type ComputedTeam = Team & {
  netByHole: HoleRow[];
  totalNet: number;
  vsPar: number;
};

const [view, setView]         = useState<"leaderboard"|"drilldown">("leaderboard");
const [teamId, setTeamId]     = useState<string>("");
const [replayKey, setReplayKey] = useState(0);
```

**Best-ball-netto computation** (one-time per tournament + scoreUpdate; memoize):
1. Per player, distribute `hcp` strokes onto the lowest stroke-index holes (1-stroke each until hcp depleted; >18 wraps a second stroke onto the lowest indices — out of scope for the prototype).
2. Per hole, `playerNets[i] = { gross, net: gross - stroke, stroke }`.
3. `teamNet = min(playerNets[].net)`.
4. `vs = teamNet - par`.
5. Totals = sum of `teamNet` over 18 holes.

**Hole winners (for champagne dots):**
```ts
const HOLE_WINNERS = pars.map((_, h) => {
  const scores = teams.map(t => ({ id: t.id, net: t.netByHole[h].teamNet }));
  const min = Math.min(...scores.map(s => s.net));
  const winners = scores.filter(s => s.net === min);
  return winners.length === 1 ? winners[0].id : null; // null on ties
});
```
Compute once at the tournament level (not per team) and pass into each drilldown.

**Live-round behavior:**
- Subscribe to `scores` table for the active tournament; on change, recompute the team data above and re-render. Confetti does NOT re-fire on score updates — only on the first view of the final ranking, or via the explicit `Replay` pill.
- "Etter {N} hull" replaces "Etter 18 hull" until all teams have completed.
- The Replay pill is hidden while the round is live; it only appears once `tournament.status === "final"`.

## Design Tokens

See `colors_and_type.css` for the full Tørny set. Specific to this screen:

```css
--primary:    #1B4332;
--accent:     #C9A961;
--bg:         #F8F6F0;
--bg-tint:    #F0EDE5;
--surface:    #FFFFFF;
--surface-2:  #F0EDE5;
--border:     #E5E0D3;
--text:       #1A2E1F;
--text-muted: #5C5347;

/* Leader-card specific */
--leader-fill-top:    #FFFFFF;
--leader-fill-bottom: #FBF8EE;
--leader-hairline:    rgba(201,169,97,0.55);
--leader-hairline-peak: rgba(201,169,97,0.95);
--leader-rank-shadow: rgba(184,148,70,0.3);

/* Score-tone (also used in hull-skjerm Quick Win #1) */
--score-under-fg:  #2F5A3C;   --score-under-bg:  rgba(74,124,89,0.16);
--score-par-fg:    #5C5347;   --score-par-bg:    rgba(92,83,71,0.10);
--score-over1-fg:  #7A5410;   --score-over1-bg:  rgba(216,155,58,0.18);
--score-over2-fg:  #7A2F2A;   --score-over2-bg:  rgba(184,70,62,0.16);

/* Confetti palette */
--confetti: #C9A961, #D7BC78, #B89446, #1B4332, #2E5C42, #F0EDE5;
```

**Dark-mode variants exist** and must be respected. The leader card in dark mode uses:
- bg `linear-gradient(180deg, #1F4A37 0%, #1A3D2E 100%)`
- hairline `rgba(201,169,97,0.65)` (slightly brighter to read on forest)
- rank numeral and pin-flag stay `--accent`
- pull-quote and motto stay muted, on dark bg use `#A89977`

**Typography:**
- `font-serif` → Fraunces. Headings, team names, rank numbers, score numbers.
- `font-sans` → Inter. Kickers, helper text, body.
- All numbers `font-variant-numeric: tabular-nums`.

**Spacing scale used:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24 px.
**Radii:** 9999 (pills, dots), 14 (row + table + total bar), 18 (leader card).
**Shadows:** see token block above (leader card has its own composite).

## Assets

- `assets/brand-mark.svg` — full wordmark (not used directly on these screens).
- `assets/flag-pin.svg` — pinflag motif. The `<PinIcon/>` in the reference is a tight 16×16 version used flanking the team name.
- Laurel grenade SVG — defined inline as `<LaurelLeft/>` in the reference. Export as a standalone component or `.svg`. Stroke `currentColor` so it inherits Tailwind text colors.

## Acceptance criteria

- [ ] Leader card renders with champagne hairline (1px resting), white-to-cream vertical gradient, laurel SVGs flanking the rank at 0.55 opacity
- [ ] Rank numeral `1` is Fraunces 64/600 in champagne with subtle inner text-shadow
- [ ] Team name on leader is flanked by `<PinIcon/>` 14px champagne, both sides
- [ ] Leader card runs `leaderShimmer` exactly once on mount (240ms delay, 1600ms duration), then stays at resting hairline
- [ ] 2nd–4th place rows stagger-fade-in with 80ms gap (`row-in` keyframe, `animationDelay: 140 + i*80`)
- [ ] Confetti burst fires once on first view per session and on every `Replay` pill tap
- [ ] Confetti uses 54 pieces in the 6-color palette, with the per-piece trajectory math from the spec
- [ ] Confetti never re-fires on score updates during a live round
- [ ] `Replay` pill is hidden until `tournament.status === "final"`
- [ ] Drilldown table renders with the exact 6-column grid (28/30/1fr/auto/32/14) for both UT and INN
- [ ] Used-net player score is bolded (weight 600 color `--text`); unused-net is weight 400 color `#9A8F7C`
- [ ] +slag is shown as a champagne `•` superscript, NOT as a separate badge
- [ ] vs-par pills use the four score-tone variables (sage / muted / amber / brick)
- [ ] Champagne 8px dot in col 6 only on holes this team won outright (single-team minimum); no dot on ties
- [ ] UT/INN summary row uses `--surface-2` bg with 1.5px top border
- [ ] Total bar uses `--primary` bg with champagne kicker `Totalt`
- [ ] All numbers tabular-nums everywhere
- [ ] Dark mode respected; leader card hairline brightens to `rgba(201,169,97,0.65)`

## Files

- `design-reference.html` — interactive prototype with switcher between leaderboard and drilldown
- `ios-frame.jsx` — iPhone device frame (prototype-only; not for production)
- `colors_and_type.css` — full Tørny token set
- `assets/*` — brand mark + flag-pin
- `README.md` — this file

## Things explicitly out of scope

- Stableford-point math (the prototype shows net-stroke totals; if your tournament format is pure Stableford, the column labels swap from `Total netto` / `Mot par` to `Stableford` / `Poeng`, but the layout is identical)
- Match-play variant (different ranking rules; future handoff)
- Live realtime subscription details (covered by existing Supabase patterns)
- Push notification when a team takes 1st place (owned by notifications subsystem)
- Auto-play of confetti on every leaderboard remount — explicitly one-shot per session
