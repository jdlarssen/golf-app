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

- [x] **C1 — `format.ts` date helpers locale-driven.** All seven swapped to
  `intlLocaleTag(locale)` / pass `locale` (L440). Evidence: 7 probe-locale tests (`'sv' as
  AppLocale`) assert Swedish output + differ from `'en'`; existing no/en assertions unchanged.
  Commit `b3a82fcd`.
- [x] **C2 — countdown catalog-driven, no hardcoded English.** `formatCountdownLocale` removed
  (grep: 0 refs), replaced by pure `countdownParts`; `game.waitingRoom.countdown.*` ICU keys
  added (no+en); `ScheduledWaitingRoom.tsx` renders via `t`. Evidence: catalog-render test proves
  no.json render == legacy `formatCountdown(ms)` across the ms ladder; no "Starting in" literal in
  `format.ts`. Commit `cb493ff5`.
- [x] **C3 — mail picks up a new catalog with no edit to `i18n.ts`.** `getMailMessages`/
  `getMailTranslator` async + dynamic `import(\`../../messages/${loc}.json\`)`; static `CATALOGS`
  gone; 12 call-sites `await`. Evidence: 14 mail snapshot test files (129 tests) green → no/en
  byte-identical; no `dynamic-import-vars` warning (cross-dir, mirrors `i18n/request.ts`). Commit
  `a3b7b330`.
- [x] **C4 — locale-switcher labels scale.** `LocaleSwitcher.tsx` renders autonyms via
  `Intl.DisplayNames`; `localeSwitcher` namespace removed from both catalogs. Evidence: Node-
  verified `no→"Norsk"`, `en→"English"` (byte-identical), `sv→"Svenska"` etc. Commit `1dc32169`.
- [x] **C5 — cup-mail decimals locale-correct.** Both cup notifications use
  `formatNumber(n, loc, { useGrouping: false })`; local `formatPoints` deleted. Evidence: Node-
  verified byte-identical to old String-replace for no/en across realistic point values; comma for
  no/sv/da/fi, dot for en. Commit `6619ad78`.
- [x] **C6 — parity tests cover all `routing.locales`.** Both parity tests loop the locale list
  via `import.meta.glob`; a missing catalog file fails the guard. Evidence: green with no/en; tsc
  + lint clean. Commit `06ec16d7`.

## Verification (self-check)

`npx tsc --noEmit` clean · `npm run lint` 0 errors (1 pre-existing warning in unrelated
`drilldown.tsx`) · `npm run test` → **295 files / 3886 tests pass**. `next build` not run: this
worktree has no `.env.local`, so static-gen would fail on Supabase env unrelated to the change;
the only build-sensitive item (mail dynamic import) is covered by the clean Vite transform +
the request.ts precedent.

## Gates (scoped to changed files, then full before evaluate)

- `npx tsc --noEmit`
- `npx eslint <changed files>` (full `npm run lint` before evaluate)
- `npx vitest run <changed test files>` (full `npm run test` before evaluate)

Run with Node 22 (`nvm use 22`) — vitest needs native WebSocket via supabase-js.

## Out of scope

Actual sv/da/fi translation (stays in #61). No new locale added to `routing.locales` in this PR.
