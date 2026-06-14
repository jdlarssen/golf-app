# Forge Evaluation: #629 — Konsolider duplisert `first()` searchParam-helper

**Commit:** `af353533`
**Evaluator:** forge:evaluate (skeptical mode)
**Date:** 2026-06-14

---

## Verdict: ACCEPT

All five success criteria pass. No failure modes found.

---

## K1 — Zero local searchParam-helper defs remain

**Command:**
```
grep -rEn "function (first|firstParam)\((value|v): string \| string\[\] \| undefined" --include="*.tsx" --include="*.ts" app
```

**Output:** (empty — zero matches)

**Result: PASS**

---

## K2 — Every touched file imports `first` from the canonical module

**Command:**
```
grep -rln "from '@/lib/url/searchParams'" --include="*.tsx" --include="*.ts" app | wc -l
```

**Output:** `47`

**File list:** All 45 newly-modified page files + `(auth)/login/page.tsx` + `complete-profile/page.tsx` (the two pre-existing imports from #611). The 45 modified files match exactly the list from `git diff HEAD~1 --name-only -- app`.

**Result: PASS**

---

## K3 — No `firstParam(` call-sites remain; liga files call `first()`

**Command:**
```
grep -rn "firstParam(" --include="*.tsx" --include="*.ts" app
```

**Output:** (empty — zero matches)

**Diff confirmation (liga/[id]/page.tsx):**
```diff
-  const joinError = firstParam(sp.error);
+  const joinError = first(sp.error);
```

`liga/[id]/meld-av/page.tsx` shows `const errorCode = first(sp.error);` — call-site correctly renamed.

**Result: PASS**

---

## K4 — No behaviour change (tsc + vitest)

**tsc command:**
```
npx tsc --noEmit
```
**Output:** (empty — 0 errors)

**vitest command:**
```
npx vitest run
```
**Output:**
```
Test Files  274 passed (274)
     Tests  3481 passed (3481)
  Duration  31.32s
```

**Semantic identity check (spot-read 3 files):**

| File | Local helper style | Canonical `first` |
|---|---|---|
| `opprett-spill/page.tsx` | `if (Array.isArray(value)) return value[0]; return value;` (Style B) | `return Array.isArray(value) ? value[0] : value;` |
| `liga/[id]/page.tsx` | `return Array.isArray(value) ? value[0] : value;` (Style A, named `firstParam`) | identical |
| `profile/venner/page.tsx` | `if (Array.isArray(value)) return value[0]; return value;` (Style B) | identical |

Both styles are semantically equivalent (same short-circuit semantics for `undefined` and `string`). No behaviour change for any call-site.

**Result: PASS**

---

## K5 — fallow@2.96 dead-code: no clones, canonical export consumed

**Command:**
```
npx fallow@2.96 dead-code | grep -i "first\|firstParam\|searchParam\|compute\|Intent\|computeLeaderboard"
```

**Output:**
```
  lib/wizard/intent.ts (2)
    :22 isCupIntent
  lib/formats/getFormatsForIntent.ts
    ↔ wizard/intent.ts (1 export)
    Intent
    compute
    computeLeaderboard
```

- No `first`, `firstParam`, or `searchParams` clone entries.
- `lib/url/searchParams.ts` does NOT appear in unused exports → canonical `first` is consumed.
- `Intent`, `compute`, `computeLeaderboard` are the 3 known pre-existing false-positives (unrelated to #629).

**Result: PASS**

---

## Failure-mode checks

### Non-searchParam `first` variables wrongly renamed?

Checked all `const first =` / `let first =` declarations in `app/`:

```
grep -rn "const first\b\|let first\b" --include="*.tsx" --include="*.ts" app
```

Finds 19 occurrences — all are in leaderboard/podium files (e.g. `const first = result.players[0]`, `const first = sortedTeams[0]`, test helper `const first = within(podium).getByTestId('podium-rank-1')`). **None of these files appear in the 45-file change list**. No wrongly-renamed variables.

### Shadowing risk (podium files with `const first` also importing canonical `first`)?

Cross-checked all 14 podium/test files that declare `const first = ...` against `from '@/lib/url/searchParams'` — **zero overlap**. No shadowing.

### Double-blank-lines or broken syntax after helper removal?

Spot-checked diffs for `admin/games/[id]/page.tsx` (Style B, middle of file), `opprett-spill/page.tsx` (Style B, top of file), `liga/[id]/page.tsx` (Style A, firstParam). In all cases the 5-line helper block was cleanly removed leaving a single blank line between the preceding block and the next declaration. No double-blank-lines or syntax breaks.

### Import in invalid position?

Import is always inserted as line 1 (`+import { first } from '@/lib/url/searchParams';`), before other imports. This is valid — Next.js page files have no "first-line must be `'use client'`" constraint (these are all server components). No invalid positions found.

### Tailwind `first:` pseudo-selectors in venner/page.tsx?

`grep -n "first:pt-0\|first:pb-0"` in `profile/venner/page.tsx` finds occurrences in JSX className strings — these are Tailwind CSS pseudo-selectors, entirely unrelated to the `first` import. No conflict.

---

## Summary

- 45 local helper definitions removed, 0 remain (K1 ✓)
- All 45 files + 2 pre-existing = 47 canonical imports (K2 ✓)
- Both `firstParam` call-sites renamed to `first` (K3 ✓)
- tsc: 0 errors; vitest: 3481/3481 green (K4 ✓)
- fallow: no clones, canonical export consumed, 3 known false-positives only (K5 ✓)
- No failure modes: no shadowing, no wrong-variable rename, no syntax artifacts, no invalid import positions
