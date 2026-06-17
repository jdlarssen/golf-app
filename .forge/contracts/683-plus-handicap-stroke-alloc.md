# Kontrakt: Plus-handicap slagfordeling forbi +18 — #683

## Kontekst

`strokesForHole(courseHandicap, strokeIndex)` i `lib/scoring/strokeAllocation.ts` har en feil i grenen for plus-spillere (negativt `courseHandicap`). Den positive grenen (handicap > 0) bruker korrekt multi-runde distribusjon via `Math.floor(ch/18)` + `remainder`-logikk — for eksempel gir HCP 31 to slag på de 13 vanskeligste og ett slag på de resterende 5. Plus-grenen mangler den symmetriske logikken: den beregner bare én runde (maksimalt -1 per hull) og capper dermed på -18. Et pluss-handicap på -20 bør gi -1 på alle 18 hull OG ytterligere -1 på de to vanskeligste (SI 17 og 18) = -20 totalt; i stedet returnerer den -18.

**Berørt fil:** `lib/scoring/strokeAllocation.ts`, linje 14-17.

**Funnkilde:** Multi-agent kodeaudit 2026-06-17, adversarielt re-verifisert.

**Alvor:** P3 — påvirker bare pluss-spillere med HCP < -18, praktisk talt ingen i breddegolf, men matematikken er beviselig feil og utestet.

## Suksess-kriterier

- [ ] `strokesForHole(-18, si)` returnerer -1 for alle si 1..18, 0 ellers — uendret fra dagens kode
- [ ] `strokesForHole(-19, si)` returnerer -2 for SI 18, -1 for SI 1..17 (sum = -19)
- [ ] `strokesForHole(-20, si)` returnerer -2 for SI 17 og 18, -1 for SI 1..16 (sum = -20)
- [ ] `strokesForHole(-24, si)` returnerer -2 for SI 13..18 (dvs. de 6 letteste — plus-handicap gir slag tilbake fra letteste hull), -1 for SI 1..12 (sum = -24)
- [ ] `strokesForHole(-36, si)` returnerer -2 for alle SI 1..18 (sum = -36)
- [ ] `allStrokeAllocations(-20)` summer til -20
- [ ] `allStrokeAllocations(-36)` summer til -36
- [ ] Alle eksisterende positive-HCP-tester er fortsatt grønne (HCP 6, 18, 31)
- [ ] `strokesForHole(-1, ...)` og `strokesForHole(-2, ...)` er uendret grønne
- [ ] `npx tsc --noEmit` passerer uten nye feil
- [ ] `npx vitest run lib/scoring/strokeAllocation.test.ts` — alle tester grønne

## Gates

1. `npx vitest run lib/scoring/strokeAllocation.test.ts` — alle grønne
2. `npx tsc --noEmit` — ingen nye TypeScript-feil

## Tilnærming

Mirror the positive-branch pattern for the plus side:

```typescript
// Plus golfer: give back strokes from highest SI down.
const abs = Math.abs(courseHandicap);
const base = Math.floor(abs / 18);
const remainder = abs % 18;
const extra = remainder > 0 && strokeIndex >= (18 - remainder + 1) ? 1 : 0;
return -(base + extra);
```

For -20: `abs=20`, `base=1`, `remainder=2`, threshold=`18-2+1=17`. SI>=17 (dvs. SI 17 og 18) gir `-(1+1) = -2`; resten gir `-(1+0) = -1`. Sum = 16×(-1) + 2×(-2) = -20. Korrekt.

TDD-rekkefølge: skriv `.it.each`-test for -18/-19/-20/-24/-36 → rød → implementer fix → grønn.
