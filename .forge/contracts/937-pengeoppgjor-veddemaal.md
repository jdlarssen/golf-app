# 937 — Pengeoppgjør for veddemålsformatene

**Issue:** #937
**Type:** feat (bruker-synlig → version bump + CHANGELOG)
**Branch:** claude/optimistic-banzai-4d7998

## Problem

Veddemålsformatene (Skins, Wolf, Nassau, Bingo-Bango-Bongo, Acey-Deucey, Nines) scorer allerede i abstrakte «stake»-enheter med base=1, men gir aldri en kr-verdi eller et oppgjør. Hele poenget med disse formatene er pengene på spill; etter (og under) runden vil kompis-gjengen at appen sier «Per skylder Gustav 67 kr» — i stedet får de en abstrakt enhets-telling og må regne på serviett før Vipps.

## Prior decisions (fra #275-skins, #274-wolf m.fl.)

- Motorene er bevisst penge-agnostiske: `#275` la eksplisitt «kr-/penge-dimensjon» UT av scope. Dette issuet henter den inn — som et rent presentasjonslag oppå de eksisterende enhets-tellingene.
- Motorene gir per-spiller-enheter i resultatet: `SkinsPlayerLine.totalSkins`, `WolfPlayerLine.totalPoints`, `NassauUnitLine.units`, `BingoBangoBongoPlayerLine.totalPoints`, `AceyDeuceyPlayerLine.total` (kan være negativ), `NinesPlayerLine.totalPoints`.
- `mode_config` er jsonb på `games` → ny valgfri kr-verdi kan legges der UTEN migrasjon.

## Beslutninger (eier, 2026-06-24)

1. **Oppgjørsmodell = pott/«mot feltsnittet».** Netto per spiller = `(enheter − snitt) × kr`, der snitt = totale enheter / antall spillere. Tilsvarer en lik delt pott: hver skin/poeng er verdt `kr`, alle betaler likt inn, du får `kr` per enhet vunnet. Alltid balansert (sum = 0). Håndterer Wolf (kun pluss), Acey-Deucey (kan bli negativ) og uavhentet skins-pott rent (uavhentede skins senker bare snittet — ingen betaler for dem).
2. **Scope = 6 formater:** skins, wolf, nassau, bingo_bango_bongo, acey_deucey, **nines** (samme zero-sum-poeng-familie).
3. **Synlig på leaderboardet** (format-`View`), som vises både live under runden og når spillet er ferdig. IKKE på hull-skjermen (holdes ren — kun scoring) og IKKE på historikk-kort (ville krevd `result_summary`-endring → ut av scope).
4. kr-verdi settes valgfritt i wizarden per format, lagres i `mode_config`. Tomt/0 = av (ingen penge-UI). Redigerbar via spill-redigering (initialValues-prefill).
5. Beløp rundes til hele kr (Vipps-vennlig); avrundings-residual fordeles så summen forblir 0.

## Design

### 1. Ren helper — `lib/scoring/settlement.ts` (ny)

Format-agnostisk, ingen avhengighet til spesifikke motor-typer. TDD (test først).

```ts
export interface SettlementPlayerLine {
  userId: string;
  units: number;     // enheter vunnet (fra motor-resultatet)
  netKr: number;     // (units − mean) × kr, hele kr, residual-justert (sum = 0)
}
export interface SettlementPayment {
  fromUserId: string;  // skylder
  toUserId: string;    // har til gode
  kr: number;          // hele kr, > 0
}
export interface Settlement {
  krPerUnit: number;
  unitLabel: string;             // 'skin' | 'poeng' | 'seksjon' (for UI)
  perPlayer: SettlementPlayerLine[];  // sortert på netKr desc
  payments: SettlementPayment[];      // grådig min-transaksjoner (≤ N−1)
}

export function computeSettlement(input: {
  units: { userId: string; units: number }[];
  krPerUnit: number;
  unitLabel: string;
}): Settlement | null;
// → null hvis krPerUnit <= 0 eller < 2 spillere.
```

- **Netto:** raw = `(units_i − mean) × kr`; rund hver til nærmeste hele kr; fordel residual (`−sum(rundet)`) til spilleren(e) med størst |raw| så `sum(netKr) === 0`.
- **Payments (grådig):** sorter debitorer (netKr<0) og kreditorer (netKr>0); match største debitor mot største kreditor, gjør opp `min(|deb|, kred)`, gjenta. Gir ≤ N−1 betalinger.
- Determinisme: stabil sortering (sekundærnøkkel userId) så tester er drift-sikre.

### 2. `formatKr` — `lib/format/` (ny liten helper)

`formatKr(n: number): string` → `"200 kr"`, `"1 400 kr"` (mellomrom som tusenskille), negativ → `"−67 kr"` (ekte minus U+2212). Norsk konvensjon, `kr`-suffiks.

### 3. mode_config-type + validator

- `lib/scoring/modes/types.ts`: legg til valgfri `kr_per_unit?: number` på mode_config-variantene for de 6 formatene (wolf, nassau, skins, bingo_bango_bongo, acey_deucey, nines).
- `lib/games/gamePayload.ts`: les `formData.get('kr_per_unit')` i de 6 format-grenene; parse som ikke-negativt heltall; utelat fra `mode_config` hvis tom/0/ugyldig.

### 4. Wizard-wiring (6 touch-points, mønster fra `wolf_scoring`)

`lib/wizard/useGameFormState.ts` (state-decl, initialValues-prefill, payload), `components/.../GameWizard.tsx` (setup-render, hidden input), `lib/games/gamePayload.ts` (validator). Ett valgfritt tall-felt «Spille om penger? kr per {skin/poeng/seksjon}» i hvert av de 6 format-oppsettene. Tomt = av.

### 5. `<SettlementTable>` — leaderboard (ny client component)

- `app/[locale]/games/[id]/leaderboard/SettlementTable.tsx`. Props: `{ settlement: Settlement; playersById: Map<string, {displayName}> }`.
- Render: per spiller netto (+grønn / −rød, `tabular-nums`, `formatKr`) + en «Oppgjør»-liste («Per → Gustav: 67 kr»). Norsk copy (kjør humanizer på ny copy).
- Integreres i hver av de 6 format-`View`-ene (SkinsView/WolfView/NassauView/BingoBangoBongoView/AceyDeuceyView/NinesView): hver `render*`-funksjon kaller `computeSettlement(...)` fra motor-resultatet (mapper result → `{userId, units}` + `unitLabel`) når `mode_config.kr_per_unit > 0`, og sender `settlement` til `View`. Vises der View allerede viser per-spiller-totaler (samme synlighets-gate som totalene → skjult i aktiv reveal-modus, synlig live ellers + alltid ved ferdig).

### Unit-labels per format

skins→`skin`, nassau→`seksjon`, wolf/bingo_bango_bongo/acey_deucey/nines→`poeng`.

## Edge cases

- `kr_per_unit` mangler/0 → `computeSettlement` returnerer null → ingen penge-UI (uendret oppførsel).
- < 2 spillere → null.
- Alle like (likt antall enheter) → alle netto 0, tom payments-liste; vis «Ingen penger skifter hender».
- Skins med uavhentet pott → enheter summerer < 18; snittet senkes; ingen betaler for uavhentede skins.
- Acey-Deucey negativ total → `(units − mean)` håndterer det; mean kan være negativ.
- Avrunding: residual fordeles så `sum(netKr) === 0` (invariant testet).
- Reveal-modus aktiv: SettlementTable følger samme skjul-gate som View-totalene (ikke lekk stilling live i reveal-spill).

## Success criteria

- [ ] `lib/scoring/settlement.ts` finnes; `computeSettlement` er ren, returnerer null for kr≤0 / <2 spillere, og `sum(netKr) === 0` for alle gyldige input (testet).
- [ ] Pott-modellen er korrekt: 3 spillere, 200 kr/skin, enheter 2/1/4 → netto Per −67, Ola −267, Gustav +334 (residual), payments Per→Gustav 67 + Ola→Gustav 267 (testet eksakt).
- [ ] Payments er grådig min-transaksjoner, ≤ N−1, og summerer til kreditorenes total (testet).
- [ ] `formatKr` rendrer norsk (mellomrom-tusenskille, `kr`-suffiks, ekte minus) (testet).
- [ ] `kr_per_unit` er valgfritt i `mode_config` for alle 6 formater; validator parser det fra wizard-form; tomt/0 → utelatt.
- [ ] Wizarden har et valgfritt kr-felt per format med riktig enhet-label; verdien overlever lagring og spill-redigering.
- [ ] `<SettlementTable>` vises på leaderboardet (View) for alle 6 formater når `kr_per_unit > 0`, både live og ved ferdig; skjult når kr ikke satt og i aktiv reveal.
- [ ] `package.json` patch-bumpet + `CHANGELOG.md`-oppføring i feat-commit(s).

## Gates

- `source ~/.nvm/nvm.sh && nvm use 22` (Node 22 kreves).
- `npm run build` (fanger exhaustive switch / Record-map-drift fra ny mode_config-variant — ikke bare `tsc`).
- `npx vitest run lib/scoring/settlement.test.ts lib/format` + de berørte motor-/format-testene.
- `npm run lint`.

## Files likely touched

**Nye:** `lib/scoring/settlement.ts` + `.test.ts`; `lib/format/formatKr.ts` (+ test); `app/[locale]/games/[id]/leaderboard/SettlementTable.tsx`.
**Endret:** `lib/scoring/modes/types.ts` (kr_per_unit på 6 varianter); `lib/games/gamePayload.ts` (validator, 6 grener); `lib/wizard/useGameFormState.ts` + `GameWizard.tsx` (wizard touch-points); 6 format-render-funksjoner (`app/[locale]/games/[id]/leaderboard/formats/*.tsx`) + tilhørende `*View`-props; `package.json` + `CHANGELOG.md`; i18n-nøkler hvis ny UI-copy (no + en).

## Out of scope

- «Fra hver motspiller»-modell (eier valgte pott-modellen; scalar-multippel uansett).
- Settlement på historikk-kort / game-cards (krever `result_summary`-utvidelse for wolf/nassau/bbb/acey).
- Settlement på hull-skjermen (holdes ren).
- Matchplay/strokeplay/stableford (ikke veddemålsformater).
- Per-press/auto-press Nassau-utvidelser.
