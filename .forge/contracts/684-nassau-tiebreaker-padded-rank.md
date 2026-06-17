# Forge-kontrakt: Nassau tiebreaker — padded seksjonrang (#684)

## Problem

Nassau-leaderboarden brukte rå `totalEffectiveStrokes` (sum av SPILTE hull) som
tiebreaker ved lik unit-stilling. En spiller som pick-uppet hull eller sluttet
halvveis fikk en lavere råsum enn en ferdigspilt runde — og ble dermed rangert
FORAN. Dette er direkte motsatt av hensikten.

**Feilsted:** `lib/scoring/modes/nassau.ts` linje 280–307 (pre-fix).
`total18Line?.totalEffectiveStrokes` akkumulerer kun for spilte hull; sort og
rank-tildeling brukte dette feltet asc.

## Suksesskriterier

- [x] Ny test med to spillere tied 0 units der én har færre hull spilt (lavere rå sum)
      asserter at den med fullstendig runde rangeres FORAN
- [x] Ny test er RØD mot original kode, GRØNN etter fix
- [x] Alle 32 eksisterende nassau-tester fortsatt grønne
- [x] `NassauUnitLine` eksponerer nytt felt `total18SectionRank` (padded rank fra
      `rankTeams` via `total18Line.rank`)
- [x] Sort og rank-tildeling i `nassau.ts` bruker `total18SectionRank` (ikke `total18EffectiveStrokes`)
- [x] `total18EffectiveStrokes` beholdes som display-felt (eksisterende UI-tester OK)
- [x] UI-testhelpere i NassauPodium.test.tsx, NassauView.test.tsx, NassauHolesView.test.tsx
      oppdatert med nytt felt

## Gate

```
npx vitest run lib/scoring/modes/nassau.test.ts   # 32/32 grønne
```

## Tilnærming

1. **TDD**: ny failing test skrives FØR kodeendring (issue #684-disiplin)
2. Legg til `total18SectionRank: number` i `NassauUnitLine` i `types.ts`
   - `total18EffectiveStrokes` beholdes (display-only, ikke tiebreaker)
3. I `nassau.ts` `playersAggregated`-byggingen:
   - `total18SectionRank = total18Line?.rank ?? 999`
4. Sort-komparatoren: `a.total18SectionRank - b.total18SectionRank`
5. Rank-tie-deteksjon: sammenlign `total18SectionRank` (ikke `total18EffectiveStrokes`)
6. UI-testhelpere: legg til `total18SectionRank`-felt (byggere/fixtures)

## Bevis fra audit

- `nassau.ts:87` `totalEffectiveStrokes` akkumulerer kun `if (gross !== null)` → rå delsum
- `nassau.ts:280` leste `total18Line?.totalEffectiveStrokes`
- `nassau.ts:300-301` sorterte asc på dette → færre hull = lavere sum = bedre rang
- `NassauSectionLine.rank` (linje 132-143) beregnes av `rankTeams` med 999-padding
  og gir korrekt relativ rangering selv ved ufullstendige runder

## Avvik

Ingen. Kontrakten samsvarer med levert implementasjon.
