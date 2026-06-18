# Forge-kontrakt: #692 — Rydd lint-feil så lint kan bli blokkerende CI-gate

**Issue:** [#692](https://github.com/jdlarssen/golf-app/issues/692) · P3 · infra
**Branch:** `claude/pensive-pare-154a0d`
**Type:** refactor/ci — ingen bruker-synlig endring → ingen version-bump (`refactor(...)` / `ci(...)`-prefiks)

## Kontekst

CI (#673) kjører `npm run lint` med `continue-on-error: true` fordi repoet har 22
forhåndseksisterende lint-feil. Når feilene er 0 kan steget flippes til blokkerende.

`npm run lint` (= `eslint`, flat config i `eslint.config.mjs`) rapporterer faktisk
**22 errors + 24 warnings**. Issue-en enumererte bare 21 errors (20 + 1) — det finnes
en **tredje feiltype issue-en ikke nevnte**.

### Faktisk feilbilde (verifisert 2026-06-18)

| Antall | Regel | Sted |
|---|---|---|
| 20 | `@next/next/no-html-link-for-pages` | `components/ui/AppVersionFooter.tsx:12` (én bevisst `<a href="/legal/privacy">`, flat-config dupliserer regelen → 20 rapporter på samme linje) |
| 1 | `@typescript-eslint/no-require-imports` | `app/[locale]/innboks/InboxClient.test.tsx:50` (`require('react')` i vi.mock-factory) |
| 1 | `react-hooks` setState-in-effect | `app/[locale]/admin/games/new/useGameFormState.ts:507` (**ikke i issue** — #643 klubb-scope-effekt) |

24 warnings: 23× `@typescript-eslint/no-unused-vars` (~21 underscore-prefiks
`_gameId`/`_gameStatus` i leaderboard-views + 2 døde `notFound`-imports), 1× «Unused
eslint-disable directive» (løses av require-fixen).

## Beslutninger (gray-area)

- **Den 22. feilen (setState-in-effect i create-game-veiviseren):** Eier valgte
  **«Suppress + follow-up issue»** (2026-06-18). Dokumentert `eslint-disable-next-line`
  på effekt-linja + eget issue for den ordentlige derived-state-refaktoren. Holder denne
  PR-en ren lint-hygiene uten oppførsel-risiko i kjerne-flyten.
- **html-link-fix:** inline `eslint-disable-next-line` på det bevisste privacy-link-stedet
  (lokalisert + selv-dokumenterende) framfor config-override. Én kommentar dekker alle 20.
- **require-fix:** `await vi.importActual('react')` (samme mønster filen allerede bruker for
  `next/navigation`-mocken) — fjerner `require()` *og* den nå-døde `jsx-a11y`-disable-en.
- **Warnings:** ryddes til 0 — `^_`-ignore-pattern i eslint-config for underscore-props,
  slett døde imports.

## Suksesskriterier

- [x] **K1 — 0 errors:** `npm run lint` rapporterer 0 errors. (Gate krever dette.)
  → `npm run lint` exit 0; «NO PROBLEMS — clean», error|warning-count = 0.
- [x] **K2 — html-link suppressed:** AppVersionFooter har én dokumentert
  `eslint-disable-next-line @next/next/no-html-link-for-pages` ved `<a href="/legal/privacy">`;
  alle 20 rapportene borte. → `components/ui/AppVersionFooter.tsx`; lint gikk fra
  «✖ 23 (22 errors)» → «✖ 3 (2 errors)» med én disable.
- [x] **K3 — require borte:** `InboxClient.test.tsx` bruker `vi.importActual('react')`
  (ingen `require()`), og InboxClient-testen er fortsatt grønn. → 13/13 passed.
- [x] **K4 — effekt-feil suppressed + follow-up:** `useGameFormState.ts`-effekten har en
  dokumentert `eslint-disable-next-line react-hooks/set-state-in-effect` ved
  `setRegistrationMode`-kallet, med peker til #715; issue #715 opprettet (milestone
  Backlog).
- [x] **K5 — 0 warnings:** eslint-config ignorerer `^_`-prefiks (args+vars), 7 ekte døde
  vars/imports slettet, redundante disables fjernet → `npm run lint` 0 problems totalt.
- [x] **K6 — gate flippet:** `continue-on-error: true` fjernet fra lint-steget i
  `.github/workflows/ci.yml` (grep: «OK: no continue-on-error on lint»), header-/steg-
  kommentarene oppdatert.
- [x] **K7 — ingen regresjon:** `npm run typecheck` clean, `npm test` 3677 passed (287 filer).

## Gates

- `npm run lint` → **0 problems** (errors + warnings)
- `npm run typecheck` → clean
- `npm test` → grønn
- `.github/workflows/ci.yml` lest: ingen `continue-on-error` på lint-steget

## Utenfor scope

- Den ordentlige derived-state-refaktoren av `useGameFormState`-effekten (eget issue per K4).
- `--max-warnings 0` på lint-kommandoen (strengere policy enn issue-en ber om).
- Retroaktiv test-cleanup (eget epic #263).
