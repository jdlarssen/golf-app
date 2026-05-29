# Forge-kontrakt: Skins — uvunne henger-skins skjules ved tidlig spillavslutning på delt hull

**Issue:** [#303](https://github.com/jdlarssen/golf-app/issues/303)
**Branch:** `claude/optimistic-banzai-8e4c79`
**Type:** bug (display-only) · area:scoring + area:leaderboard
**Epic:** del av #270 (Skins, #275)

## Problem

`lib/scoring/modes/skins.ts:227` har:

```ts
const unwonSkins = frozen ? 0 : carriedPot;
```

`frozen` settes `true` så snart ett hull er pending (mangler score for ≥1 spiller) og stopper videre resolving. Det er riktig for de to vanlige tilfellene:

- **Komplett 18-hulls runde:** ikke frozen → henger-potten rapporteres korrekt.
- **Live runde under spilling:** pending fryser potten, den skal ikke erklæres tapt (gapet kan fylles senere).

Men under-rapporteringen slår inn når en admin **avslutter et spill tidlig** med et gap rett etter et delt hull: `frozen` er da `true`, så `unwonSkins` blir `0` og henger-banneret i `SkinsView` vises ikke — selv om skinsene faktisk er uvunne. Kontraktens (#275) edge-case-seksjon sier «Carry fra siste delte spilte hull = uvunnet».

Smalt tilfelle: krever tidlig-avsluttet spill + delt siste spilte hull + trailing uspilte hull. Kun display — spiller-totalene er alltid korrekte.

## Approach (Alt 1 — bekreftet med bruker)

Den rene scoring-modulen kjenner ikke `gameStatus`. Vi holder modulen ren og lar `SkinsView` (som allerede mottar `gameStatus`) avgjøre label.

**Beslutning 1 (API-shape):** Erstatt `SkinsResult.unwonSkins` med `SkinsResult.carriedPot` — den rå carryover-verdien som henger ved siste resolverte hull (frozen eller ikke). Ingen `frozen ? 0`-gating i modulen. Én sannhetskilde.

**Beslutning 2 (scope):** Banner-only. Trailing «Venter på score»-rader i per-hull-lista forblir uendret (eget issue hvis verdt å adressere).

### Endringer

1. **`lib/scoring/modes/types.ts`** — bytt `unwonSkins: number` → `carriedPot: number` i `SkinsResult` med oppdatert JSDoc. Oppdater forklarende kommentar-blokk (linje ~1044).
2. **`lib/scoring/modes/skins.ts`** — fjern `const unwonSkins = frozen ? 0 : carriedPot`; returnér `carriedPot` (variabelen holder allerede rå hengende pott i begge tilfeller). Oppdater header-kommentar (linje ~22) og freeze-kommentar (linje ~224).
3. **`app/games/[id]/leaderboard/SkinsView.tsx`** — `showUnwonSkins = gameStatus === 'finished' && result.carriedPot > 0`; render `result.carriedPot` i banneret. Juster sub-copy til «Siste spilte hull ble delt.» (presist for både komplett runde og tidlig avslutning). Oppdater JSDoc-referanse til `unwonSkins`.
4. **Tester** — re-point eksisterende `unwonSkins`-assertions til `carriedPot`; legg til ÉN ny scoring-test for det rapporterte tilfellet (delt hull → trailing pending → `carriedPot` reflekterer rå pott), og ÉN ny SkinsView-test (finished + carriedPot>0 frozen-scenario → banner vises).

## Gates (kjøres scoped til endringen)

```bash
npx vitest run lib/scoring/modes/skins.test.ts
npx vitest run app/games/[id]/leaderboard/SkinsView.test.tsx
npm run build   # tsc — carriedPot må treffe alle SkinsResult-konsumenter
```

## Success criteria

- [x] **C1** `SkinsResult` eksponerer `carriedPot: number` (rå hengende pott); `unwonSkins` finnes ikke lenger i typen eller modulen. Evidens: [types.ts:1086-1101](lib/scoring/modes/types.ts) `carriedPot: number`; [skins.ts:233](lib/scoring/modes/skins.ts) returnerer `carriedPot`; `grep -rn unwonSkins --include=*.ts --include=*.tsx` → «No code refs remaining».
- [x] **C2** Scoring-test: delt siste *spilte* hull etterfulgt av trailing pending-hull → `result.carriedPot` = den rå hengende potten (ikke 0). Modulen forblir ren (ingen `gameStatus`-param). Evidens: ny test «Tidlig avslutning på delt hull + trailing uspilte hull» [skins.test.ts:442-466](lib/scoring/modes/skins.test.ts) asserterer `carriedPot === 2`; `compute(ctx: ScoringContext)`-signatur uendret.
- [x] **C3** Eksisterende scoring-tester grønne med `carriedPot`-semantikk: komplett runde delt siste hull → `carriedPot > 0`; live gap → `carriedPot` = rå frosset pott; won siste hull → `carriedPot = 0`. Evidens: `npx vitest run lib/scoring/modes/skins.test.ts` → 27 passed.
- [x] **C4** `SkinsView` viser henger-banneret når `gameStatus === 'finished' && result.carriedPot > 0` — inkludert frozen-tidlig-avslutning-tilfellet. Banneret vises IKKE når `gameStatus !== 'finished'`. Evidens: [SkinsView.tsx:126-133](app/games/[id]/leaderboard/SkinsView.tsx) `showUnwonSkins = gameStatus === 'finished' && result.carriedPot > 0`.
- [x] **C5** SkinsView-test dekker frozen-finished-scenariet (banner vises) + behold eksisterende not-finished-skjult-case. Evidens: SkinsView.test.tsx sub-case 2 (finished + carriedPot=3 + trailing pending → banner «3 … ikke vunnet … Siste spilte hull ble delt») + 2b (active + carriedPot=3 → `queryByTestId('skins-unwon')` null); `npx vitest run` → 1 passed.
- [x] **C6** Alle tre gates grønne. Version-bump (patch 1.45.0 → 1.45.1) + CHANGELOG-oppføring [1.45.1]. Evidens: `npm run build` grønn; package.json `version: 1.45.1`; CHANGELOG `### [1.45.1]`.
- [x] **C7** Banner-sub-copy kjørt gjennom `humanizer`-vurdering. Evidens: banner «Siste spilte hull ble delt» ren bokmål (ingen anglisme/særskriving/em-dash); tagline strammet (fjernet doblet «vise/viser», splittet til to korte setninger).

## Edge cases / ikke-mål

- **Ikke-mål:** trailing «Venter på score»-rader når finished (banner-only scope).
- **Edge:** carriedPot > 0 kan KUN stamme fra et delt (carryover) hull — won nullstiller, pending endrer ikke. Så «Siste spilte hull ble delt» er alltid presist når banneret vises.
- **Edge:** active + komplett-men-ikke-finished runde med delt siste hull → banner skjult (gated på finished). Bevart oppførsel.
