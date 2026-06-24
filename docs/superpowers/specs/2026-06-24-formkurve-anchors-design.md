# Formkurve-ankre: siste-20-vindu, Start/Nå/Beste-bokser, dobbel rekordmarkør

**Issue:** [#949](https://github.com/jdlarssen/golf-app/issues/949) · oppfølging av #936
**Type:** feat (user-visible) → minor bump `1.143.0` → `1.144.0`
**Status:** design godkjent av eier gjennom visuelle mockups (2026-06-24)

## Problem

Den enkle formkurven fra #936 viser retning, men ikke ankrene som gjør en trend lesbar:
*hvor startet jeg, hvor er jeg nå, hvor mye, og over hvor lang tid.* Eier ba om tall + et
fornuftig tidsvindu (Golfbox/WHS ser på siste 20).

## Godkjent design (låst)

Ett `<Card>` øverst på `/profile/historikk`:

- **Header (én linje):** «Formkurven din» til venstre (serif); høyre-justert «Siste N runder»
  + dato-spenn («5. jan – 24. jun»). Den gamle «Brutto og netto …»-undertittelen fjernes.
- **Bokser** (følger «Mine tall»-`grid-cols-3`):
  - Brutto-rad og netto-rad, hver med tre bokser: **Start / Nå / Beste**.
  - **Vertikale rad-etiketter** «Brutto»/«Netto» til venstre for hver rad (sparer høyde).
  - **Boks-ramme følger linjestilen:** brutto = heltrukken `--color-primary`-ramme,
    netto = stiplet `--color-muted`-ramme. Erstatter egen tegnforklaring.
  - **«Beste»-boksene** får en svak **gull-bakgrunnstint** (`--color-accent` lav opacity) som
    rekord-signal. ⚠️ Ikke gull *tekst* — det stryker WCAG AA på lin-bg (samme grunn som
    `/profile/statistikk` bruker tint + normal tekst). Tallet står i `--color-text`.
- **Kurven:** uendret to-linjers SVG, men **gull-ring på både beste brutto- OG beste
  netto-punkt** (symmetrisk med de to gull-boksene). Ingen tall-etikett på kurven — boksene
  bærer tallene. Ringen er dekorativ forsterkning; rekorden formidles også av «Beste»-boksen,
  så fargen er ikke eneste bærer (1.4.1).

## Beslutninger

- **Tidsvindu = siste 20** komplette 18-hulls-runder (matcher WHS/Golfbox). < 20 → vis alle;
  < 2 → ingen graf. Vi tar IKKE etter «de 8 beste» (handicap-utregning, ikke en trend).
- **«Beste» = laveste verdi innenfor vinduet** (ikke livstid), så gull-ringen alltid sitter på
  den synlige kurven. Likhet → tidligste forekomst (rekorden ble satt da).
- **Dato per runde** = `scheduled_tee_off_at ?? ended_at` (samme som lista/sorteringen).
  Dato-spennet i headeren er kort format uten år (kompakt; vinduet er nær i tid).

## Teknisk plan

### `lib/stats/scoringTrend.ts` (Type A)
- Utvid `ScoringTrendGeometry` med `bruttoBestPoint: TrendPoint` og
  `nettoBestPoint: TrendPoint | null` (koordinatene gull-ringene tegnes på). Beste = min-verdi,
  tidligste ved likhet.
- Ny ren `summarizeTrendRounds(rounds): TrendSummary` →
  `{ brutto: {start,now,best}, netto: {start,now,best} }` (netto-felt kan være `null`).
  `start` = første runde, `now` = siste, `best` = min.

### `components/stats/ScoringTrendChart.tsx` (Type C)
- Nye props: `geometry`, `summary`, `count`, `windowLabel`, `dateRangeLabel`, `heading`,
  `bruttoLabel`/`nettoLabel`, `startLabel`/`nowLabel`/`bestLabel`, `ariaLabel`.
- Rendrer hele kort-innholdet: header-rad, to boks-rader (vertikal etikett + 3 bokser, riktig
  ramme), og SVG-kurven med to gull-ringer. Null netto-verdi → «–»; ingen netto i det hele
  tatt → skjul netto-rad + netto-linje + netto-ring (som dagens `hasNetto`-gren).
- Interne hjelpere `StatBox` + `BoxRow` for å holde fila fokusert. Fortsatt statisk (ingen
  animasjon), `role="img"` + `aria-label`.

### `app/[locale]/profile/historikk/page.tsx`
- `MAX_TREND_ROUNDS = 20`. Bygg vinduet: filtrer komplett-18 + `bruttoSum != null` (nyest-
  først), ta de første 20, reverser → eldst→nyest ≤ 20, behold effektiv dato per runde.
- `buildScoringTrend(window)` + `summarizeTrendRounds(window)`; formater første/siste dato kort.
- Send props til `ScoringTrendChart`. Behold `<Card>`-wrapperen; flytt header inn i komponenten.

### i18n (`messages/no.json` + `en.json`, paritet)
- Ny `trendWindow`: `{count, plural, one {Siste runde} other {Siste # runder}}`.
- Nye `trendStart`/`trendNow`/`trendBest` («Start»/«Nå»/«Beste» · «Start»/«Now»/«Best»).
- Oppdater `trendAriaLabel` (nevn vindu). Gjenbruk `colBrutto`/`colNetto`. Fjern bruken av
  `trendSubtitle` (la nøkkelen ligge ubrukt eller slett). Kjør `humanizer` på ny norsk copy.

### Dato-format
- Kort «5. jan» (dag + kort måned, ingen ukedag, ingen år), Oslo-tz. Liten lokal Intl-helper i
  page-en (eller `lib/i18n/format.ts` hvis gjenbruk dukker opp).

### Tester
- Type A: best-punkt (min, tidligste ved likhet; netto null), `summarizeTrendRounds`
  (start/now/best for brutto+netto, netto-nuller).
- Type C: oppdater render-test → 2 polylinjer, 2 gull-ringer, boks-verdier, vertikale etiketter,
  header med vindu + datospenn, `role="img"`. Re-asserter IKKE Type A-koordinater.

### Versjon
- feat → `npm version minor` (1.144.0) + CHANGELOG-oppføring (`· #949`) per
  `docs/changelog-conventions.md`.

## Gates
- `npm run typecheck`, `npm run lint`, `npx vitest run` (endrede test-filer), `npm run build`.
- Staging: blokkert av tom staging-DB (0 ferdige spill) — verifiser komponenten i app-shellen
  (midlertidig rute, fjernes), light + dark, som i #936.

## Non-goals
- Ingen interaktivitet (tapp-for-detalj) — lista under bærer per-runde-detaljene.
- Ingen handicap-indeks-graf (eier valgte bort eget issue nå).
- Rør ikke `/profile/statistikk` (klubb-tavla) eller «Mine tall»-kortet.
