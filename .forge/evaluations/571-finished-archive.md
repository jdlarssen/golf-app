# Evaluation: #571 — Hjem siste 5 avsluttede + «Spill-arkiv»-side

**Verdict: ACCEPT**

Evaluated commits `ccb37737` (refactor) + `9234c915` (feat) against
`.forge/contracts/571-finished-archive.md`, fresh-context and independently.
All three gates run green, every success criterion verified against the code,
and the skeptical break-attempts found no real gaps.

---

## Raw gate results (re-run, not trusted from the contract)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **0 errors** (`TSC_EXIT=0`). `next-intl` resolved fine — no env flag needed. |
| `npx vitest run lib/games lib/format/date` | **25 files, 532 tests passed** — matches the contract's claim exactly, incl. new `groupFinishedByMonth` (4 cases). |
| `npm run build` | **✓ Compiled successfully in 7.1s**, 256/256 static pages. `/[locale]/spill-arkiv` present in route tree as **◐ PPR**; home `/[locale]` also **◐ PPR**. No force-dynamic required or errored. |

---

## Success criteria — per-criterion

1. **`getFinishedGamesForUser` is the single fetch used by BOTH surfaces** — PASS.
   `lib/games/getFinishedGamesForUser.ts` returns `Promise<FinishedGame[]>`
   (filter non-null + `byEndedAtDesc` sort). Home calls it at `page.tsx:135`
   inside the `Promise.all`; archive at `spill-arkiv/page.tsx:32`. Same query
   shape as the original inline one.

2. **`FinishedGameCard` renders #570 layout, used by both, no duplicated JSX** — PASS.
   `components/games/FinishedGameCard.tsx` is the verbatim lift (name / «bane ·
   format» via `formatDisplayLabel` / `formatShortDateLocale(_, 'no')` / 🏆).
   Used at `page.tsx:313` and `spill-arkiv/page.tsx:67`. The old inline card JSX
   is fully removed from `page.tsx` (diff shows the whole block deleted).

3. **Home ≤5 cards; «Vis alle» link → /spill-arkiv only when >5** — PASS.
   `page.tsx:312` `finishedGames.slice(0, 5)`; `page.tsx:315` guard
   `finishedGames.length > 5`; link target `/spill-arkiv`. At exactly 5,
   `5 > 5` is false → link hidden, all 5 shown. Correct boundary.

4. **`/spill-arkiv` lists ALL grouped by month, auth-gated, back-link, empty-state** — PASS.
   `spill-arkiv/page.tsx`: `redirect('/login?next=/spill-arkiv')` at :28,
   `BackLink href="/"` at :38, `groupFinishedByMonth` at :33, month section
   headers at :57–64, empty-state at :50–54. Mirrors `finn-turneringer` pattern
   (AppShell / BackLink / Kicker / PageHeader / `getProxyVerifiedUserId`).

5. **`groupFinishedByMonth` pure + co-located Type A test** — PASS.
   `lib/games/groupFinishedByMonth.ts` is pure (Map-based first-seen bucketing).
   `.test.ts` covers: month bucketing in newest-first order, «juni 2026» label,
   trailing «Uten dato» null bucket, empty input. Meaningful, not tautological.

6. **`GameRow` no longer declares `game_mode`/`mode_config`** — PASS.
   `grep game_mode|mode_config app/[locale]/page.tsx` → **0 matches**. The active
   query/select (`page.tsx:128`) never selected them; mapping at :149–157 never
   read them. tsc clean confirms type honesty.

7. **MINOR bump 1.118.0 + CHANGELOG, refactor+feat split, 1.118.y theme, 1.117.y collapsed** — PASS.
   `package.json` + `package-lock.json` → `1.118.0` (pure version bump, no dep
   changes). New `## 1.118.y — Hjem · spill-arkiv og siste runder` theme opened
   with tagline-blockquote + Teknisk `<details>`. 1.117.y series wrapped into a
   `<details><summary><strong>1.117.y …</strong></summary>` drawer, closed at
   CHANGELOG.md:120 before the 1.116.y drawer. Commits split exactly:
   `ccb37737 refactor(games)` (4 shared files) + `9234c915 feat(home)`
   (home/archive/CHANGELOG/version).

---

## Skeptical break-attempts (all survived)

- **Promise.all refactor:** `finishedGames` is the 3rd destructured element and
  is a `FinishedGame[]` directly. Confirmed every downstream use treats it as an
  array: `page.tsx:160` `.length`, `:308` `.length > 0`, `:312` `.slice(0,5)`,
  `:315` `.length > 5`. No lingering `.data`/`rawFinishedRes`. The old
  filter+map+sort block (origin lines 173–185) is fully deleted.
- **GameRow cleanup:** active select string dropped `game_mode, mode_config`
  (now `…games!inner(id, name, status, ended_at, scheduled_tee_off_at,
  courses(name))`); GameRow type dropped both fields; mapping unaffected; tsc 0.
- **«Vis alle» boundary:** strictly `> 5`, hidden at exactly 5. Correct.
- **No duplicated card JSX:** finished card comes only from `FinishedGameCard`;
  archive's «Vis alle»-style link is not a duplicate card, it's a distinct
  nav link with arrow.
- **Grouping correctness + TZ:** `byEndedAtDesc` = `(b ?? '').localeCompare(a ??
  '')` → real dates desc, nulls last (empty string sorts low when it's the
  "a" side → that element sorts after). First-seen bucketing therefore yields
  newest month first and «no-date» bucket last. Test fixtures use mid-month
  mid-day timestamps (12th/3rd/20th at 10:00Z) — no real timezone offset crosses
  a month boundary, so the `getMonth()` local-getter bucketing is TZ-stable.
  `formatMonthLongNb` uses the same local getters as the grouping key → label
  and bucket agree.
- **Archive build under cacheComponents:** built as ◐ PPR with no force-dynamic
  and no build error — same posture as home and `finn-turneringer`. It reads
  cookies/headers via `getProxyVerifiedUserId`/`getServerClient`, so it's
  dynamic-streamed, exactly as intended.
- **RLS posture:** `getFinishedGamesForUser` receives the cookie client
  (`getServerClient()` via `getHomeContext` on home, `getServerClient()` direct
  on archive) — RLS-respecting, NOT an admin client. Matches the original inline
  query's security posture exactly. No admin/service-role leak.
- **Scope creep:** none. Only the 9 expected files changed (7 source/CHANGELOG +
  package.json/lock). Active cards, discovery section, delete-flow, pagination,
  i18n-migration all untouched — consistent with the "out of scope" list.
- **Test-discipline:** exactly ONE new test file (Type A pure helper). No
  brittle page render test, no Supabase-mock test. Compliant.

## Notes / non-blocking observations

- CHANGELOG file-wide `<details>` vs `</details>` count is 464 vs 451, but this
  imbalance is **identical on origin/main** (pre-existing; legitimate, from
  code-fenced/example content elsewhere). This PR's own additions are balanced.
- DB-level `LIMIT 5` correctly NOT attempted (contract's out-of-scope rationale:
  blocked by the #569 JS-sort; the DOM cap is the real cost saved).
- Live authed browser render not reachable (both routes redirect to /login, no
  headless login codes) — per the contract's UI note, accepted via
  code-wiring + unit-tested pure helper + build evidence. No feasible authed
  render path found without login codes.

**Conclusion: ACCEPT.** No NEEDS WORK items.
