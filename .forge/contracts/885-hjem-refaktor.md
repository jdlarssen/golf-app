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

- [ ] **C1 — Delt primitiv finnes og brukes.** `components/games/GameRowCard.tsx` eksporterer
  `GameRowCard` (+ meta-linje-helper); `renderGameCard`, `renderActiveGameCard` og `FinishedGameCard`
  rendrer alle gjennom den.
- [ ] **C2 — Liste-semantikk.** `Section` rendrer `<ul className="list-none p-0 space-y-3">` med `<li>`
  per kort; ingen tom `<li>` for false-barn.
- [ ] **C3 — Død gren borte.** `StatusPill`-prop = `Exclude<GameStatus,'finished'>`; `else`-grenen fjernet.
- [ ] **C4 — Tee-off deduplisert.** `formatTeeOffParts` i `lib/i18n/format.ts`; IIFE-en i `page.tsx`
  borte; `HomeDiscoverySection.formatTeeOffLine` bruker helperen.
- [ ] **C5 — `GameRow` modul-nivå + derivert.** Typen ligger på modul-nivå, derivert via `QueryData`;
  `.returns<GameRow[]>()` fjernet.
- [ ] **C6 — Pixel-identisk.** Hjem (Pågår nå / Mine spill / Finn turneringer / Toppliste / Avsluttede)
  + `/spill-arkiv` rendrer pixel-identisk; #878-tilstander + nudge uendret.
- [ ] **C7 — Ingen bump, ingen ny copy.** Ingen `package.json`/`CHANGELOG.md`-endring; ingen nye
  i18n-nøkler; alle commits `refactor(...)`.

## Gates

- [ ] `npx tsc --noEmit` — grønt
- [ ] `npm run lint` (scoped til endrede filer) — grønt
- [ ] `npx vitest run components/games/FinishedGameCard.test.tsx "app/[locale]/HomeDiscoverySection.test.tsx"` — grønt
- [ ] Selv-sjekk: les hver migrerte render-gren, bekreft klasse-settet matcher dagens.

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
