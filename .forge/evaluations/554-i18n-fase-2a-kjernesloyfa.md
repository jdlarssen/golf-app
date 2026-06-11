# Evaluation: #554 — i18n Fase 2a, kjernesløyfa

**Contract:** `.forge/contracts/554-i18n-fase-2a-kjernesloyfa.md`
**Epic:** `.forge/contracts/60-engelsk-ui-i18n.md`
**Branch HEAD:** `87b05c9` vs `origin/main` `2e983d8`
**Evaluator:** fresh-context skeptical re-verification (2026-06-12)

---

## Gates (re-run independently)

| Gate | Claim | My result | Verdict |
|------|-------|-----------|---------|
| `npx tsc --noEmit` | passes | exit 0, no output | PASS |
| `npm run test` | 3260/3260 (262 files) | **3260 passed (262 files)**, 43.84s | PASS |
| `npm run build` | green, 82 ◐ | **✓ Compiled successfully**, exit 0, **82 ◐** (full route table) | PASS |
| `catalogParity.test.ts` | passes | 3 passed | PASS |

All four gates reproduce exactly. The earlier-claimed "82 ◐ stable" is confirmed against the full route table (my first capture was truncated by `tail -120`; a full re-run gave 82).

---

## Per-criterion verdicts

### 1. No hardcoded Norwegian UI literals in scope — **PASS (with a NIT)**

- **æøå-grep over `app/[locale]/games/[id]/**`** (the contract's stated verification tool): every non-comment hit is either a JSX-comment continuation line, or `scheduled: 'påmelding'` in `(home)/page.tsx:75` — a `StatusChipTone` union value (confirmed: `components/ui/StatusChip.tsx:1` defines `type StatusChipTone = 'aktiv' | 'påmelding' | ...`). Code id, not copy. **The æøå-grep passes.**
- `components/hole/**`: clean (zero non-comment æøå, zero Norwegian-word literals).
- Core-loop lib modules (§2): `scorecardTitle.ts`, `holeLabels.ts` (returns semantic ids `choiceWaiting`, `outcomeWolfVant`…), `formatHolesList.ts`, `sideTournament.ts`, `formatLabel.ts` — only JSDoc comments contain Norwegian; no rendered label literals remain.
- **NIT (completeness blind-spot):** the æøå-grep cannot catch the Norwegian words `ukjent` / `Spiller` (no special chars). Raw `'(ukjent)'` / `'Spiller'` null-name fallbacks remain RENDERED in scope where the catalog key already exists or could be added:
  - `(home)/page.tsx` flight-picker labels (`:465–466`) + leaderboard data rows (`:1057,1144,1262`) — raw `'(ukjent)'`.
  - `leaderboard/holes/page.tsx` player rows (10×: `:283,357,…,948`) — raw `'(ukjent)'`, **despite the catalog already having `leaderboard.holes.unknownPlayer`**.
  - `RoundRobinHolesView.tsx:40` — raw `'(ukjent)'`.
  - `holes/[holeNumber]/page.tsx:638,681` — raw `'Spiller'` (tee-starter banner option fallback; no catalog key).
  - (`submit/actions.ts`, `approve/actions.ts` `(ukjent …)` are **mail/notify payloads** → Phase M, correctly out of scope.)
  - Impact is real but **edge-case**: only fires when `users.name` is null (rare; registration captures a name). The implementer correctly handled the 3× `leaderboard/page.tsx` instances that §4 explicitly enumerated (now `tc('unknownPlayer')`). Classified NIT, not BLOCKER, because the contract's stated verification method passes and §4's named scope was met.

### 2. Norwegian output unchanged — **PASS**

- Full suite green with zero assertion edits (the only test changes are sanctioned: redirect-mock targets + new lib return-contract/drift tests).
- **Byte-identical spot-check (5 strings across chunks):**
  - `gameStatus.active` = `"Pågående"` === origin/main `STATUS_LABELS.active`.
  - `gameStatus.finished` = `"Avsluttet"` === `STATUS_LABELS.finished`.
  - `scorecard.playingFrom` = `"Du spiller fra"` === origin/main `scorecard/page.tsx:145`.
  - `common.venter` = `"Venter"` === origin/main `AceyDeuceyView.tsx:343` rendered JSX.
  - `game.finish.subtitleSide` = `"Velg sideturnerings-vinnere for «{name}». Spillet låses når du bekrefter."` === origin/main `avslutt/page.tsx:280` (`${game.name}`→`{name}`).
  - `«»`-quotes and `…` ellipsis preserved; markup-adjacent copy split into key pairs (`rejectionBannerPrefix` ends in `«`). No apostrophe+interpolation strings exist → no ICU-escape landmines.
- **e2e claim verified plausible:** `open-register.spec.ts:27` asserts `/signup/abcd1234` → `/login?next=…`. Live, `/signup/abcd1234` returns **200, no redirect** because `proxy.ts` `PUBLIC_PATH_PATTERN = /^\/(login|register)$|^\/(legal|signup)(\/|$)/` makes signup public (line 47 skips the gate). This pattern is **byte-identical on origin/main and HEAD**; this PR did **not touch proxy.ts, the spec, or the signup page**. The failure is genuinely pre-existing → #559 is sound. The 7 env-skips are explained: `.env.local` has only anon keys, no `SUPABASE_SERVICE_ROLE_KEY`, so `envReady=false`.

### 3. Byte-identical Norwegian — **PASS** (covered in §2; 5/5 verified against `git show origin/main:<file>`).

### 4. English coverage and quality — **PASS**

- `catalogParity.test.ts` is genuine: flattens both catalogs to leaf dot-paths and asserts **bidirectional** symmetry (no→en AND en→no), plus non-empty. Not a tautology. Passes.
- 907 en leaf keys; **0** equal-to-key-path or empty; only æøå in en values = the brand name `Tørny` (×3, deliberately preserved).
- **Placeholder "mismatches" (12) are all correct ICU upgrades, not bugs:** English adds `selectordinal` for ranks (`{rank, selectordinal, one{#st} two{#nd} few{#rd} other{#th}}`) and `plural` for nouns (`{count, plural, one{hole} other{holes}}`) where Norwegian uses flat `{rank}. plass` / invariant `hull`. Live-rendered via `IntlMessageFormat`: `1→1st, 2→2nd, 3→3rd, 4→4th, 11→11th, 21→21st, 23→23rd` — correct English ordinal grammar incl. the 11th exception. ICU plural sanity: one/other branches genuinely differ.

### 5. Drift-guards — **PASS**

- `lib/games/status.i18n.test.ts`: asserts `STATUS_LABELS[s] === noMessages.gameStatus[s]` for all 4 statuses. Real comparison of runtime constant vs catalog.
- `lib/scoring/modes/types.i18n.test.ts`: asserts `MODE_LABELS[m] === noMessages.modes[m]` for all members + `formatDisplayLabel(...)` === `resolveModesCatalogKey(formatDisplayLabelKey(...))` for 6 variant branches. **Verified the test array covers exactly all 22 `MODE_LABELS` members — no gap** (contract's "23" was loose prose; there are 22). Parametrized, non-tautological.

### 6. Navigation imports migrated — **FAIL (BLOCKER)**

- `from 'next/link'`: **zero** in touched files. `Link`/`useRouter` clean everywhere. Correct pattern confirmed in 12+ files: `import { redirect } from '@/i18n/navigation'` + `redirect({ href, locale })`.
- **But 2 touched files still import `redirect` from `next/navigation` and call it with bare string paths:**
  - `leaderboard/page.tsx:5` → `redirect('/login')` (`:237`), `redirect('/games/${id}')` (`:255`, draft-game bounce).
  - `leaderboard/holes/page.tsx:3` → `redirect('/login')` (`:99`), `redirect('/games/${id}')` (`:116`), `redirect('/games/${gameId}/leaderboard?mode=...')` (`:987`).
- `i18n/navigation.ts`'s own header: *"App code must import redirect from HERE … so hrefs get the correct locale prefix automatically."* The raw `next/navigation` redirect does NOT add `/en`. **Functional locale-loss:** an authenticated EN user on `/en/games/[id]/leaderboard` whose game is `draft` (line 255) — or who hits the holes mode-validation redirect (line 987) — is bounced to the unprefixed `no` route, silently dropping their language. (The `/login` branches are mostly shadowed by the locale-aware proxy gate, but the `/games/…` branches fire for authenticated users.)
- The criterion-6 evidence ("migrated in **every** touched file") is **false** for these 2 files. Direct, reproducible failure of a success criterion with real impact. Fix is mechanical (swap import to `@/i18n/navigation`, pass `{ href, locale }` with `getLocale()` — the page already runs in a server context).

### 7. Locale-aware date/countdown helpers — **PASS**

`lib/i18n/format.ts` adds `formatTeeOffDateLocale/-TimeLocale`, `formatShortDateWithYearLocale`, `formatCountdownLocale`; `lib/i18n/format.test.ts` proves `no` === legacy output. Call-sites migrated. (tsc + full suite green covers this.)

### 8. PPR shape holds — **PASS**

Full build route table: **82 ◐**. Every player-facing `games/[id]` route is ◐ (PPR): `(home)`, `approve`, `avslutt`, `holes/[holeNumber]`, `leaderboard`, `leaderboard/holes`, `rediger`, `scorecard`, `slett`, `spillere`, `submit`, `trekk-fra`. The only ƒ under `games/[id]` is `leaderboard/export` — a `route.ts` Response handler (dynamic by default in Next; no explicit directive on main or HEAD). **No new force-dynamic; no PPR regression.**

### 9. Contract boundaries respected — **PASS**

- `app/[locale]/admin/**`: **untouched** (Out of Scope — correct).
- FormatGuideSheet / `mergedModeContent` / `modeGuide`: **not in diff** — DB content stays Norwegian (Phase D boundary respected).
- **No Norwegian copy edits:** sampled `game.home` strings (`DU ER PÅMELDT`, `Scorekortet åpner ved tee-off.`, `18 hull`, `(ukjent bane)`) are all byte-identical to origin/main `(home)/page.tsx`. Extraction is 1:1.
- vitest stub (§6): `createTranslator` from `use-intl/core` (next-intl's core; functional equivalent of the contract's `next-intl` re-export) with `onError` suppression + `getMessageFallback` returning the key path (non-throwing). Correct.
- Version: **1.113.4 → 1.114.0** (MINOR — correct). CHANGELOG: new `## 1.114.y` series at top, prior `1.113.y` wrapped in `<details>` per convention, tagline present.

---

## Findings

### BLOCKER

1. **Two leaderboard pages use raw `next/navigation` `redirect` instead of the locale-aware `@/i18n/navigation` wrapper** — `leaderboard/page.tsx` (lines 5, 237, 255) and `leaderboard/holes/page.tsx` (lines 3, 99, 116, 987). Directly fails success-criterion 6 ("migrated in every touched file"). Real locale-loss for authenticated English users on the draft-game bounce (`:255`) and the holes mode-redirect (`:987`): they land on the unprefixed `no` route. Fix: import `redirect` from `@/i18n/navigation`, call `redirect({ href, locale })` with `await getLocale()` (both are already async server pages). ~5 call-sites, mechanical.

### NIT

2. **Raw Norwegian null-name fallbacks not extracted** (æøå-grep blind spot — `ukjent`/`Spiller` have no special chars): `(home)/page.tsx` (5×), `leaderboard/holes/page.tsx` (10×, **catalog key `leaderboard.holes.unknownPlayer` already exists**), `RoundRobinHolesView.tsx:40`, `holes/[holeNumber]/page.tsx:638,681` (`'Spiller'`, needs a new key). Edge-case (null `users.name` only). The 3× `leaderboard/page.tsx` instances §4 explicitly named WERE done. Worth tidying for full EN coverage; not blocking on the contract's stated verification method.

---

## Final verdict: **NEEDS WORK**

The work is high quality and near-complete: gates all reproduce (tsc 0, 3260/3260, build green 82 ◐), Norwegian byte-identical (5/5), English idiomatic with correct ICU `selectordinal`/`plural`, drift-guards real and member-complete, boundaries respected, version/CHANGELOG correct, and the e2e/#559 pre-existing-failure reasoning is verified sound. **But success-criterion 6 fails as written and as behavior:** two touched leaderboard pages still redirect through `next/navigation` with bare paths, dropping the `/en` prefix for authenticated English users.

**Must change to ACCEPT:**
- Migrate `redirect` to `@/i18n/navigation` (`{ href, locale }` form) in `leaderboard/page.tsx` and `leaderboard/holes/page.tsx` (BLOCKER #1).

**Recommended (NIT, can fold into the same fix or a follow-up):**
- Extract the raw `'(ukjent)'` / `'Spiller'` null-name fallbacks listed in NIT #2 to catalog keys (several keys already exist).

---

## Re-evaluation (round 2)

**Fix commit:** `f69ae1c` (`refactor(i18n): fix evaluator findings …`)
**Branch HEAD:** `f69ae1c` vs `origin/main` `2e983d8`
**Re-evaluator:** fresh-context skeptical re-verification (2026-06-12), independent gate re-run + diff audit.

The fix commit touches exactly 7 files (5 code + both catalogs), `63 +/36 −`. Tight, scoped to the two findings. Nothing else moved (`git diff --stat 6c15f3e..HEAD` confirms).

### BLOCKER #1 (raw `next/navigation` redirect with bare paths) — **RESOLVED**

- **Both leaderboard pages migrated.** `leaderboard/page.tsx:6` and `leaderboard/holes/page.tsx:4` now `import { redirect } from '@/i18n/navigation'`; `notFound` stays on `next/navigation`. All 5 former bare-path call-sites now pass the object form with `locale` from `getLocale()`:
  - `leaderboard/page.tsx`: `:239` `redirect({ href: '/login', locale })`, `:257` `redirect({ href: \`/games/${id}\` …, locale })`. `locale` resolved at `:237` (`await getLocale()`).
  - `leaderboard/holes/page.tsx`: `:102` `/login`, `:119` `/games/${id}`, `:1000` `/games/${gameId}/leaderboard?mode=…` (each `{ href, locale }`; `locale` at `:100`, plus a fresh `await getLocale()` inline at the `:1000` deep-body site).
- **Whole-scope grep re-run** (`app/[locale]/games/[id]/**`, `components/hole/**`): the ONLY `from 'next/navigation'` imports remaining are `notFound` (12 files) and one pre-existing `useRouter` in `PreRoundLeaderboard.tsx:4` — used solely for `router.refresh()` (same-route, locale-neutral; file untouched by the phase, allowed per the prompt's hooks carve-out). **Zero `redirect` imported from `next/navigation` anywhere in scope.** Every `redirect(` call across the entire `games/[id]` tree (actions + pages, ~40 sites) is the `@/i18n/navigation` object form. Criterion 6 now holds as written and as behavior — the EN draft-game bounce and the holes mode-redirect keep the `/en` prefix.

### NIT #2 (raw Norwegian null-name fallbacks) — **RESOLVED for the enumerated set; one residual pre-existing variant noted**

- All call-sites the round-1 NIT named are now catalog-driven: `(home)/page.tsx` (5×, `t`/`tHome` bound to `game.home` → `t('unknownPlayer')`); `leaderboard/holes/page.tsx` (10 body fns, each adds `const tCommon = getTranslations('leaderboard.common')` → `tCommon('unknownPlayer')`); `RoundRobinHolesView.tsx` (fallback now threaded as a param from `t('common.unknownPlayer')`, fixing the prior hardcode); `holes/[holeNumber]/page.tsx:640,684` (`tEntry('playerFallback')`, namespace `holes.entry`).
- **New catalog keys verified byte-correct in BOTH catalogs:** `game.home.unknownPlayer` = `'(ukjent)'` / `'(unknown)'`; `leaderboard.common.unknownPlayer` = `'(ukjent)'` / `'(unknown)'`; `holes.entry.playerFallback` = `'Spiller'` / `'Player'`. All 5 distinct key references in the fix resolve to existing keys (no raw-key render). `catalogParity.test.ts` green (3/3) → full no/en symmetry preserved.
- **Contract's stated verification (æøå-grep) passes clean:** after stripping comments, the only code-literal special-char hit in scope is `scheduled: 'påmelding'` (`(home)/page.tsx:75`) — a `StatusChipTone` union id, not copy. Same single PASS hit as round 1.
- **Residual (not a regression, not blocking):** four `'(ukjent spiller)'` literals survive — two UI-rendered (`submit/page.tsx:241` scorecard `enteredByName`; `approve/page.tsx:206,209` pending-player `displayName`) and two mail/notify payloads (`submit/actions.ts:128`, `approve/actions.ts` — Phase M, correctly out of scope). The two UI ones are **pre-existing on `origin/main`** (verified: `git show origin/main:…submit/page.tsx` and `…approve/page.tsx` both carry them) and **predate this phase** (present at `cf00d55^`). Round 1's NIT enumerated only the bare `'(ukjent)'` / `'Spiller'` variants and missed the `'(ukjent spiller)'` suffix variant in these two pages. Invisible to the contract's æøå-grep (no special chars); both guarded by an explicit "name is non-null in active games" invariant comment → defensive-only, fires only on a null `users.name` that the publish-gate prevents. Same NIT class as round 1, lower severity (pre-existing extraction gap, not introduced). Worth a small follow-up for 100% EN coverage; does not gate this contract whose stated verification method passes.

### `userId as string` cast (`leaderboard/page.tsx:273`) — **SAFE by construction**

`if (!userId) redirect({ href: '/login', locale })` at `:239` throws (`NEXT_REDIRECT`) before any later code runs, so `userId` is provably non-null at `:273`. The cast became *necessary* (not sloppy) because next-intl's `createNavigation` `redirect` is typed to return `void`, not Next-native's `never` — so TS no longer auto-narrows `userId` past the guard. Minimal, correct, unreachable-null.

### Gates (re-run independently at `f69ae1c`)

| Gate | Result | Verdict |
|------|--------|---------|
| `npx tsc --noEmit` | exit 0, no output | PASS |
| `npm run test` | **3260 passed (262 files)**, 0 failures, 29.18s | PASS |
| `npm run build` | **✓ Compiled successfully**, **82 ◐** PPR routes | PASS |
| `catalogParity.test.ts` | 3 passed | PASS |

PPR shape unchanged: 82 ◐ (matches round 1). Every player-facing `games/[id]` route stays ◐; the only ƒ under `games/[id]` is `leaderboard/export` (a `route.ts` Response handler — dynamic by default on main and HEAD, not new force-dynamic). No regression.

### Regression sweep (diff `6c15f3e..HEAD`)

- Only the 7 expected files changed; no collateral edits.
- **Zero** new Norwegian special-char string literals added to code.
- All catalog keys referenced by the fix exist in both catalogs (no raw-key render risk).
- Norwegian byte-identical preserved (full suite green with zero assertion edits; the round-1 5/5 byte-checks are untouched by this commit).

### Final verdict: **ACCEPT**

Both round-1 findings are genuinely fixed. The BLOCKER (criterion 6) is fully resolved — every `redirect` in the `games/[id]` scope is now the locale-aware `@/i18n/navigation` object form, EN users keep their `/en` prefix on all bounces. The NIT's enumerated fallbacks are catalog-driven with byte-correct keys in both locales. The `userId` cast is provably safe. All four gates reproduce green (tsc 0, 3260/3260, build 82 ◐, parity 3/3), the contract's æøå-grep passes, and no regression entered. The one residual `'(ukjent spiller)'` in `submit`/`approve` pages is a **pre-existing** extraction gap (origin/main carries it), out of round 1's named scope, behind a non-null invariant — a recommended follow-up, not a blocker. Contract success criteria met.
