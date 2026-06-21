# Contract: i18n N-locale hardening (Fase 0 for #61)

**Issue:** #845 · **Refs:** #60, #61 · **Branch:** `claude/hardcore-wu-cbbffd`
**Type:** `refactor` (behavior-preserving for shipped no/en — no version bump, no CHANGELOG)

## Context

Epic #60 shipped no/en i18n. `i18n/routing.ts` + `messages/README.md` promise "adding a
locale = exactly two steps." An adversarially-verified audit (#61 comment) found five places
that branch hardcoded on `no` vs `en` and would silently leak English (or wrong number format)
to any third locale. These are latent bugs — invisible today because only no/en exist. This
contract closes them so the 2-step promise becomes real. No translation work here; the actual
sv/da/fi stays in #61.

## Hard constraint (every change)

**Zero behavior change for no/en.** English output stays byte-identical (keep the `en → en-GB`
mapping in `intlLocaleTag`). Norwegian stays delivered by the legacy helpers via the existing
`if (locale === 'no')` short-circuits. All existing tests green without `-u`.

## Locked decisions (gray areas resolved — technical, owner delegated)

1. **Date helpers (Fix 1):** swap the hardcoded `'en-GB'`/literal `'en'` else-branches to
   `intlLocaleTag(locale)` (helper already in-file). Keep every `locale === 'no'` short-circuit.
2. **Countdown (Fix 2):** fully catalog-driven via **`game.waitingRoom.countdown.*`** ICU keys
   (the component already uses the `game.waitingRoom` namespace). Add a pure locale-independent
   classifier `countdownParts(ms)` in `lib/i18n/format.ts`; render in the component via `t`.
   Delete `formatCountdownLocale` (+ its test block). `no.json` countdown values MUST render
   byte-identical to legacy `formatCountdown` (`lib/format/countdown.ts`, which stays).
3. **Mail catalogs (Fix 3):** make `getMailMessages`/`getMailTranslator` **async** with
   `await import(\`@/messages/${loc}.json\`)` for non-default locales (keep static `import
   noMessages` for the default + `MailCatalog` type). Delete the static `CATALOGS` map. Add
   `await` at the 12 mail call-sites.
4. **Locale switcher (Fix 4):** replace `t(locale)` with autonyms via
   `new Intl.DisplayNames([locale], { type: 'language' }).of(locale)` + capitalize first letter;
   remove the `localeSwitcher` namespace from both catalogs. **Must** keep "Norsk"/"English"
   byte-identical — if `Intl.DisplayNames` diverges on either, fall back to per-locale catalog
   keys instead and document the extra step in `messages/README.md`.
5. **Cup mail points (Fix 5):** replace the two identical local `formatPoints` with the existing
   `formatNumber(n, loc)` from `lib/i18n/format.ts` (nb-NO=comma, en-GB=dot, sv/da/fi=comma).
6. **Parity tests (Fix 6):** parametrize `catalogParity.test.ts` + `apostropheParity.test.ts`
   over `routing.locales` (skip the default vs itself where trivial) so a third catalog is
   auto-covered.

## Success criteria

- [ ] **C1 — `format.ts` date helpers locale-driven.** `formatTeeOffDateLocale` (L121),
  `formatRelativeLocale` (L273), `shortMonthLocale` (L312), `formatMonthLongLocale` (L333),
  `formatShortUTCDayMonthLocale` (L360), `formatShortOsloDayMonthLocale` else (L400) use
  `intlLocaleTag(locale)`; `formatShortOsloDateWithYearLocale` (L440) passes `locale` (not `'en'`)
  to `shortMonthLocale`. Evidence: a Type-A test casting a probe locale (`'sv' as AppLocale`)
  asserts Swedish month/relative-time output; existing no/en assertions unchanged.
- [ ] **C2 — countdown catalog-driven, no hardcoded English.** `formatCountdownLocale` removed;
  `game.waitingRoom.countdown.*` ICU keys added (no+en); `ScheduledWaitingRoom.tsx` renders via
  `t`. Evidence: test proves no.json countdown render == legacy `formatCountdown(ms)` for the
  same ms ladder; no "Starting in" literal remains in `lib/i18n/format.ts`.
- [ ] **C3 — mail picks up a new catalog with no edit to `i18n.ts`.** `getMailMessages`/
  `getMailTranslator` async + dynamic import; static `CATALOGS` gone; 12 call-sites `await`.
  Evidence: a non-default locale not statically imported still resolves its catalog; default
  path unchanged.
- [ ] **C4 — locale-switcher labels scale.** `LocaleSwitcher.tsx` renders autonyms without
  per-locale catalog keys. Evidence: rendered no/en buttons still read "Norsk"/"English"
  (byte-identical); a probe locale would read its autonym.
- [ ] **C5 — cup-mail decimals locale-correct.** Both cup notifications use `formatNumber`;
  local `formatPoints` deleted. Evidence: fractional points render comma for no, dot for en.
- [ ] **C6 — parity tests cover all `routing.locales`.** Both parity tests loop the locale list.
  Evidence: tests green with no/en; an injected key-divergence in a hypothetical third catalog
  would fail.

## Gates (scoped to changed files, then full before evaluate)

- `npx tsc --noEmit`
- `npx eslint <changed files>` (full `npm run lint` before evaluate)
- `npx vitest run <changed test files>` (full `npm run test` before evaluate)

Run with Node 22 (`nvm use 22`) — vitest needs native WebSocket via supabase-js.

## Out of scope

Actual sv/da/fi translation (stays in #61). No new locale added to `routing.locales` in this PR.
