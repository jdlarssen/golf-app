# Evaluation: Admin-flatene viser Oslo-tid, ikke UTC (#637 + #646)

**VERDICT: ACCEPT**

Contract: `.forge/contracts/637-646-admin-oslo-timezone.md`
Diff reviewed: `git diff 54bfb0ea...HEAD` (commits b4b8df36 #637, ec1aa7df #646, 2862f58e test, feeda0e4 contract).
Evaluator posture: skeptical — re-ran all gates, hand-checked the TZ math, grepped both pages for surviving UTC reads.

---

## Gate results (re-run by evaluator)

| Gate | Command | Result |
|------|---------|--------|
| Scoped Type A | `npx vitest run lib/format/teeOff.test.ts lib/format/osloCalendar.test.ts lib/i18n/format.test.ts` | **3 files / 160 tests passed** |
| Typecheck | `npx tsc --noEmit` | **clean, exit 0** |
| Full suite (K9) | `npx vitest run` | **278 files / 3518 tests passed** |
| Build (K9) | `npm run build` | **✓ Compiled successfully in 3.8s; 256/256 static pages** |

(Contract claimed 3517 tests; observed 3518 — the suite grew by the new cases, no failures. Non-issue.)

---

## Per-criterion verification

| # | Criterion | Met? | Evidence observed by evaluator |
|---|-----------|------|--------------------------------|
| **K1** | #637 tee-off in Oslo wall-clock | ✅ | `app/[locale]/admin/games/[id]/page.tsx:606` passes `timeZone:'Europe/Oslo'` to `formatDateTime` (verified in diff). Test `format.test.ts:100` exercises the *identical* options object (`08:00Z → contains '10:00', not '08:00'`) under `process.env.TZ='UTC'`. Genuine deterministic repro of the Vercel bug — see "K1/K3 UI argument" below. |
| **K2** | Protocol subtitle date in Oslo | ✅ | `shortDate()` at `page.tsx:212` routes to `formatShortOsloDayMonthLocale`. Test `format.test.ts:453` (`2026-06-14T23:32:00Z → '15. jun'`, not `'14. jun'`). |
| **K3** | #646 greeting time-of-day follows Oslo | ✅ | `admin/page.tsx:89` `TIME_OF_DAY_KEY[osloTimeOfDayBucket(now)]`. Test `osloCalendar.test.ts:33` (`23:32Z → 'morgen'`, not `'kveld'`) + boundary `it.each` (39–48). |
| **K4** | #646 date line in Oslo | ✅ | `admin/page.tsx:86` `formatShortOsloDayMonthLocale(now, locale)`. Same helper test as K2. |
| **K5** | #646 week from Oslo date | ✅ | `admin/page.tsx:84` `osloIsoWeek(now)`. Tests at `osloCalendar.test.ts:12,19,25` (25 / near-midnight 25-not-24 / NYE 53). Independently re-derived all three with Node — all match. |
| **K6** | Activity-log time in Oslo | ✅ | `admin/page.tsx:669` `formatHHMMOslo(row.ts)`. Tests `format.test.ts:463,467` (`08:00Z summer → '10:00'`, `08:00Z winter → '09:00'`). Midnight `'24'→'00'` normalisation present (`format.ts`). |
| **K7** | "Last signed/published" in Oslo | ✅ | `admin/page.tsx:295,303` both route to `formatShortOsloDayMonthLocale`. |
| **K8** | 'en' locale keeps TZ-correctness | ✅ | `format.test.ts:438,439,448` (`'en' → '15 Jun'/'3 Jun'`); `formatHHMMOslo` locale-independent (24h). |
| **K9** | No regression | ✅ | Full vitest green + build green (re-run by evaluator, see gate table). `osloParts`/`formatTeeOff*` signatures + output unchanged (8 teeOff tests still green). Generic helpers not globally pinned (see non-goals). |
| **K10** | Version/CHANGELOG discipline | ✅ | `package.json` = 1.130.3. b4b8df36 ships 1.130.2 + #637 CHANGELOG + code in one commit; ec1aa7df ships 1.130.3 + #646 CHANGELOG + code in one commit. Both `fix(...)` passed commit-msg hook without `--no-verify`. |

**All K1–K10 met.**

---

## K1/K3 UI argument — does it hold?

Yes. The root cause is pure timezone logic (missing `timeZone` option / local-TZ getters). The Type A tests pin `process.env.TZ='UTC'`, which is exactly the Vercel-server condition. K1's test calls `formatDateTime` with the **same options object** the call-site passes, so it is a faithful proxy for the rendered output. K3/K5 test the bucket/week functions directly and the call-sites are one-line lookups into them (verified in diff). No Playwright is needed because there is no rendering branch between "Oslo helper returns X" and "X appears on screen" — the call-sites pass the helper output straight into the i18n `t(...)` interpolation. Argument accepted.

---

## Adversarial findings

### 1. Surviving local-TZ read in `getSakNumber` — OUT OF SCOPE, latent NYE edge case (not a blocker)
`app/[locale]/admin/games/[id]/page.tsx:144` still does `const year = created.getFullYear();` to derive the protocol "saksnummer" year. This is **pre-existing** (identical at merge-base 54bfb0ea:144) and **not** in the contract's "Berørte kallsteder" list (items 1–7) nor in deviation #3 (which widened scope only to the footer *date*, line 333, now routed correctly at line 336). It is a genuine latent bug — a game created in the ~1h window straddling UTC/Oslo New Year (e.g. `2025-12-31T23:30Z` = `2026-01-01 00:30` Oslo) would get year 2025 from `getFullYear()` on a UTC server while the footer date renders the Oslo year. But it is explicitly outside the agreed "klyngen" scope ("Ikke i scope: app-bred sweep"). **Recommend filing as a follow-up Backlog issue, not blocking this PR.** No other call-site in either page reads UTC: all `new Date()` / `getFullYear` survivors are either DB-filter ISO strings (`admin/page.tsx:224 now.toISOString()`, `:522 sinceIso`) which are correctly TZ-agnostic, or this one out-of-scope year.

### 2. Boundary fidelity — confirmed identical, no silent regression
`osloTimeOfDayBucket` boundaries (`<10 morgen / <12 formiddag / <18 ettermiddag / else kveld`) are byte-identical to the deleted `getTimeOfDay` (verified in diff). `osloIsoWeek` arithmetic is the deleted `isoWeek` algorithm verbatim, with `get*`→`getUTC*` and Oslo y/m/d as the source — re-derived three week values independently with Node (25, 25, 53), all match. No "natt" bucket added (only 4 buckets in `osloCalendar.ts`).

### 3. Signature widening — no caller broken
`formatShortOsloDayMonthLocale(input: string | Date, ...)` is a contravariant widening; the two pre-existing `string` callers (`LigaRoundRow.tsx:33`, plus liga-page/management/delete-confirm callers which use the *non*-Oslo `formatShortDateLocale`) all still typecheck — `string` is assignable to `string | Date`, and `toDate` already accepts `Date | string | number`. tsc clean confirms. `osloParts` adding `year` only ADDS a field; all callers destructure (`{ hour, minute }` etc.), so no breakage — the `toEqual` test locks the exact 6-key shape.

### 4. Non-goals respected
Diff to `lib/i18n/format.ts` only ADDS `formatHHMMOslo` and widens one signature — the bodies of `formatDateTime` / `formatShortDateLocale` / `formatTime` are untouched (no `Europe/Oslo` baked in globally). `formatTeeOffTime`/`formatTeeOffDate` signatures and output unchanged. Storage side untouched.

---

## Summary
Work fully meets the contract. Every in-scope call-site (the 7 listed + footer date per deviation #3) is genuinely rerouted to an Oslo-pinned helper; the TZ math is correct across the near-midnight and New-Year boundaries (independently verified); all four gates pass on my own re-run; version/CHANGELOG discipline is clean per-commit. The single surviving UTC read (`getSakNumber` year) is pre-existing, explicitly out of scope, and only a narrow NYE-window edge case — recommend a follow-up issue, not a blocker.
