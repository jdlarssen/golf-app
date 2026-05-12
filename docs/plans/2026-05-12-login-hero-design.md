# Login hero — design

## Problem

The login screen is currently a small `<BrandMark />` (forest T-tile + "Tørny / TURNERING") above a "Logg inn" headline inside a white card. It feels anonymous — there's nothing on the entry surface that says *this is Tørny* beyond the tiny logo. The empty-state on the authenticated home screen already establishes a recognisable hero language (ChampagneMedallion + PinFlag + Kicker + tagline), but the public-facing entry point doesn't borrow any of it.

We also have a designed `docs/design/realized/brand-foundations/assets/brand-mark.svg` with the tagline *"Fyr opp golfturneringen på et **par** minutter"* (champagne-tinted "par") that is not used anywhere in the app.

## Goal

Make the login screen the brand's *front door*: distinctive, on-brand, and visually consistent with the authenticated empty-state hero. Stay inside the brand-foundations rules (linen 80% / forest 15% / champagne 5%, restraint over ornament).

## Approach — option B "Klubbhus-entré"

Build a new `<BrandHero />` and use it on the login surface in place of the existing `<BrandMark />`. The hero stacks (top → bottom):

1. **ChampagneMedallion** with `<PinFlag size={64}>` in forest. Same component already used on the empty-state home.
2. **Forest T-tile** (~56px, `rounded-xl`, `bg-primary`, white serif "T") — same shape language as `<BrandMark />` but scaled up.
3. **"Tørny"** wordmark in Fraunces 500, ~28–32px, under the T-tile.
4. **Tagline** *"Fyr opp golfturneringen på et **par** minutter"* in Inter 400, muted, with "par" rendered in `text-accent` `font-semibold`.

The "TURNERING" eyebrow that `<BrandMark />` carries is dropped in this variant — the tagline takes that role.

`<BrandMark />` is unchanged and continues to serve as the small header lockup on home/profile/etc.

## Why a separate component instead of a `variant` prop on `BrandMark`

The two surfaces serve different jobs: `<BrandMark />` is a navigational mark (small, header-tier), `<BrandHero />` is an entry-surface hero (large, decorative, sets emotional tone). A `size` or `variant` prop would couple the two and force every future change to think about both contexts. Keeping them separate matches the spec's "one component per use case" instinct already visible in `components/ui/` (e.g. `ChampagneMedallion` vs `Medallion`).

## Page changes

`app/(auth)/login/page.tsx`:

- Replace `<BrandMark className="mb-6 justify-center" />` with `<BrandHero />`.
- Drop or shrink the `<h1>Logg inn</h1>` — the hero already signals where you are. Verify in browser before finalising.
- Success banner (magic-link-sent state) and error banner remain unchanged. The hero stays the same shape in both states — it's the same moment.

## Dark-mode behaviour

All three primitives (ChampagneMedallion, T-tile, tagline) consume theme tokens:

- ChampagneMedallion is already dark-mode aware via `bg-medallion` / `ring-medallion` in `app/globals.css`.
- T-tile uses `bg-primary` which flips from `#1B4332` (day) to `#7EAA80` (klubbhus-natt) per the foundations spec.
- Tagline `text-muted` and "par" `text-accent` flip to their dark equivalents (`#D4B870` for accent).

No manual dark-mode branches in the component.

## Brand-foundation compliance

- **80/15/5:** Linen card background unchanged. Forest used for T-tile + PinFlag icon (small footprint). Champagne used only for the medallion rim and the single "par" word — well under 5%.
- **Restraint over ornament:** No new ornament added beyond what `brand-mark.svg` already prescribes.
- **Numbers in Fraunces:** N/A — no numbers in this view.

## Side-effects

- `CLAUDE.md` canonical tagline line is updated from *"Tørny — fyr opp golfturneringen på minutter"* to *"Tørny — fyr opp golfturneringen på et par minutter"* so the source-of-truth matches what we now render.

## Out of scope

- Other entry surfaces (logout confirmation, error pages, email templates) — those can adopt `<BrandHero />` later if it earns its keep.
- Replacing the small `<BrandMark />` on home/profile.
- Any change to the actual SVG assets in `docs/design/realized/brand-foundations/assets/`.

## Verification

Visual only — no unit tests for the component. After deploy, check `/login` on:

- iPhone Safari (light mode) — the user's primary device
- Desktop Chrome (light + dark mode toggle)
- Verify the medallion + T-tile + wordmark + tagline stack reads cleanly at 320px width
- Verify "par" is the only champagne element in view, and that it reads at a glance

Roll back via revert if the hero feels heavy after a day of use.
