# Login hero implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the anonymous `<BrandMark />` on `/login` with a new `<BrandHero />` (ChampagneMedallion + forest T-tile + Tørny wordmark + champagne-par tagline), so the entry surface matches the empty-state home language.

**Architecture:** One new presentational component (`components/ui/BrandHero.tsx`) that composes three existing primitives (`ChampagneMedallion`, `PinFlag`, Tailwind tokens). The login page imports it and drops both the old BrandMark and the "Logg inn" h1. Side change: canonical tagline in `CLAUDE.md` updated to match.

**Tech Stack:** Next.js 16 (App Router), Tailwind v4, Fraunces + Inter via `next/font/google`. Light + klubbhus-natt dark mode via CSS variables in `app/globals.css`.

**Design reference:** `docs/plans/2026-05-12-login-hero-design.md`

**Brand-foundations reference:** `docs/design/realized/brand-foundations/README.md` (color ratio, font discipline). Asset reference: `docs/design/realized/brand-foundations/assets/brand-mark.svg`.

---

### Task 1: Create the BrandHero component

**Files:**
- Create: `components/ui/BrandHero.tsx`

**Step 1: Skim primitives this composes**

Read:
- `components/ui/ChampagneMedallion.tsx` (rim + medallion bg)
- `components/icons/PinFlag.tsx` (hero pin-flag illustration, currentColor)
- `components/ui/BrandMark.tsx` (existing T-tile shape language we're scaling up)

Note how `app/page.tsx:158-160` composes ChampagneMedallion + PinFlag for the authenticated empty-state hero — the same vocabulary we're reusing.

**Step 2: Write the component**

Create `components/ui/BrandHero.tsx`:

```tsx
import { ChampagneMedallion } from './ChampagneMedallion';
import { PinFlag } from '@/components/icons/PinFlag';

/**
 * Entry-surface hero: medallion + forest T-tile + "Tørny" wordmark +
 * champagne-tinted tagline. Used on /login. Distinct from `<BrandMark />`,
 * which is the small navigational lockup at the top of authenticated pages.
 *
 * The "par" word in the tagline is rendered in `text-accent` to mirror the
 * brand-mark.svg in `docs/design/realized/brand-foundations/assets/`.
 */
export function BrandHero({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <ChampagneMedallion className="mb-6">
        <PinFlag size={56} className="text-primary dark:text-text" />
      </ChampagneMedallion>

      <div className="w-14 h-14 rounded-2xl bg-primary text-white grid place-items-center font-serif font-medium text-2xl shadow-sm mb-3">
        T
      </div>

      <span className="font-serif text-3xl font-medium tracking-tight text-text leading-none">
        Tørny
      </span>

      <p className="mt-3 font-sans text-sm leading-relaxed text-muted max-w-[260px]">
        Fyr opp golfturneringen på et{' '}
        <span className="text-accent font-semibold">par</span> minutter
      </p>
    </div>
  );
}
```

Notes on the choices:
- `ChampagneMedallion` already has `bg-medallion` + `ring-medallion` — both dark-mode aware via tokens in `app/globals.css`. No manual dark branching here.
- `PinFlag size={56}` is one notch smaller than the home empty-state's `size={72}` — login lives inside a card, so the hero needs to read tighter.
- T-tile is 56×56 (`w-14 h-14`) with `rounded-2xl` (`16px`) — scaled-up version of BrandMark's `w-9 h-9 rounded-xl`. The 2xl radius keeps it visually softer at the larger size.
- "Tørny" at `text-3xl` (~30px) ≈ Fraunces 30/34 from the brand-foundations type scale — first-class but doesn't crowd the tile above it.
- Tagline at `text-sm` (14px) matches the empty-state hero's prose paragraph for visual consistency.
- `max-w-[260px]` prevents the tagline from wrapping awkwardly on wide viewports and matches the empty-state prose width on `app/page.tsx:167`.

**Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

**Step 4: Commit**

```bash
git add components/ui/BrandHero.tsx
git commit -m "feat(ui): add BrandHero component for entry surfaces

Composes ChampagneMedallion + forest T-tile + Tørny wordmark + champagne-tinted
tagline. Mirrors the brand-mark.svg asset that's been sitting unused in
docs/design/realized/brand-foundations/assets/. Distinct from <BrandMark />
which remains the small header lockup."
```

---

### Task 2: Wire BrandHero into the login page

**Files:**
- Modify: `app/(auth)/login/page.tsx`

**Step 1: Read current state**

Open `app/(auth)/login/page.tsx`. Current relevant block:

```tsx
import { BrandMark } from '@/components/ui/BrandMark';
...
<Card>
  <BrandMark className="mb-6 justify-center" />
  <h1 className="font-serif text-3xl font-medium tracking-tight mb-6 text-center text-text">
    Logg inn
  </h1>
  ...
```

**Step 2: Apply edits**

Replace the `BrandMark` import with `BrandHero`:

```tsx
import { BrandHero } from '@/components/ui/BrandHero';
```

Replace the BrandMark + h1 block with:

```tsx
<BrandHero className="mb-8" />
```

The "Logg inn" h1 is intentionally dropped — the hero already signals the surface, and the "Send meg lenke" button + helper text below it make the action unambiguous. We'll verify this read in browser at the verification step; if it feels under-labelled we'll add a small kicker back in a follow-up.

**Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors. (If "BrandMark is declared but never read" appears, the import was missed — re-check the diff.)

**Step 4: Build smoke**

Run: `pnpm build`
Expected: success. `/login` should appear in the route manifest.

**Step 5: Commit**

```bash
git add app/(auth)/login/page.tsx
git commit -m "feat(login): swap BrandMark for BrandHero on entry surface

Drop the 'Logg inn' h1 — the hero + Send-meg-lenke button + helper text
already make the surface unambiguous. Revisit if browser check shows
otherwise."
```

---

### Task 3: Update canonical tagline in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Locate the line**

Grep:
```bash
grep -n "fyr opp golfturneringen" CLAUDE.md
```
Expected: hit on the line under `## Brand` reading *"**Tagline (canonical):** «Tørny — fyr opp golfturneringen på minutter»"* and the subordinate-form line below it.

**Step 2: Apply edits**

In `CLAUDE.md`, replace:
- `«Tørny — fyr opp golfturneringen på minutter»` → `«Tørny — fyr opp golfturneringen på et par minutter»`
- `«Fyr opp golfturneringen på minutter»` → `«Fyr opp golfturneringen på et par minutter»`

Both lines pick up the "et par" wordplay so the source-of-truth matches what `BrandHero` renders.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): adopt 'et par minutter' wordplay as canonical tagline

Match what BrandHero now renders on /login and what brand-mark.svg has
shown all along."
```

---

### Task 4: Push and verify in production

**Step 1: Push**

```bash
git push origin claude/upbeat-kirch-bb4503
```

Note: the worktree branch is `claude/upbeat-kirch-bb4503`. Vercel auto-deploys preview builds for branches. For prod deployment, the user merges to `main` themselves (or we open a PR if they ask). Per CLAUDE.md production-only-testing policy, surface the preview URL and let the user click through.

**Step 2: Surface the preview link**

After push, tell the user:
- Vercel will build the preview within a minute or two.
- Ask them to open `/login` on iPhone Safari (light) and check:
  - Hero reads at a glance — medallion, T-tile, "Tørny", tagline stack feels balanced
  - "par" is the only champagne accent in view
  - Layout doesn't crowd the card at 320px width
- Then desktop Chrome, dark mode toggle — verify medallion + tile + accent flip correctly.

**Step 3: If they want it merged**

Ask explicitly before merging or opening a PR — do not auto-merge. If they confirm:

```bash
git checkout main
git merge --no-ff claude/upbeat-kirch-bb4503
git push origin main
```

If they request a PR instead:

```bash
gh pr create --title "Login hero: Klubbhus-entré" --body "$(cat docs/plans/2026-05-12-login-hero-design.md)"
```

---

## Out-of-scope reminders

- No unit tests added for `BrandHero` — purely presentational, verified visually per the design doc.
- Do **not** touch `<BrandMark />`. It still serves home/profile headers.
- Do **not** copy the SVG into `public/`. The component renders the same lockup natively (dark-mode aware); the SVG file stays as a design reference only.
- Do **not** rename the Dexie DB or modify `lib/scoring/`. (Per CLAUDE.md guardrails — not relevant here but called out for the executing agent.)

## Rollback

Single `git revert` per commit reverses cleanly. The change is self-contained: one new component, one page edit, two CLAUDE.md text swaps.
