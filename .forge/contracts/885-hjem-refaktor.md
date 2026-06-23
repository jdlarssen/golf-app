# Spec: #885 — Hjem-refaktor: delt kort-primitiv + liste-semantikk + kode-hygiene

Worktree: `.claude/worktrees/keen-goldwasser-997048` · Branch: `claude/keen-goldwasser-997048`
Issue: https://github.com/jdlarssen/golf-app/issues/885

> Kontrakt opprinnelig skrevet på `claude/competent-sutherland-376a7e` (postet som issue-kommentar),
> men ingen implementasjon ble gjort der (0 commits ahead). Denne fila er arbeids-kopien for
> `/forge:auto`-løkken på `keen-goldwasser-997048`.

## Problem

Hjem (`app/[locale]/page.tsx`) rendrer «et spill du kan åpne» med to nær-identiske, copy-pastede
kort-implementasjoner (`renderGameCard` for «Mine spill», `renderActiveGameCard` for «Pågår nå»), og
`FinishedGameCard.tsx` er en tredje kopi av nøyaktig samme tetthet. Tre kopier av samme visuelle
kontrakt = de kan drifte fra hverandre. Pluss fire hygiene-funn: kort-stablene mangler liste-
semantikk (a11y), `StatusPill` har en uoppnåelig `finished`-gren, en inline tee-off-IIFE duplikerer
en navngitt helper, og `GameRow`-typen speiler select-stringen manuelt (AGENTS.md trap #1).

Ren opprydding — ingen oppførselsendring, ingen versjon-bump, `refactor(...)`-prefiks. Hjem skal se
pixel-identisk ut etterpå (klasse-SETT bevares; klasse-rekkefølge er rekkefølge-uavhengig i Tailwind).

## Eierbeslutning (2026-06-22)

Valgt: byte-/pixel-identisk, hold discovery (`HomeDiscoverySection`) utenfor primitiven (eget CTA-
footer-interaksjonsmønster, har allerede korrekt `<ul>/<li>`-a11y). Den delte primitiven dekker de
rad-formede lenke-kortene: «Pågår nå» + «Mine spill» + `FinishedGameCard`.

## Success Criteria

- [x] **C1 — Delt primitiv finnes og brukes.** `components/games/GameRowCard.tsx:24` eksporterer
  `GameRowCard` + `GameRowMetaLine`; `renderGameCard` (`page.tsx`), `renderActiveGameCard` og
  `FinishedGameCard.tsx:35` rendrer alle gjennom den. Ingen gjenværende inline Card+p-5-rad-markup.
- [x] **C2 — Liste-semantikk.** `Section` (`page.tsx`) rendrer `<ul className="list-none p-0
  space-y-3">` med `<li>` per kort via `Children.toArray` (stripper falsy → ingen tom `<li>`).
- [x] **C3 — Død gren borte.** `StatusPill`-prop = `Exclude<GameStatus,'finished'>`; `bg-border/40`-
  else-grenen fjernet (3 reachable states beholder eksakte klasser).
- [x] **C4 — Tee-off deduplisert.** `formatTeeOffParts` i `lib/i18n/format.ts`; `grep "(() =>"` i
  page.tsx = tom; `HomeDiscoverySection.formatTeeOffLine` bruker helperen.
- [x] **C5 — `GameRow` modul-nivå + derivert.** `page.tsx:131 type GameRow =
  QueryData<ReturnType<typeof activeGamesQuery>>[number]`; `.returns<GameRow[]>()` fjernet.
- [x] **C6 — Pixel-identisk.** Klasse-sett-ekvivalens-gjennomgang (OLD origin/main vs NEW): alle tre
  kort har identiske klasse-SETT + identisk DOM-struktur; kun klasse-rekkefølge normalisert i 2
  punkter (tee-off tabular-linje, FinishedGameCard Card — Tailwind rekkefølge-uavhengig) + Preflight-
  nøytrale `ul`/`li`-wrappere. Badge-spennet byte-identisk. #878-states + nudge uendret.
- [x] **C7 — Ingen bump, ingen ny copy.** `git diff origin/main...HEAD --name-only` = kun de 6 filene;
  ingen `package.json`/`CHANGELOG.md`/`messages/`; alle 5 commits `refactor(...)`.

## Gates

- [x] `npx tsc --noEmit` — grønt (post-rebase)
- [x] `npm run lint` (endrede filer) — grønt (kun pre-eksisterende HomeBody-complexity-26-WARNING fra
  origin/main, ikke introdusert; warnings feiler ikke `eslint`-scriptet)
- [x] `npx vitest run components/games/FinishedGameCard.test.tsx "app/[locale]/HomeDiscoverySection.test.tsx"` — 4 passed
- [x] Selv-sjekk: klasse-sett-ekvivalens verifisert per kort (se C6).

## Build Order (atomiske commits, alle `refactor(...)`)

1. `refactor`: `formatTeeOffParts`-helper + bruk i `HomeDiscoverySection` (punkt 4, helper + discovery).
2. `refactor`: modul-nivå `GameRow` via QueryData, dropp `.returns<>()`, bro `game_mode`-casten (punkt 5).
3. `refactor`: snevre `StatusPill`, fjern død gren, bro `status`-typen ved `activeGames`-mapping (punkt 3).
4. `refactor`: trekk ut `GameRowCard`+meta-helper; migrer de tre konsumentene + kill page.tsx-IIFE (punkt 1 + 4-rest).
5. `refactor`: `Section` → `ul`/`li` liste-semantikk (punkt 2).

## Out of Scope

- Discovery-kortenes visuelle look (kun punkt-4-helperbruk).
- `/spill-arkiv`-layout utover at `FinishedGameCard` rendrer identisk.
- i18n-katalog / versjon-bump / CHANGELOG. Scoring, RLS, auth, Dexie/sync, empty-state-hero.
