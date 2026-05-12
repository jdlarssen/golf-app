# Handoff: Quick Win #3 — Empty states

## Overview
This handoff packages three **empty states** for the Tørny golf tournament app, redesigned so each one feels like a quiet, intentional moment in a clubhouse rather than a void. No spinners, no apologies. Each state communicates *what happens next* and gives the user a meaningful action or a piece of context to anchor on.

The three states share a visual language (centered composition, champagne kicker above heading, decorative motif at top, Fraunces pull-quote in the bottom margin) so they read as a family. They differ in what they communicate:

1. **Turneringer-tom** — first-run home screen, no active tournaments. *Tone: welcome.*
2. **Scorekort venter** — player is signed up, round hasn't started yet. *Tone: anticipation, with concrete details.*
3. **Leaderboard pre-spill** — round is starting but no scores in yet. *Tone: stillness before the storm, with the starting list as a teaser.*

## About the Design Files
The files in this bundle are **design references created in HTML/React** — a prototype showing intended look, motion, and copy. They are not production code to copy directly. The task is to **recreate the design in the target codebase's existing environment** (Next.js + Supabase, React, Tailwind), using its established patterns: `next/font/google` for Fraunces + Inter, the existing color tokens in `app/globals.css`, the `Card`/`Button` primitives already in `components/ui/`.

## Fidelity
**High-fidelity.** Pixel-precise on a ~390px-wide iPhone canvas. Final colors, type, spacing, motion, and copy. Recreate pixel-perfectly using the codebase's existing libraries.

## Screens / Views

All three screens use the same outer chrome:
- Safe-area top padding: 54px
- Safe-area bottom padding: 34px
- Header row: kicker label (uppercase Inter 10px, tracking 0.20em, color `--text-muted`) centered between a `‹` back chevron (left) and an optional action slot (right).
- Body: `flex-direction: column`, `overflow-y: auto`. Empty states are sized to fit without scrolling but tolerate scroll on shorter devices.

### 1. Turneringer-tom (home, first run)

**Purpose:** First time a player opens the app and they have not yet joined any tournament. The screen should feel like walking into an empty but welcoming clubhouse.

**Layout (top → bottom, all centered):**
1. Header: kicker = `TØRNY`, no right-side action.
2. **Champagne medallion** — 128×128 circle, 28px margin-bottom.
   - Background: `radial-gradient(circle at 50% 38%, #FFFFFF 0%, #F0EDE5 70%, #E5E0D3 100%)`
   - Inset hairline: `inset 0 0 0 1px rgba(201,169,97,0.35)`
   - Drop shadow: `0 2px 12px rgba(26,46,31,0.04)`
   - Centered inside: **PinFlag** SVG, 72px (see assets/flag-pin.svg, also `<PinFlag/>` in the reference).
3. **Kicker** `KLUBBHUSET ER ÅPENT` — Inter 10/600/uppercase tracking-0.20em, color `--accent`, margin-bottom 10.
4. **Heading** `Velkommen, Sindre.` — Fraunces 30/500/-0.02em/line-height 1.15, color `--text`.
   - Copy is `Velkommen, {firstName}.` Always with trailing period.
5. **Body** — 280px max-width, margin-top 12, Inter 14/normal, line-height 1.55, color `--text-muted`.
   - Copy: `Ingen aktive turneringer enda. Bli med via en invitasjon i innboksen, eller sett opp din egen runde.`
6. **CTA stack** — margin-top 32, width 100% max 280, gap 10, column.
   - Primary: `Sjekk innboksen for invitasjon` — bg `--primary`, color `--bg-tint`, Inter 14/600, padding 14/18, radius 12. (This CTA is essentially a non-action — it points the user back to email, since the magic-link onboarding model means tournaments arrive by invite. If your environment has a real "open email" intent on iOS, wire it up; otherwise leave it as a passive label-style primary.)
   - Secondary: `Opprett en turnering` — bg `--surface`, color `--text`, 1px border `--border`, same dimensions.
7. **Pull-quote** — margin-top 32, Fraunces italic 11.5px, color `--text-muted`, centered.
   - Copy: `«En god runde begynner med god planlegging.»` (Norwegian guillemets `«»`)

### 2. Scorekort venter (round signed up, not started)

**Purpose:** The player has confirmed attendance for an upcoming round. Show them the where, when, and who, plus a soft countdown — no input controls until tee-off.

**Layout (top → bottom):**
1. Header: kicker = tournament name (e.g. `LØRDAGSSLAGET`), no right-side action.
2. **Hero block** (24px / 24px / 28px padding, centered):
   - **MailEnvelope** SVG, 56px (see `<MailEnvelope/>` in the reference; `--primary` stroke, `--accent` notification dot top-right).
   - Margin-top 18: kicker `DU ER PÅMELDT`, color `--text-muted`.
   - Margin-top 6: heading `Scorekortet åpner ved tee-off.` — Fraunces 26/500/-0.015em.
3. **Course card** — margin 0/16, padding 18/18/16, bg `--surface`, 1px border `--border`, radius 16, shadow `0 1px 2px rgba(26,46,31,0.04), 0 2px 6px rgba(26,46,31,0.03)`.
   - **Top row** (`space-between`, `align-baseline`):
     - Left: `BANE` kicker → Fraunces 19/500/-0.01em course name → Inter 12 muted line `18 hull · Par 72 · 6 124 m`.
     - Right (text-align right): `TEE-OFF` kicker → Fraunces 22/600/-0.02em tabular-nums time `14:24` → Inter 11 muted `lør. 12. mai`.
   - **Divider:** 1px `--border`, margin 8/-2/14.
   - **Flight section:** kicker `DIN FLIGHT` (muted), then 4 rows, gap 8. Each row:
     - 28×28 avatar circle. Active player: bg `--primary`, color `--bg-tint`, no border. Others: bg `--surface-2`, color `--text`, 1px border `--border`. Avatar text: Fraunces 12/500, first initial.
     - Name (Inter 13.5/500 or /600 for self), with `DEG` champagne kicker chip inline (Inter 9.5/600 tracking-0.18em color `--accent`).
     - HCP value right-aligned (Inter 12, color `--text-muted`, tabular-nums).
4. **Countdown banner** — margin 18/16/0, padding 14/16, bg `--primary`, color `--bg-tint`, radius 14, row flex with gap 12.
   - Champagne 8×8 dot (bg `--accent`), animated `softPulse 2.4s ease-in-out infinite` (keyframes `0,100% { opacity:0.5; scale:1 } 50% { opacity:1; scale:1.12 }`).
   - Text column: Fraunces 15/500 `Starter om 2 t 14 min` + Inter 11.5 opacity 0.75 helper line `Vi gir deg beskjed når kortet åpner.`
   - Countdown text updates every minute. Format: `Starter om {Xh Ym}` until `<1h`, then `Starter om {Ym}`, then `Starter om {Ss}` in the final 60s, then `Starter nå` and the screen should auto-flip to the hole screen.
5. **Footer caption** — padding 18/24/8, centered, Fraunces italic 11.5, color `--text-muted`.
   - Copy: `Vær på 1. tee 10 minutter før start.`

### 3. Leaderboard pre-spill (round started, no scores in)

**Purpose:** Someone opens the leaderboard before the first score lands. Instead of an empty table or a spinner, show the starting list — visible promise that the action is on its way.

**Layout (top → bottom):**
1. Header: kicker = `LEADERBOARD`, no right-side action.
2. **Hero block** (20px / 24px / 8px, centered):
   - **HourGlass** SVG, 48px (`--primary` stroke, `--accent` fill in top half — see `<HourGlass/>` in reference).
   - Margin-top 14: kicker `STILLE FØR STORMEN`, color `--text-muted`.
   - Margin-top 6: heading `Første score forventet kl 14:30.` — Fraunces 24/500/-0.015em.
     - Time is computed: `earliest tee-off + 30 min`, rounded to nearest 5 min.
   - Margin-top 10: body Inter 13/normal/line-height 1.5/280px max-width/color `--text-muted`.
     - Copy: `Fire lag er på vei ut. Tabellen våkner når første kort kommer inn.`
     - "Fire lag" is dynamic — `{teamCount} lag`.
3. **Startliste section header** — padding 22/24/8, kicker `STARTLISTE`, color `--text-muted`.
4. **Team list** — padding 0/16/16, column, gap 8. Each row:
   - Padding 12/14, bg `--surface`, 1px border `--border`, radius 12, shadow `0 1px 2px rgba(26,46,31,0.03)`.
   - 24px-wide rank number (Fraunces 14/500 tabular-nums, color `--text-muted`, center-aligned).
   - Middle column: team name (Fraunces 15/500/-0.005em) + member list (Inter 11.5, color `--text-muted`, ` · ` joined).
   - Right column (text-align right): kicker `TEE` (muted) + tee-off time (Fraunces 15/500/-0.01em tabular-nums).
5. **Pull-quote** — padding 4/24/18, Fraunces italic 11.5, color `--text-muted`, centered.
   - Copy: `«Lykke til, mine herrer.»`
   - This quote should adapt by participant set; if any non-male players are signed up, use `«Lykke til.»` instead. Conservative default if unknown: drop "mine herrer."

## Decorative motifs (icons)

Three custom inline SVGs in `design-reference.html`. Recreate as standalone `.svg` files or as small React components. Stroke color = `currentColor` so they inherit Tailwind text color. Champagne accents are hard-coded `#C9A961`.

- **PinFlag** — 64×64 viewBox. Pin line + champagne swallow-tail flag + soft ground shadow. Used in state 1.
- **MailEnvelope** — 64×64. White envelope, forest stroke, champagne notification dot top-right. Used in state 2.
- **HourGlass** — 64×64. Forest stroke hourglass with champagne upper-sand fill at 70% opacity and a forest dot in the lower chamber. Used in state 3.

All three are at the top of `design-reference.html`'s `<script type="text/babel">` block — lift them out into the codebase's icon module.

## State Management

These are presentational. State comes from the existing tournament/round data model:

```ts
// 1. Turneringer-tom — show when:
activeTournaments.length === 0 && pastTournaments.length === 0

// 2. Scorekort venter — show when:
currentTournament && currentTournament.startsAt > now
// data needed: tournament.name, course.{name, holes, par, lengthMeters},
//              flight.{teeOffAt, players[]}, viewer.id

// 3. Leaderboard pre-spill — show when:
currentTournament.startsAt <= now && noScoresPosted
// data needed: teams[].{name, players[], teeOffAt}, scoreCount === 0
```

**Countdown timer (state 2):** lightweight, `setInterval` 30s. Don't subscribe — the supabase realtime channel will fire `tournament-started` and the screen unmounts.

**Auto-transition (state 3):** subscribe to `scores` table for `tournament_id = current.id`. First insert → unmount this view → real leaderboard. No client-side polling.

## Design Tokens

Same forest-and-champagne palette as the rest of the app. See `colors_and_type.css` for the full token set (light + dark variants). Used here:

```css
--primary:    #1B4332;
--accent:     #C9A961;
--bg:         #F8F6F0;
--bg-tint:    #F0EDE5;  /* foreground on forest */
--surface:    #FFFFFF;
--surface-2:  #F0EDE5;
--border:     #E5E0D3;
--text:       #1A2E1F;
--text-muted: #5C5347;
```

**Dark-mode variants exist** in `app/globals.css` and must be respected. The countdown banner stays forest in both modes (it's a forest panel by intent). The medallion radial gradient inverts:
- Light: `#FFFFFF → #F0EDE5 → #E5E0D3`
- Dark: `#1F4A37 → #163A2A → #0F2C1F` with hairline `rgba(201,169,97,0.4)`

**Typography:**
- `font-serif` → Fraunces. Headings, numbers, names, pull-quotes.
- `font-sans` → Inter. Body, kickers, helpers.
- All numbers `font-variant-numeric: tabular-nums`.

**Spacing scale:** 4, 6, 8, 10, 12, 14, 16, 18, 22, 24, 28, 32 px.
**Radii:** 12 (rows/banner), 14 (countdown), 16 (course card), 9999 (dots, pills, medallion).
**Shadows:** `0 1px 2px rgba(26,46,31,0.04), 0 2px 6px rgba(26,46,31,0.03)` (cards), `0 2px 12px rgba(26,46,31,0.04)` (medallion).
**Motion:** only the champagne dot in state 2 animates (`softPulse 2.4s ease-in-out infinite`). Nothing else. No fade-ins, no slide-ups. Static is the point.

## Copy reference (Norwegian, copy-paste safe)

```
KLUBBHUSET ER ÅPENT
Velkommen, {firstName}.
Ingen aktive turneringer enda. Bli med via en invitasjon i innboksen, eller sett opp din egen runde.
Sjekk innboksen for invitasjon
Opprett en turnering
«En god runde begynner med god planlegging.»

DU ER PÅMELDT
Scorekortet åpner ved tee-off.
BANE / TEE-OFF / DIN FLIGHT / DEG
Starter om {Xh Ym}
Vi gir deg beskjed når kortet åpner.
Vær på 1. tee 10 minutter før start.

STILLE FØR STORMEN
Første score forventet kl {HH:MM}.
{teamCount} lag er på vei ut. Tabellen våkner når første kort kommer inn.
STARTLISTE / TEE
«Lykke til, mine herrer.»
```

Use Norwegian guillemets `«»` (not curly `""`). Use `lør.` / `søn.` etc. with periods. Time format `HH:MM` 24h.

## Assets

- `assets/brand-mark.svg` — full Tørny wordmark. Not used directly on these screens but useful for app-shell context.
- `assets/flag-pin.svg` — standalone pin-flag motif. The inline `<PinFlag/>` in the reference is the canonical version; export from this if you want a `.svg` file.

## Acceptance criteria

- [ ] All three screens render at 390px width without scroll on a 750px-tall viewport.
- [ ] Champagne medallion in state 1 has the radial gradient, hairline, and centered PinFlag at the specified sizes.
- [ ] Kicker color is `--accent` (not muted) only on the first kicker of each screen; subsequent kickers (`DIN FLIGHT`, `STARTLISTE`, etc.) are muted.
- [ ] Course card in state 2 uses tabular-nums on all numbers including time and yardage.
- [ ] Active player ("DEG") in flight list has forest avatar + champagne `DEG` chip.
- [ ] Countdown banner pulses the champagne dot (and only the dot — text doesn't animate).
- [ ] Countdown text updates at least every 30s; auto-transitions to hole screen at `startsAt`.
- [ ] Startliste rows use rank numbers in Fraunces (not Inter).
- [ ] Pull-quote uses Norwegian guillemets `«»`.
- [ ] Dark mode respected (palette inverts; champagne stays; forest countdown panel stays forest).
- [ ] No spinners, no skeleton loaders, no progress bars anywhere in these three states.

## Files

- `design-reference.html` — open in a browser; switcher strip at top toggles between the three states.
- `ios-frame.jsx` — iPhone device frame used by the reference (status bar + home indicator). Not for production.
- `colors_and_type.css` — full Tørny token set.
- `assets/*` — brand mark + flag-pin.
- `README.md` — this file.

## Things explicitly out of scope

- The real leaderboard view (after first score lands) — separate handoff.
- The real hole screen / scorecard — covered by Quick Win #1.
- Push-notification copy ("kortet ditt er klart"). Owned by the notification subsystem.
- Marketing-style hero illustrations. The three SVG motifs here are intentionally small and quiet.
