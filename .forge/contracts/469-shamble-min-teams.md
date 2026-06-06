# Contract: shamble krever ≥2 lag i Kompis-wizard (#469)

**Issue:** https://github.com/jdlarssen/golf-app/issues/469
**Derived from:** #467 (v1.83.11) — same scramble-family ≥2-team principle.
**Source of truth:** issue body (user authorized skipping /forge:contract — "kjør på").

## Problem

`shamble` is a team format (teams of 3 or 4) but `fitsPlayerCount` lets it through
at `n=3` and `n=4` — a single team, not a tournament. Current rule:
`n >= 3 && (n % 3 === 0 || n % 4 === 0)` → shows at 3, 4, 6, 8, 9, 12…

## Fix

Require ≥2 teams, matching the #467 treatment of texas/ambrose/florida. Smallest
tournament is 2 teams of 3 = 6. With the 8-slot payload cap, buildable sizes are
`{6, 8}`. New rule in [lib/wizard/fitsPlayerCount.ts](lib/wizard/fitsPlayerCount.ts):

```ts
case 'shamble':
  return n >= 6 && n <= 8 && (n % 3 === 0 || n % 4 === 0);
```

## Success criteria

- [x] `fitsPlayerCount('shamble', n)` → `false` for n ∈ {1,2,3,4,5,7,9,12}, `true` for n ∈ {6,8} — implemented `lib/wizard/fitsPlayerCount.ts` shamble case `n >= 6 && n <= 8 && (n % 3 === 0 || n % 4 === 0)`; test green (110 passed)
- [x] Co-located Type-A test `fitsPlayerCount.test.ts` updated (shamble block) to assert the new floor + 8-slot cap; no other format's tests change — only the shamble `describe`/`it.each` changed
- [x] Version bump (patch) + CHANGELOG entry under open `1.83.y — Liga` theme — v1.83.12, entry added above 1.83.11
- [x] No regressions: full vitest suite + `tsc --noEmit` green — wizard suite 237 passed (18 files); `tsc --noEmit` clean

## Gates

- `npx vitest run lib/wizard/fitsPlayerCount.test.ts` — co-located test green
- `npx vitest run app/admin/games/new lib/wizard` — wizard suite green (no regressions)
- `npx tsc --noEmit` — type-check clean

## Out of scope

- Other scramble formats (already done in #467)
- Migration drift (#470)
- `best_ball` at 2 (deliberate per #374)
