# Evaluation: #845 — i18n N-locale hardening

**VERDICT: ACCEPT**

Fresh-context skeptical evaluation of the 7-commit branch (b3a82fcd..8ab040e6) against
the contract `.forge/contracts/845-i18n-n-locale-hardening.md`. Every criterion independently
verified by reading code and running commands. The hard constraint (zero behavior change for
no/en, byte-identical output, all tests green) holds.

## Gate results (run with Node 22)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **clean** (exit 0, no output) |
| `npm run lint` | **0 errors, 1 warning** — warning is in unrelated `drilldown.tsx` (`notFound` unused), pre-existing, called out in the contract |
| `npm run test` | **295 files / 3886 tests pass** — matches contract claim exactly |

## Scope correctness (important methodology note)

A two-dot `git diff origin/main..HEAD` shows ~14 extra files (untyped-Supabase refactor,
ParAsideInline deletion, approve/scorecard/submit page edits, eval-file deletions). These are
NOT from this branch — `origin/main` advanced from the branch's merge-base `6679e43e` to
`fafab2f6` after the worktree was cut. The correct **three-dot** `git diff origin/main...HEAD`
shows exactly the 22 files the contract describes. **No scope creep, no gold-plating.** I
nearly mis-flagged the untyped-Supabase change (which MEMORY says was already skeptic-rejected
under #672/#798) — it is on main, not here.

## Per-criterion findings

### C1 — format.ts date helpers locale-driven ✅
- Read `lib/i18n/format.ts`: all 7 date helpers' else-branches now use `intlLocaleTag(locale)`
  (formatTeeOffDateLocale L121, formatShortDateWithYearLocale L152, formatShortDateLocale L237,
  formatRelativeLocale L273, shortMonthLocale L314, formatMonthLongLocale L335,
  formatShortUTCDayMonthLocale L362). Every `locale === 'no'` short-circuit preserved (Locked
  Decision #1).
- Genuinely-safe `en-GB` calls correctly LEFT alone: 24h-time `formatTeeOffTimeLocale` L97,
  `formatHHMMOslo` L452, and the digit-only numeric part-extraction in the `no` paths of
  `formatShortOsloDayMonthLocale` L393 / `formatShortOsloDateWithYearLocale` L430. Locale doesn't
  affect digits — verified by reading each.
- Probe-locale tests (`'sv' as AppLocale`) assert actual Swedish output AND `!= 'en'`:
  `formatTeeOffDateLocale → 'fre 8 maj'`, `shortMonthLocale(4) → 'maj'`,
  `formatRelativeLocale → 'för 5 minuter sedan'`, etc. Ran in full suite — green.

### C2 — countdown catalog-driven, no hardcoded English ✅
- `formatCountdownLocale`: grep → **0 refs** anywhere. No "Starting in"/"Starter" literal in
  format.ts (grep clean). Replaced by pure `countdownParts(ms)` classifier (L482).
- `game.waitingRoom.countdown.*` keys present in BOTH catalogs with matching shape (soon,
  seconds, minutes, hoursMinutes, days). Python JSON compare confirms key parity.
- NO catalog strings are byte-identical to legacy `formatCountdown` (lib/format/countdown.ts,
  which stays): "Starter snart", "Starter om {n} s/min", "Starter om {h} t {m} min", "Starter om
  {n, plural, one {# dag} other {# dager}}" — matches the legacy helper char-for-char.
- The `countdown catalog render` test uses the REAL `createTranslator` + real no.json/en.json on
  the production render path and asserts `render(noT, ms) === formatCountdown(ms)` across the ms
  ladder. This is the right test and it passes.
- `ScheduledWaitingRoom.tsx` renders via `useTranslations('game.waitingRoom')` + `t('countdown.*')`.

### C3 — mail picks up a new catalog with no edit to i18n.ts ✅
- `getMailMessages`/`getMailTranslator` are `async` with `await import(\`../../messages/${loc}.json\`)`
  for non-default locales; static `import noMessages` kept for default + `MailCatalog` type. Static
  `CATALOGS` map is gone.
- All 12 mail call-sites `await` — grep for non-awaited call-sites returns only the named imports
  in inviteNotification.ts (lines 19-20), not call-sites; actual calls (15 across files) all `await`.
- Dynamic import path `../../messages/` resolves from `lib/mail/` to repo-root `messages/`
  (verified: messages/no.json + en.json exist there). Mirrors `i18n/request.ts`.
- **No .snap file changed** in the branch (three-dot diff `-- '*.snap'` is empty) → mail output
  byte-identical. Mail tests green in full suite.

### C4 — locale-switcher labels scale ✅
- `LocaleSwitcher.tsx` renders autonyms via `new Intl.DisplayNames([locale], {type:'language'}).of(locale)`
  + capitalize. `localeSwitcher` namespace removed from both catalogs (grep → 0 refs anywhere).
- Node-verified byte-identical: `no → "Norsk"` (true), `en → "English"` (true). Bonus:
  sv→"Svenska", da→"Dansk", fi→"Suomi". No fallback needed — Intl.DisplayNames matches the old
  catalog labels, so the contract's "if it diverges, keep catalog keys" escape hatch wasn't required.

### C5 — cup-mail decimals locale-correct ✅
- Both local `formatPoints` deleted (cupFinished + cupStarted); both now use
  `formatNumber(n, loc, { useGrouping: false })`.
- Node-verified byte-identical to the old `String(n).replace('.', ',')` for no/en across realistic
  values (2, 4.5, 10.5, 0, 13): every case `identical=true`. Comma for sv/da/fi, dot for en.

### C6 — parity tests cover all routing.locales ✅
- Both `catalogParity.test.ts` and `apostropheParity.test.ts` rewritten to loop `routing.locales`
  via `import.meta.glob('./*.json', { eager: true })`.
- catalogParity: `it.each(nonDefaultLocales)` asserts exact leaf-key parity (missing AND extra) vs
  no.json, and fails (`toBeDefined`) if a locale's JSON file is missing. apostropheParity:
  `it.each(routing.locales)` scans every catalog for the #816 double-apostrophe pattern.
- Reasoned: a 3rd-locale catalog with a missing key, extra key, missing file, or a `''` leak
  would now fail CI automatically. Genuinely N-locale-covering.

## N-locale leak hunt (the critical "did they miss a touch-point?" check)

Grepped app/lib/components/i18n for remaining `=== 'no'`/`=== 'en'`/`'en-GB'`/`'en-US'`/`enMessages`:

- **format.ts `=== 'no'` short-circuits + `'en-GB'`**: all are intended legacy delegations
  (else-branch uses `intlLocaleTag`) or digit-only/doc-comment. Not leaks.
- **lib/games/autoGameName.ts** (`suggestGameName`, `localizeGameName`): already N-locale-safe —
  `no` early-return then `intlLocaleTag(locale)` Intl for everything else. Not a gap.
- **app/api/cron/product-update-digest/route.ts:30 `'en-US'`**: extracts numeric day for an
  internal date-gate (`dayInOslo !== 1`), never user-rendered. Locale-irrelevant.
- **lib/games/gamePayload.ts:42/71 `'en-US'`/`'en-GB'`**: internal TZ-offset parse +
  machine-format `YYYY-MM-DDTHH:mm` extraction. Digit/structural, locale-irrelevant.

**Conclusion:** adding a 3rd locale is now genuinely the 2 documented steps (append to
`routing.locales` + add `messages/<code>.json`). No hidden English-leaking touch-point remains in
the audited surfaces. The five audit-identified holes are all closed.

## Issues found

None blocking. The single lint warning is pre-existing and unrelated (`drilldown.tsx`), already
acknowledged in the contract.

## Rationale

All 6 criteria independently verified (not trusted from the implementer's evidence). Gates fully
green at the stated counts. The hard byte-identical constraint is proven for no/en by: catalog
strings matching legacy helpers char-for-char, the real-translator countdown render test,
Node-checked autonyms and number formatting, and zero snapshot churn. Scope is exactly the
contract's 22 files once the merge-base drift is accounted for. The N-locale promise holds end to
end. ACCEPT.
