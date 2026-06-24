# Forge-kontrakt: #927 — `bruttoHelperKeyFor` doblet `allowance.`-prefiks

**Issue:** [#927](https://github.com/jdlarssen/golf-app/issues/927)
**Type:** bug (i18n) · area:admin, area:ui
**Branch:** `claude/zen-goldberg-acf625`

## Problem (verifisert)

`bruttoHelperKeyFor(mode)` i [`lib/games/allowanceCopy.ts:17`](lib/games/allowanceCopy.ts) returnerer en **full** nøkkel med `allowance.`-prefiks (`` `allowance.bruttoHelper.${GameMode}` ``). Den sendes til `tAllowance`, som allerede er scopet til `allowance` (`useTranslations('allowance')`, bekreftet i [`GameForm.tsx:291`](app/[locale]/admin/games/new/GameForm.tsx) og [`GameWizard.tsx:165`](app/[locale]/admin/games/new/GameWizard.tsx)). Oppslaget blir `allowance.allowance.bruttoHelper.<mode>` — finnes ikke. Den korrekte nøkkelen `allowance.bruttoHelper.<mode>` finnes for alle 22 modi i `messages/{no,en}.json`.

To call-sites (begge bekreftet):
- [`GameForm.tsx:615`](app/[locale]/admin/games/new/GameForm.tsx) — `bruttoHelperText={tAllowance(bruttoHelperKeyFor(gameMode) as ...)}`
- [`GameWizard.tsx:749`](app/[locale]/admin/games/new/GameWizard.tsx) — samme med `state.gameMode`

Render-betingelse (begge): `best_ball || isStablefordFamily(mode) || singles_matchplay || solo_strokeplay`.

## Severity-triage (gray area — RESOLVED)

Issuet flagget «bør sjekkes mot prod-i18n-config; hvis prod kaster på edit-flaten er dette P1». **Undersøkt og avkreftet som P1:**

- `i18n/request.ts` har **ingen** `onError`-override → next-intl bruker `defaultOnError`, som er `console.error(error)` — **kaster ikke** (verifisert i `node_modules/use-intl/dist/esm/development/initializeConfig-*.js:17-18`).
- `getMessageFallback: ({ key }) => key.split('.').pop() ?? key` ([`i18n/request.ts:73`](i18n/request.ts)) → for den doble nøkkelen rendres siste segment, dvs. selve mode-slugen (`best_ball`, `stableford`, `solo_strokeplay`, `singles_matchplay`) som hjelpetekst.

**Konklusjon:** I prod **ingen crash** — men feil hjelpetekst (rå mode-slug i stedet for den norske setningen) på alle berørte flater, pluss `console.error`-støy i prod-logger. `best_ball` er wizard-default. Dev-overlayet i issue-reproen er React som promoterer `console.error`. → Dette er en **kosmetisk/UX-bug (P2/P3)**, ikke P1. Verdt å fikse: brutt hjelpetekst for 4 vanlige modi på tvers av wizard-avansert, `?view=full` og edit-skjema.

## Berørte flater

- `/admin/games/new` (wizard, bak «Vis avanserte innstillinger») — `GameWizard.tsx`
- `/admin/games/new?view=full` — `GameForm.tsx` inline
- `/admin/games/[id]/edit` — `page.tsx:273,288` rendrer `GameForm` → samme bug

## Fiks-tilnærming (gray area — RESOLVED per issue-preferanse)

Issuet foretrekker **option 1**: la `bruttoHelperKeyFor` returnere en **relativ** nøkkel (`` `bruttoHelper.${GameMode}` ``), oppdater returtype + JSDoc + begge call-sites. Én kilde, begge call-sites blir korrekte. (Option 2 — kalle via rot-`t` — krever to redigeringer og etterlater funksjonen misvisende navngitt.)

Cast `as Parameters<typeof tAllowance>[0]` på call-sites: behold hvis tsc krever det med den relative nøkkelen; fjern hvis unødvendig. Avgjøres under bygg via `tsc`.

## Regresjonstest (gray area — RESOLVED: pure-logic, Type A)

Ny fil `lib/games/allowanceCopy.test.ts`. Iterer over **alle** `GameMode`-medlemmer og assert at `messages/no.json` → `allowance` → `bruttoHelperKeyFor(mode)` (relativ, splittet på `.`) resolver til en ikke-tom streng. Fanger både dobbel-prefiks-regresjonen og en framtidig manglende katalog-oppføring. 22 modi = 22 cases via `it.each`/loop. Ingen React-render nødvendig.

`components/admin/AllowanceField.test.tsx` røres IKKE — den tester toggle-state-maskinen og tar `bruttoHelperText` som literal prop; bug-en er i nøkkel-derivasjon, ikke i komponenten.

## Suksesskriterier

- [ ] **K1** `bruttoHelperKeyFor` returnerer relativ nøkkel `bruttoHelper.<mode>` (uten `allowance.`-prefiks); returtype + JSDoc oppdatert til å matche.
- [ ] **K2** Begge call-sites (`GameForm.tsx:615`, `GameWizard.tsx:749`) resolver korrekt — ingen dobbel-prefiks; cast beholdt kun hvis tsc krever det.
- [ ] **K3** Ny `lib/games/allowanceCopy.test.ts` asserter at nøkkelen resolver mot ekte `messages/no.json`-katalog for alle 22 `GameMode`-medlemmer. Test feiler på den gamle (doble) implementasjonen, passerer på den nye.
- [ ] **K4** `package.json` patch-bump (1.141.1 → 1.141.2) + `CHANGELOG.md`-oppføring nestet under åpent tema `## 1.141.y`, i samme commit som fiksen (`fix:`-prefiks, håndhevet av commit-msg-hook).
- [ ] **K5** Closing-kommentar postet på #927 (Teknisk + Funksjonell) ved lukking.

## Gates

- `npx tsc --noEmit` — grønn (fanger type-drift fra nøkkel-endringen + begge call-sites).
- `npx vitest run lib/games/allowanceCopy.test.ts components/admin/AllowanceField.test.tsx` — grønn (ny regresjonstest + uendret AllowanceField).
- `npm run lint` — grønn på berørte filer.
- `npm run build` — grønn (Next.js prod-build; fanger exhaustive-switch/Record-drift).

## Ute av scope

- Endre `onError`/`getMessageFallback` i `i18n/request.ts` (fallback-oppførselen er bevisst, ikke en del av denne bugen).
- Refaktorere `AllowanceField` eller `useGameFormState`.
- Staging-klikkrunde er valgfri verifisering (forge-evaluator dekker UI-kriteriet); kjernebevis er unit-test + tsc + build.
