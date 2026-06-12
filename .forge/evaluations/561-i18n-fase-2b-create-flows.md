# Evaluation: #561 — i18n Fase 2b (create flows)

**Verdict: ACCEPT**

Skeptical, independent re-verification of every success criterion. Work range:
`89339ea..HEAD` (18 commits), diff vs `origin/main`. All gates run by the
evaluator in the worktree; no claim taken on trust.

Change footprint: 53 files, +3234 / −1139. Every changed source file is within
the contract's declared scope (the only file outside "Files Likely Touched" is
`vitest.setup.ts`, a sanctioned `@/i18n/navigation` test-mock — see C2).

---

## Criterion 1 — No-Norwegian sweep — PASS

Ran my own greps over the full scope (non-test source only):
`opprett-spill`, `opprett-bane`, all of `admin/games/new/**`, `CourseForm.tsx`,
`admin/courses/new/**`, the §1 shared components, and the §2 lib modules.

- **æøå inside quotes/backticks:** 0 hits.
- **Norwegian words without æøå** (Velg/Lagre/Neste/Spillet/Banen/Ingen/Minst/
  Fjern/Slett/Spillere/Opprett/lagets/brutto/netto/spillform/turnering/…) on
  any line containing a quote: 0 hits.
- Sanity: the only `påmelding` occurrences in scope are JSDoc/line comments and
  `*.test.tsx` files (the `'påmelding'` StatusChipTone enum is a code id,
  excluded per contract). My quoted-line grep correctly filtered all of them.

`INTENT_LABELS/DESCRIPTIONS`, `bruttoHelperFor` sentences, and the inline course
error map are gone from source — confirmed via `git show origin/main:<file>`
diffs.

## Criterion 2 — Byte-identical Norwegian — PASS

**No assertion edits in pre-existing tests.** `git diff origin/main...HEAD --
'**/*.test.*'` touches 6 files:
- `admin/courses/new/actions.test.ts`, `admin/games/new/actions.test.ts` —
  pure mock-plumbing: `next/navigation` → `@/i18n/navigation` redirect mock
  (extracts `.href` from object-form, passes same URL string to `redirectMock`)
  + `getLocale` stub. No assertion changed.
- `lib/games/autoGameName.test.ts`, `lib/i18n/format.test.ts` — purely additive
  (zero `-` lines except diff headers).
- `lib/scoring/modes/types.i18n.test.ts` — additive PLAY_STYLE_LABELS drift-
  guard; only `-` line is the import (adds `PLAY_STYLE_LABELS`).
- `lib/admin/gameErrorMessages.i18n.test.ts` — NEW file.

**Spot-check (15 strings, all byte-identical via `git show origin/main` →
no.json value):**
| Original (origin/main) | no.json key |
|---|---|
| `Styrer handicap for fourball-matches. Netto bruker…` (CupSetup AllowanceField) | `wizard.cupSetup.fourballAllowanceDescription` |
| `Styrer handicap for foursomes-matches (alternate shot)…` | `wizard.cupSetup.foursomesAllowanceDescription` |
| `Poeng per hull. Par = 2, birdie = 3…` (ModeSelector tile desc) | `wizard.modeSelector.tiles.stableford.description` |
| `1v1 hull-for-hull. Vinneren avgjøres som «X up»…` | `wizard.modeSelector.tiles.singles_matchplay.description` |
| `Som Texas, men den som slo det valgte slaget…` | `wizard.modeSelector.tiles.florida_scramble.description` |
| `Modifisert Stableford` (MODE_SUMMARY_LABELS) | `wizard.ready.modeSummary.modified_stableford` |
| `Solo slagspill netto` | `wizard.ready.modeSummary.solo_strokeplay` |
| `Par må være et helt tall mellom 3 og 6…` (course error) | `courseForm.errors.bad_par` |
| `Stroke-indeks 1–18 må brukes nøyaktig én gang hver.` | `courseForm.errors.si_duplicate` |
| `Minst én tee må legges til.` | `courseForm.errors.tee_required` |
| `Spillet må ha et navn.` (wizard error) | `wizard.errors.name_required` |
| `Antall longest-drive-vinnere må være 0, 1 eller 2.` | `wizard.errors.bad_side_ld_count` |
| `Point-målet må være et positivt tall (typisk 4,5…)` | `wizard.errors.cup_points` |
| `NGF-standard: 25 % av summen av spillernes spille-HCP…` (GameForm) | `wizard.form.teamHandicap.texasNetto2` |
| `Standard Ambrose: 12,5 % av summen…` | `wizard.form.teamHandicap.ambroseNetto4` |

Ready-chrome (`Bane`, `Tee`, `Tee-off`, `Spillere`, `Ikke valgt`) also preserved.

## Criterion 3 — Gates — PASS

- `npx tsc --noEmit` → exit 0.
- `npm run test` → **263 files, 3335 tests passed** (incl. `catalogParity`,
  re-run standalone: 3/3 green).
- `npm run build` → exit 0.
- `npx playwright test` → **48 passed / 7 skipped / 1 failed**. The single
  failure is `e2e/signup/open-register.spec.ts:27` (expects `/signup/abcd1234`
  → `/login?next=…`, gets no redirect) — the pre-existing **#559** smoke
  failure. Verified this PR touches **no** signup/proxy files and leaves the
  spec unchanged, so the failure is not introduced here.

## Criterion 4 — Raw-key hunt — PASS

Static attack (wizard is auth-gated). Node resolver extracted every translator
call + namespace from all scope files and resolved against **both** no.json and
en.json:

- **Static keys:** 0 unresolved (after correcting regex false-positives where
  `t(` matched the tail of identifiers like `getFormatsForIntent('kompis')` and
  `.select('id, name…')` — none are translator calls).
- **Dynamic key domains, exhaustively expanded** = 85 keys, **0 missing/
  asymmetric**:
  - `wizard.ready.modeSummary.${mode}` × 22 GameModes
  - `allowance.bruttoHelper.${mode}` × 22 (bruttoHelperKeyFor type)
  - `wizard.modeSelector.tiles.${mode}.{title,description}` × the **7** modes
    actually in ModeSelector's TILES array (ambrose, best_ball,
    florida_scramble, singles_matchplay, solo_strokeplay, stableford,
    texas_scramble) — not all 22
  - `modes.playStyle.${style}` × 4 (FormatStyleBadge)
  - `wizard.intent.${intent}.{label,description}` × 4 (kompis/klubb/cup/solo)
  - `wizard.teamSize.${key}.{title,hint}` × 5 (solo/par/fourBBB/tremannslag/
    firemann)
  - `wizard.steps.${step}` × 5
- **`errors.${code}` rendering is `t.has()`-guarded** in all four error-
  rendering pages (`opprett-spill`, `opprett-bane`, `admin/games/new`,
  `admin/courses/new`) — unknown codes render **no banner**, never a raw key.
  Cross-checked: every code the actions emit (`db_game`, `pending_players`,
  `tee_off_required`, course `bad_par/si_duplicate/…`) resolves in the catalog.
- **Unauthenticated render (prod server on :3100):** `/login`, `/en/login`,
  `/legal/privacy` → HTTP 200, **0 raw catalog keys** in visible text (regex for
  `namespace.key.key` patterns = NONE on EN login). All 6 create routes 307-
  redirect to login with **locale-aware** targets (NO→`/login`, EN→`/en/login`)
  and preserved `next` param.

## Criterion 5 — Locale-aware months — PASS

- `lib/games/autoGameName.test.ts`: `it.each` pins **all 12** Norwegian months
  byte-identically (`X 15. januar` … `X 15. desember`), the omitted-locale →
  'no' default, plus 4 English spot-checks (`X 15 May`, `X 15 October`, …).
- `lib/i18n/format.test.ts` `formatTeeOffLineLocale`: pins **all 12** NO months
  (`15. januar 2026 kl. 09:05` …) + zero-padding + midnight edges; 4 EN checks
  (`15 May 2026, 12:30` …) + empty/whitespace→null + unparseable→value contract.
- Call-sites: `GameWizard.tsx` passes `locale` (from `useLocale()`) to
  `suggestGameName`; `ReadyStep.tsx` uses `formatTeeOffLineLocale(…, locale)`
  with `useLocale()`. Both confirmed in source.
- 151 tests across the 4 lib test files run green standalone.

## Criterion 6 — Navigation imports — PASS

Node grep across scope: exactly **one** `next/navigation` import — GameWizard's
`useSearchParams` (the sanctioned exemption). **Zero** `next/link` imports.
Verified `redirect`/`useRouter`/`usePathname`/`Link` all sourced from
`@/i18n/navigation`; both actions use `redirect({ href, locale })` object-form
with `await getLocale()`. No `notFound` in scope.

## Criterion 7 — PPR shape — PASS

Built **origin/main** in a throwaway worktree (`npm install` + `npm run build`)
and diffed normalized route tables (glyph + path):

```
diff routes_main.txt routes_branch.txt  → exit 0 (IDENTICAL)
```

Both: **92 routes, 81 ◐ / 9 ƒ / 2 ○**. The 9 ƒ (dynamic) routes are CSV exports,
logout, cron, icons — **no create-flow route**. All four in-scope routes
(`/[locale]/opprett-spill`, `/[locale]/opprett-bane`, `/[locale]/admin/games/new`,
`/[locale]/admin/courses/new`) are `◐` on both. No regression.

## Criterion 8 — Drift-guards — PASS

- `lib/admin/gameErrorMessages.i18n.test.ts`: `it.each` over every
  `ERROR_MESSAGES_NEW_GAME` code, asserts `catalogErrors[code] === legacy`
  after the sanctioned `{LIST}`→`{list}` normalization. Byte-identical compare.
- `lib/scoring/modes/types.i18n.test.ts`: `PLAY_STYLE_LABELS[style] ===
  modes.playStyle[style]` for all 4 styles. Byte-identical.
- Both run green.

## Criterion 9 — English quality — PASS

Reviewed 15 random new en.json values vs no.json + a full programmatic sweep
over all 595 create-flow keys:

- **American spelling:** 0 (British convention holds; no organiz-/color/center/…)
- **Leftover Norwegian:** only 2 æøå hits, both the **brand name "Tørny"**
  (`Tørny Cup 2026 — Summer round`, `…no friends on Tørny yet.`) — correct, the
  product name keeps its ø in both locales.
- **Norwegian words in EN:** 0.
- **Translation quality:** idiomatic, golf register intact — `Solo stroke play
  (net)`, `game format`, `Course name`, `Cannot be changed after the round
  starts.`, `Team registration is only available for best ball…`. ICU args
  preserved (`Holes {from}–18 go to…`).
- **ICU arg check:** 4 flagged, all benign:
  - `wolfUnderMin`, `playerCount.hint` — proper `{n, plural, one{} other{}}`;
    the "extra arg" my regex flagged is the plural-branch literal word
    (`spillere`/`players`). Real arg (`remaining`/`count`) matches.
  - `page.shortageBannerSome`, `createDoor.shortageBannerSome` — NO has
    `{count}{suffix}{plural}`, EN has `{count}{plural}`. EN legitimately drops
    `{suffix}` (the adjective "registered" doesn't inflect). Call-site passes
    all three; next-intl ignores the unused one. No raw-key/runtime risk.

**Reverse-leak check (English in no.json):** 4 suspects, all genuine Norwegian
verified byte-identical to origin/main — `Tillatte match-formats` (Norwegian
"Tillatte" + golf loanword), `Round Robin-oppsett`, `laveste score`, `Round
Robin`. Their EN counterparts are correctly translated (`Allowed match formats`,
`Round Robin setup`, `lowest score`).

---

## Bonus checks

- **Version/CHANGELOG:** `package.json` 1.114.0 → **1.115.0** (MINOR, correct).
  CHANGELOG opens `## 1.115.y — i18n · engelsk i opprett-flyten` with #561/#60
  links.
- **vitest.setup.ts (+25):** global `@/i18n/navigation` mock (Link→`<a>`,
  router/redirect stubs) so the migrated GameWizard renders provider-free in
  unit tests. Byte-identical-preserving test plumbing, exactly the sanctioned
  category. Not an assertion edit.

## Bugs found

None. The 4 ICU "mismatches" and 4 reverse-leak/American-spelling "suspects" all
resolved to false positives on inspection.

## Final verdict: ACCEPT

Every success criterion independently verified with evidence. Norwegian output
byte-identical (no assertion edits, 15-string spot-check, full suite green);
English coverage complete with zero unresolved keys across 85 exhaustively-
expanded dynamic-key domains and `t.has()`-guarded error rendering; locale-aware
month/date rendering pinned for all 12 months in both directions; navigation
fully migrated; PPR route shape diff-identical to main; drift-guards byte-exact;
English idiomatic and British-spelled.
