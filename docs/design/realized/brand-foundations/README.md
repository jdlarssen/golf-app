# Brand Foundations · Tørny

The other eight handoff packages each ship a feature. **This one ships the rules
underneath them** — the philosophy, the color ratio, the font discipline, the
dark-mode personality. Read it once. Refer back when you wonder *why* something
is shaped the way it is.

This is the closing handoff in the Tørny design-system pass. Nothing here is a
new feature — it is the source of truth for every micro-decision the other
packages assume.

---

## What's in this folder

| Path | Purpose |
|---|---|
| `README.md` | Everything below. The doc devs read once, designers reference forever. |
| `tokens.css` | The full base token surface (lifted from `app/globals.css`). Drop into `<head>` and the entire system is wired up. |
| `tokens-additions.css` | Additions on top of base — score-numerikk weight, klubbhus-natt dark mode, font-feature classes. **Additive**, merge these into `globals.css` in one PR. |
| `dark-mode-components.html` | Klubbhus-natt visual reference — buttons, pills, cards, banners, inputs, toggles, brand mark, all in dark mode. |
| `components/` | **22 standalone HTML cards**, one per primitive: buttons, pills, cards, banners, inputs, toggles, score-stepper, shadows, radii, spacing, every color group, every type variant. Each is self-contained — open one to see that primitive in isolation. |
| `ui-kit/` | Full interactive UI kit — `index.html` boots a click-through of every Tørny screen (login, hjem, hull, scorekort, leaderboard, drilldown, admin, profil) using React components in `components.jsx` + `screens-{1,2,3}.jsx`. Drop into a Next.js app and components map 1:1. |
| `assets/` | Brand-mark SVG (full + icon-only), pin-flag, gold/silver/bronze medallions. Use these as-is. |

---

## 1 · Følelsen — one sentence

> **En innbundet medlemsbok i lommeformat.**
>
> Tungt papir, broderert krest, messing-tall. Den vet hvem du er. Den maser
> ikke. Den vet at golf handler om presisjon, og tar seg selv akkurat passe
> alvorlig.

Every design choice should pass this test: *Does it feel like a clubhouse
member-book in your pocket, or does it feel like a SaaS dashboard?* If it's
the second one, redesign it.

### Three operating principles

**1 · Restraint over ornament.** Linen is the default surface. Forest is an
accent for the brand mark, primary buttons, and a few key headings — not a
background. Champagne is *only* for winners, highlights, and moments that
earn the spotlight. The screen earns its champagne; champagne does not
sprinkle itself across the screen.

**2 · Tabular-nums always.** Score, slag, par, indeks, hcp, klokkeslett —
every digit on every screen uses `font-variant-numeric: tabular-nums`. Make
this a lint rule, not a vibe. Numbers that don't column-align break the
feeling of a precise sport.

**3 · Motion in service of clarity.** The 80 ms stagger on leaderboard rows
is exemplary — it leads the eye without performing for it. Everything else:
no page transitions, no bouncing buttons, no parallax, no spinners. Every
animation must be defensible as *"that made me confident in what happened."*
If it doesn't, cut it.

---

## 2 · Color ratio — 80 / 15 / 5

Audit any screen by counting pixels. The healthy ratio is:

| Color | Share | Where it lives |
|---|---|---|
| **Linen** `#F8F6F0` | **80 %** | Page background. Surface fills. The breathing room. |
| **Forest** `#1B4332` | **15 %** | Primary buttons. Brand-mark T-tile. Key headings on hero screens. The header strip on admin. |
| **Champagne** `#C9A961` | **5 %** | Winner crowns. Eyebrow labels (`UPPERCASE 0.18em`). "Par" accent in the hero hull number. Hairlines on the leader card. Replay-pille. |

**The rule:** if a screen crosses 5 % champagne, it has become a casino, not a
clubhouse. Pull back. Champagne is interest income — small, regular,
satisfying. Spend it on the moments you'd toast in real life.

Forest at 15 % means: **forest is a punctuation mark, not a paragraph.**
The primary button is forest. The header band on admin is forest. A whole
screen with forest background is wrong — it would feel like a banking app.

### Audit heuristic

Look at a screen at 25 % zoom. If the dominant color isn't the warm linen
beige, something's off — either the screen is too dense, or an element is
spending color it didn't earn.

---

## 3 · Score-numerikk — Fraunces 600, not 500

Currently scores render in Fraunces 500. Bump them to **600** for any number
that is the *protagonist* of a screen:

- Hero hull number (`#7` on the hole screen)
- Score cells on the scorecard
- Leaderboard totals
- HCP index on the profile
- Hull-for-hull drilldown numbers

Why: at 16–24px on a phone in sunlight, 500 reads a hair too thin. 600 gives
numbers the weight of stamped brass — readable, calm, premium. Headings stay
at 500 so they don't compete.

**Use:** apply class `.score-num` (provided in `tokens-additions.css`). It
locks the font-family, weight, tabular-nums, and OpenType `ss01` (flat-top
1) in one place.

```html
<span class="score-num">7</span>           ← hero hull, 96px
<td class="score-num">4</td>               ← scorecard cell, 18px
<div class="score-num">−2</div>            ← leaderboard total, 36px
```

Inline numbers in sentences (*"spilte 7 over par"*) use the body face but
still need tabular alignment — class `.inline-num`.

---

## 4 · Klubbhus-natt dark mode

The current `[data-theme='dark']` uses cold-leaning forest greens. Replace
with **klubbhus-natt** — a clubhouse-at-night palette lit by brass sconces.

| Token | Light | Dark (current) | Klubbhus-natt |
|---|---|---|---|
| `--bg` | `#F8F6F0` | `#0F1612` | `#14201A` — deep forest-black |
| `--surface` | `#FFFFFF` | `#1A2E1F` | `#1C2A22` — one step up |
| `--text` | `#1A2E1F` | `#F0EDE5` | `#ECE5D2` — warm linen, never pure white |
| `--primary` | `#1B4332` | `#6B9F6F` | `#7EAA80` — sage, softer than day |
| `--accent` | `#C9A961` | `#D4B870` | `#D4B870` — same, but reads warmer against the deeper bg |

The whole block is in `tokens-additions.css`. Apply with:

```html
<html data-theme="klubbhus-natt">
```

…or keep the toggle name `dark` and use `data-theme='dark' class="klubbhus-natt"` —
both selectors are included for migration flexibility.

**When does dark mode trigger?** Per the brief: vinter-turneringer, simulator-baner,
late tee-times. Auto-trigger by `prefers-color-scheme` is fine; the manual
toggle lives in the profile screen.

### Component dark variants

Open `dark-mode-components.html` for the full visual reference. Each primitive
shifts on three axes:

| Primitive | Light → Dark behaviour |
|---|---|
| **Buttons · primary** | Forest `#1B4332` → sage `#6B9F6F` with `#0F1612` text. Inner highlight `rgba(255,255,255,.10)` keeps the lift. |
| **Buttons · secondary / ghost** | Border `#E5E0D3` → `#3E5247`. Text `#1A2E1F` → `#F0EDE5`. Hover wash flips from `rgba(26,46,31,.05)` to `rgba(240,237,229,.06)`. |
| **Buttons · link** | Underlined forest → underlined champagne `#D4B870` — links carry the brand at night. |
| **Pills** | Pale tone-tints (`#E8EFE8`, `#FCF4E2`) → `rgba(tone,.15–.18)` over surface. Pill `Pågående` reads as soft sage glow rather than dark text. |
| **Cards** | White surface + warm shadow → `#1A2E1F` surface, `#2D3F32` border, deeper warm shadow. Icon tiles use `#0F1F15` with champagne glyph. |
| **Champagne banner** | Linen-tinted gradient → forest gradient (`#1F2C24 → #1A2E1F`) with 3px champagne left border. Icon-tile background bumps to `rgba(212,184,112,.12)`. |
| **Inputs** | White fill, beige hairline → `#0F1F15` fill, `#3E5247` hairline. Focus ring `rgba(212,184,112,.20)` stays champagne in both modes. |
| **Toggles** | Off track `#E5E0D3` → `#3E5247`. On track `#1B4332` → sage `#6B9F6F`. Thumb stays linen `#F0EDE5` for warmth (never pure white). |
| **Brand mark** | Forest T-tile on linen → linen T-tile on forest. The mark inverts; the champagne dot to the right of the wordmark stays put. |

**Critical: text is never pure white.** `#F0EDE5` (warm linen) at 100 % is the
ceiling. Pure white on forest is harsh and reads as a system error — Tørny
should feel like reading by lamplight, not from a flashlight.

---

## 5 · Font rules — the full list

What `tokens.css` says today: which fonts. What it *doesn't* say: when to use
which weight, which OpenType features to flip, how to load them. Filling that
gap now.

### When to use Fraunces vs Inter

| Element | Face | Weight | Notes |
|---|---|---|---|
| Page title (`h1`) | Fraunces | 500 | `letter-spacing: -0.01em` |
| Section title (`h2`) | Fraunces | 500 | |
| Card title (`h3`) | Fraunces | 500 | |
| **Player name, team name** | Fraunces | 500 | Names are first-class citizens — they get the serif. |
| **Any number** | Fraunces | **600** | Score, par, hcp, indeks, time. Class `.score-num`. |
| Tagline / pullquote | Fraunces | 400 | Italic optional, with restraint. |
| Body copy | Inter | 400 | |
| Labels, buttons | Inter | 500 | |
| Strong emphasis in body | Inter | 600 | Never 700 — Tørny is not bold. |
| Eyebrow labels | Inter | 600 | `UPPERCASE 0.18em` champagne — class `.section-label.accent` |
| Status pills | Inter | 500 | `UPPERCASE 0.10em` |
| Helper / micro | Inter | 400 | `12px` |

**One rule, no exceptions:** never put a score number in Inter. Numbers are
always Fraunces, always tabular, always 600.

### OpenType features

Apply globally on `<body>`:

```css
font-feature-settings: 'ss01', 'cv11';   /* Inter alternate i, l, a */
```

Apply to every numeric element:

```css
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum' 1, 'ss01' 1;   /* tabular + flat-top 1 */
```

Class `.score-num` and `.tabular-nums` in `tokens-additions.css` do this for
you. Use them.

### Variable-axis usage

Fraunces is variable across **opsz 9..144** and **wght 400..600**. We use
`opsz` implicitly — the browser picks the right optical grade based on
`font-size`. We do **not** use `SOFT` or `WONK` — they introduce the very
ornament we're rejecting.

Inter is loaded at fixed weights (400 / 500 / 600). No italic. No 700.

### Loading

Use `next/font/google` so fonts are self-hosted and preloaded. See
`next-font.config.ts` for the exact config. Key points:

- Subset includes **latin-ext** for ø / å / æ — non-negotiable for a Norwegian app
- `display: 'swap'` — first paint never blocked
- `adjustFontFallback: 'Times New Roman'` on Fraunces and `'Arial'` on Inter
  — eliminates CLS (cumulative layout shift) when web fonts swap in
- Expose as CSS variables `--font-serif` and `--font-sans` so they thread
  into tokens cleanly

### Text utilities

```css
h1, h2, h3, h4 { text-wrap: pretty; }     /* avoid orphans */
.pullquote     { text-wrap: balance; }    /* even line lengths */
```

Apply everywhere. Both are widely supported as of 2024+ and degrade gracefully.

---

## 6 · Implementation checklist

For the dev picking this up next time `globals.css` is open:

- [ ] Append `tokens-additions.css` contents into `app/globals.css`
- [ ] Find every score number in JSX. Wrap in `<span class="score-num">…</span>`
  or apply via component prop. Suspects:
  - `components/hole/HoleNumber.tsx` (hero number)
  - `components/scorecard/ScoreCell.tsx`
  - `components/leaderboard/TeamTotal.tsx`
  - `components/profile/HcpIndex.tsx`
- [ ] In the `next/font/google` config, ensure `latin-ext` is in `subsets`
  and `adjustFontFallback` is set (see `next-font.config.ts`)
- [ ] Add `text-wrap: pretty;` to all heading rules
- [ ] Rename dark-mode CSS hook to `klubbhus-natt` (or keep `dark` as alias)
  and apply the new palette
- [ ] Cross-check each component primitive against `dark-mode-components.html`
  — particularly the pill backgrounds (use `rgba(tone, .15)`, not solid),
  the input fill (`#0F1F15`, not surface), and the link color (champagne,
  not sage) which are easy to miss when porting from light mode
- [ ] Lint rule: any number in JSX inside `<td>`, `<th>`, or a leaderboard
  context should use a number-aware class. Codemod or eslint custom rule.

Estimated effort: **half a day** for tokens + dark mode + score-class
sweep, in one PR alongside any other work.

---

## 7 · Where this came from

These foundations were drawn out of `anbefalinger.html` section 02 (Følelsen)
and 03 (Farger og type), then expanded to cover font discipline that wasn't
in either section but was implicit in every screen we designed. Treat this
file as the canonical version going forward — `anbefalinger.html` was the
proposal, this is the spec.

The previous eight handoff packages (`handoff/quick-win-1` through `-8`)
each implement a single feature against these foundations. They reference
`tokens.css` — once `tokens-additions.css` is merged in, every one of them
gets the upgrade for free.
