# Contract: Personlig scoringstrend-graf (#936)

**Issue:** [#936](https://github.com/jdlarssen/golf-app/issues/936) — Personlig scoringstrend-graf på profilen (brutto/netto per runde)
**Type:** feat (user-visible) → minor bump `1.142.1` → `1.143.0` + CHANGELOG-oppføring i samme commit
**Effort:** M

## Problem

Spilleren ser i dag ett avrundet brutto-snitt og én beste runde («Mine tall»), men ingen
kurve — spørsmålet «blir jeg bedre eller dårligere?» kan ikke besvares uten å øyemåle hele
historikk-lista. Dataene finnes allerede (brutto + netto per ferdig runde); kun
visualiseringen mangler.

## Avvik fra issue-design (avklart med eier)

Issuet foreslår `/profile/statistikk`, men **den siden er klubb-tavla** (flest seire / mest
aktive), ikke en personlig flate. Eier valgte (2026-06-24):

1. **Plassering:** øverst på `/profile/historikk` — grafen blir en visuell oppsummering av
   runde-lista rett under, og brutto/netto-dataene ligger allerede der.
2. **Data:** to linjer (brutto + netto), **kun komplette 18-hulls-runder**
   (`holeCount === 18`) — eple-mot-eple, samme disiplin som `lib/stats/playerStats.ts`
   (ingen villedende 9-hulls-dipp).

## Teknisk plan

### Ny ren modul — `lib/stats/scoringTrend.ts` (Type A)

Ren, I/O-fri geometri-bygger. Input er allerede filtrerte/sorterte runder; output er
SVG-koordinater. Ingen DOM, ingen fetch.

```ts
export type TrendRound = { brutto: number; netto: number | null };
export type TrendPoint = { x: number; y: number };
export type ScoringTrendGeometry = {
  width: number; height: number;
  bruttoPoints: TrendPoint[];   // ett punkt per runde
  nettoPoints: TrendPoint[];    // kun runder med netto != null (hopper over hull)
  bruttoPolyline: string;       // "x,y x,y …" for <polyline points=>
  nettoPolyline: string;
  yMin: number; yMax: number;   // padded domene faktisk brukt
};
export function buildScoringTrend(
  rounds: TrendRound[],
  opts?: { width?: number; height?: number; padding?: {top:number;right:number;bottom:number;left:number} },
): ScoringTrendGeometry | null; // null hvis < 2 brutto-punkter
```

- **x:** jevnt fordelt eldst→nyest (venstre→høyre). `n===1` → senter (men returnerer null < 2).
- **y (golf-intuisjon):** høyere score = høyere på skjermen, så linja som faller = bedre.
  `mapY(v) = padTop + (yMax - v)/(yMax - yMin) * innerHeight`.
- **Domene:** min/max over ALLE plottede verdier (brutto + ikke-null netto), paddet med
  noen slag så linjene ikke ligger flush mot kanten. Flat linje (lik score) → sentrert,
  aldri divisjon på null.

### Ny presentasjons-komponent — `components/stats/ScoringTrendChart.tsx` (Type C)

Ren synkron server-komponent (ingen `'use client'`, ingen hooks, ingen async). Props inn,
SVG ut. Statisk (ingen animasjon — unngår hele prefers-reduced-motion-klassen).

- To `<polyline>`: brutto = heltrukken (`stroke: var(--color-primary)`), netto = stiplet
  (`stroke-dasharray`, `var(--color-muted)`) — fargeblind-trygt (form skiller, ikke bare farge).
- Små `<circle>`-punkter per runde.
- `role="img"` + `aria-label` (norsk sammendrag, sendt inn fra siden via `t()`).
- Legende i HTML under SVG-en (to farge-chips + «Brutto»/«Netto») — markerbar/tilgjengelig tekst.
- Palett: kun eksisterende CSS-variabler (`--color-primary`, `--color-muted`, `--color-border`).

### Endring — `app/[locale]/profile/historikk/page.tsx`

- Filtrer `gamesWithStats` til komplette 18-hulls (`holeCount === 18`), reversér til
  eldst→nyest, map til `TrendRound[]`.
- `buildScoringTrend(...)`; render `ScoringTrendChart` i et `<Card>` **øverst** (etter
  TopBar/roundCount, før lista) **kun når geometri != null** (≥ 2 komplette runder).
- Ingen nytt DB-kall — gjenbruker eksisterende `gamesWithStats`-aggregering.

### i18n — `messages/no.json` + `messages/en.json`

Nye nøkler under `profile.historikk` (begge språk, paritet):
`trendHeading`, `trendSubtitle`, `trendBrutto` (gjenbruk «Brutto»/«Gross»), `trendNetto`,
`trendAriaLabel` (ICU med antall runder + retning). Kjør `humanizer`-skill på ny norsk copy.

### Versjon + CHANGELOG

feat → `npm version minor` (1.143.0). Følg `docs/changelog-conventions.md`: åpne ny
`## 1.143.y — [tema]`-serie øverst, flytt 1.142.y-serien til riktig skuff. Kilde-tag `· #936`.

## Success Criteria

- [x] **C1.** `lib/stats/scoringTrend.ts` finnes: ren funksjon `buildScoringTrend` som
      returnerer `null` for < 2 runder og korrekt geometri ellers (x jevnt fordelt,
      y-mapping golf-riktig: lavere score → lavere på skjermen, padded domene, ingen
      div-by-zero på flat linje).
      **Bevis:** [`lib/stats/scoringTrend.ts`](lib/stats/scoringTrend.ts); 14 Type A-tester grønne.
- [x] **C2.** Type A-test `lib/stats/scoringTrend.test.ts` dekker: null < 2, punkt-antall,
      netto hopper over `null`, y-retning, domene-min/max, flat-linje-kant. Grønn.
      **Bevis:** `npx vitest run lib/stats/scoringTrend.test.ts` → 14 passed.
- [x] **C3.** `components/stats/ScoringTrendChart.tsx` rendrer to polylinjer + legende +
      `role="img"`/`aria-label`; bruker kun palett-variabler; statisk (ingen animasjon).
      **Bevis:** komponenten + live-render (preview): `role=img` aria-label, 2 polyline, 16 circle,
      legende «BruttoNetto»; `--color-primary`/`--color-muted` (ingen hardkodet farge).
- [x] **C4.** Én Type C-render-test (`ScoringTrendChart.test.tsx`) bekrefter 2 polylinjer +
      `role="img"` + legende. Re-asserter IKKE tall fra Type A. Grønn.
      **Bevis:** 2 render-tester grønne (med-netto + uten-netto branch).
- [x] **C5.** `/profile/historikk` viser grafen øverst KUN når ≥ 2 komplette 18-hulls-runder
      finnes; 0–1 runder → ingen graf, lista uendret.
      **Bevis:** `{trend && (…)}`-guard + `buildScoringTrend`→`null` unit-dekket.
      ⚠️ **Caveat:** staging har 0 ferdige spill akkurat nå, så den EKTE historikk-siden kunne
      ikke rendres med ekte data. Verifisert i stedet ved å rendre den ekte `ScoringTrendChart`
      i den ekte app-shellen (midlertidig public-rute, fjernet etterpå) — light + dark, 0 konsoll-
      feil, v1.143.0 i footer. End-to-end-data-flyt er bygg- + unit-bevist.
- [x] **C6.** Grafen mikser ikke 9-hulls/ufullstendige runder inn (kun `holeCount === 18`).
      **Bevis:** `.filter((g) => g.holeCount === COMPLETE_ROUND_HOLES && g.bruttoSum != null)`.
- [x] **C7.** i18n-nøkler finnes i både `no.json` og `en.json` (paritet); ingen
      `MISSING_MESSAGE` i dev-overlay på siden.
      **Bevis:** JSON parser OK; live-render viste korrekte norske strenger; `npm run build` grønn.
- [x] **C8.** `package.json` bumpet til 1.143.0 + CHANGELOG-oppføring (`· #936`) i samme commit.
      **Bevis:** commit `58d82056`; footer viste `v1.143.0` live.

## Gates

- `npm run typecheck` (tsc --noEmit) — grønn, ingen nye feil.
- `npm run lint` — grønn på endrede filer.
- `npx vitest run lib/stats/scoringTrend.test.ts components/stats/ScoringTrendChart.test.tsx`
  — grønn.
- `npm run build` — grønn (fanger exhaustive-switch/Record-drift, jf. memory-felle).
- **Staging-verifisering (user-visible):** boot `torny-staging`, logg inn som spiller med
  ≥ 2 komplette 18-hulls-runder, åpne `/profile/historikk`, bekreft grafen rendres øverst med
  to linjer; sjekk 0-prod-writes. Skjermbilde som bevis.

## Non-goals (ikke gold-plate)

- Ingen akse-tall/gridlines/tooltips utover legende + aria-label.
- Ingen tidsfilter/zoom/«siste N runder»-velger.
- Ingen ny datafangst eller cache-lag.
- Rør ikke `/profile/statistikk` (klubb-tavla) eller «Mine tall»-kortet.
