# Spec: Cup MVP-kåring + «dro ned mest» på resultatsiden (#1508)

## Problem

Resultatsiden har fått per-spiller-poengregnskapet (#1497), men spillerne vil også ha
seremonitoppene: hvem var cupens MVP, og hvem «dro ned mest» (underpresterte mot eget
banehandicap)? To kåringer i kompis-tonen, på samme seremoniflate.

## Research Findings

Ingen eksterne biblioteker — alt finnes i repoet (ground-truth fra scouting i denne økten):

- `computeCupPlayerPoints` (#1497, `lib/cup/computeCupPlayerPoints.ts`) gir per-spiller-
  totaler (kamppoeng full kreditt + ctp/ld) — MVP er ren max-over-rader på tvers av begge lag.
- `strokesForHole(courseHandicap, strokeIndex)` (`lib/scoring/strokeAllocation.ts:5`) gir
  slag per hull — netto = brutto − tildelte slag; netto mot par = netto − par.
- **Personlig føring finnes kun i** `singles_matchplay`, `fourball_matchplay` og `best_ball`.
  Foursomes-familien (foursomes/greensome/chapman/gruesome) fører LAGball på kapteinens
  score-rad (`lib/scoring/modes/foursomesMatchplay.ts:3-7`) — de kan ALDRI attribuere
  individuell prestasjon og holdes utenfor.
- **Avledede kamper deler scores med host** (`source_game_id`, #1441): på splittet cup-dag
  leser back9-singles de samme radene som best_ball-hosten. Prestasjonsaggregatoren må
  telle hvert fysiske scoresett ÉN gang — hopp over spill med `source_game_id != null`.
- `getCupSnapshot` har alt internt i game-loopen (holes m/ par+SI per segment, spillere m/
  `course_handicap`, scores) men eksponerer det ikke — snapshot-typen utvides.
- Par i cup-stiene er `par_mens` (husmønster, `getCupSnapshot.ts:278` — samme som
  `buildModeResultForGame`). Beholdes her for konsistens.

## Prior Decisions

- #1497: full Ryder Cup-kreditt, vektede poeng respektert, gir utenfor spillerregnskap —
  MVP arver alt via `computeCupPlayerPoints`-radene.
- #1468: resultatsiden er låst til `status = 'finished'` — kåringene rendres kun der.
- Husmønster: rene aggregatorer i `lib/cup/` med Type A-tester (TDD); native `<details>` ved
  behov; `formatPoints` for komma-desimal; maks én Type C render-test per komponent.

## Eierbeslutninger (kontrakt-diskusjonen 2026-08-08)

1. **Poenglikhet → delt kåring.** Alle med toppverdien navngis sammen. Gjelder BEGGE
   kåringene (MVP og «dro ned mest»).
2. **«Dro ned mest» er alltid på** — ingen arrangør-bryter, ingen DB-endring. Skjules
   automatisk når ingen kvalifiserer.
3. **Kvalifisering: minst 9 personlig førte hull** totalt på tvers av cupens spill.

## Design

**To rene aggregat-funksjoner** i ny `lib/cup/computeCupAwards.ts` (Type A, TDD):

- **MVP:** tar `CupPlayerPointsResult` (#1497) → raden(e) med høyest `points` på tvers av
  begge lag. Returnerer `null` når toppsummen er 0 (ingenting å kåre — f.eks. tvangs-
  avsluttet cup uten ferdige kamper).
- **«Dro ned mest»:** tar nye prestasjons-input fra snapshotten. Per spiller: for hvert
  personlig-ført spill (host-spill med game_mode i settet over), for hvert hull i segmentet
  med registrert `strokes`: `diff += (brutto − strokesForHole(courseHandicap, SI)) − par`,
  `holes += 1`. Kvalifisert ved `holes >= 9` (konstant med ett hjem i aggregator-fila).
  Vinner = høyest diff blant kvalifiserte, delt ved likhet. Returnerer `null` når ingen
  kvalifiserer ELLER toppdiffen er ≤ 0 (alle spilte til eller bedre enn handicap — da har
  humor-kåringen ingen målskive og skjules).
- **Full `course_handicap`** fra `game_players` brukes — IKKE allowance-justert.
  Allowance er en matchplay-rettferdighetsmekanisme; prestasjon måles mot eget handicap.

**Snapshot-utvidelse** i `getCupSnapshot`: nytt felt (f.eks. `performanceInputs`) bygget i
den eksisterende game-loopen — per personlig-ført HOST-spill: holes ({number, par,
strokeIndex}, allerede segment-filtrert), spillere ({userId, courseHandicap}) og scores
({userId, holeNumber, strokes}). Ingen nye DB-lesinger.

**Visning:** ny `CupAwards.tsx` i resultater-mappen (ikke-async server-komponent, ingen
klient-JS), rendret KUN i finished-grenen — plassert etter lagtotal-seksjonen, før
«Spillerpoeng». MVP med gull-aksent (`--accent`) og Fraunces, à la GOLD_CARD_STYLE;
«dro ned mest» i nøytral, godlynt tone under. Viser navn (delte kåringer joines naturlig,
f.eks. «Per og Pål») + verdi (MVP: poeng via `formatPoints`; dro ned: «+6 mot handicap»).
i18n-nøkler i `cup.results.*` (no + en), norsk copy gjennom humanizer — negativ kåring MÅ
være godlynt, aldri hånlig. `data-testid` på begge kåringene for staging-verifisering.

## Edge Cases & Guardrails (edge-tabell, T1)

| Input-klasse | Forventet |
|---|---|
| tom (ingen personlig-førte spill, f.eks. ren greensome-cup) | «dro ned mest» = null (skjult), MVP vises fortsatt |
| MVP-toppsum 0 | MVP = null (skjult) |
| én spiller kvalifisert med diff > 0 | hen kåres alene |
| poeng-/diff-likhet på toppen | delt kåring, alle navngis, deterministisk navnerekkefølge |
| toppdiff ≤ 0 (alle slo handicapet) | «dro ned mest» = null (skjult) |
| < 9 førte hull (f.eks. trukket spiller) | ikke kvalifisert — teller ikke i kåringen |
| null-strokes-hull (plukket ball i best ball) | hullet telles ikke, verken i diff eller holes |
| host + avledet deler scores (splittet cup-dag) | scoresettet telles ÉN gang (avledede hoppes over) |
| samtidighet / tidssone | N/A — rene funksjoner over én snapshot |

- Låst side (ikke finished): ingen kåringer — låst-grenen røres ikke.
- Snapshot-utvidelsen er additiv — eksisterende felt/call-sites uendret (T2).
- Withdrawn-spillere filtreres ikke spesielt — 9-hulls-kravet håndterer dem naturlig.

## Key Decisions

- Delt kåring ved likhet (eier) — gjelder begge kåringene.
- Alltid på, data-gatet (eier) — ingen migrasjon, ingen oppsett-UI.
- Kvalifisering ≥ 9 hull (eier) — konstanten bor i aggregator-fila.
- Skjul «dro ned mest» når toppdiff ≤ 0 — humor-kåring uten målskive vises ikke.
- Full CH, ikke allowance-justert — prestasjon mot eget handicap, ikke matchplay-justering.
- `par_mens` som ellers i cup-stiene — konsistens over perfeksjon (per-kjønn-par er en
  kjent, bevisst begrensning i cup-laget).

**Claude's Discretion:** eksakt copy (humanizer), navnejoin-format for delte kåringer,
eksakt layout/typografi innenfor gull-aksent-rammen, testid-navn, intern typeform på
`performanceInputs`, filnavn/oppdeling av aggregatorene (én fil `computeCupAwards.ts`
anbefalt).

## Success Criteria

- [ ] MVP-aggregatoren kårer raden(e) med høyest poengsum på tvers av lag, delt ved likhet,
      `null` ved toppsum 0 — `npx vitest run lib/cup/computeCupAwards.test.ts` grønn med
      edge-tabellen som testcases.
- [ ] «Dro ned mest»-aggregatoren summerer netto-mot-par kun over personlig førte hull i
      host-spill (singles/fourball/best_ball), krever ≥ 9 hull, deler ved likhet, `null` ved
      ingen kvalifiserte eller toppdiff ≤ 0 — testbevis fra samme suite, inkl.
      dobbelttelling-vernet (host + avledet) og null-strokes-hopp.
- [ ] `getCupSnapshot` eksponerer prestasjons-input uten nye DB-lesinger (file:line-bevis +
      fokusert assertion i eksisterende snapshot-test).
- [ ] Resultatsiden (finished) viser MVP-kåringen med gull-aksent og «dro ned mest» under,
      begge med testid; låst side uendret (file:line + staging-bevis).
- [ ] Kåringene skjules korrekt når datagrunnlag mangler (staging- eller testbevis for
      minst ett skjule-tilfelle).
- [ ] Begge locales har nøklene; norsk copy humanizer-kjørt og godlynt.
- [ ] Maks én Type C render-test for `CupAwards`; ingen re-assertering av Type A-tall.

## Gates

- [ ] `npx vitest run lib/cup` grønn (inkl. ny awards-suite)
- [ ] `npx vitest run "app/[locale]/cup/[id]/resultater"` grønn
- [ ] `npm run build` grønn (aldri filtrer «pre-existing»)
- [ ] `npm run lint` grønn
- [ ] Staging-klikkrunde av resultatsiden (staging-verify-skill) + bevis-kommentar + label FØR merge

## Files Likely Touched

- `lib/cup/computeCupAwards.ts` + `.test.ts` — ny(e) rene aggregatorer (TDD)
- `lib/cup/getCupSnapshot.ts` (+ fokusert assertion i `.test.ts`) — `performanceInputs`
- `app/[locale]/cup/[id]/resultater/CupAwards.tsx` + én render-test — visning
- `app/[locale]/cup/[id]/resultater/page.tsx` — wiring i finished-grenen
- `messages/no.json` + `messages/en.json` — `cup.results.*`-nøkler
- `package.json`/`package-lock.json` (minor-bump) + `CHANGELOG.md` (feat-linje)

## Out of Scope

- Arrangør-bryter for «dro ned mest» (eier valgte alltid på — kan bli egen sak ved behov).
- Per-kjønn-par i cup-prestasjonsmålet (kjent begrensning, følger husmønsteret).
- Sekundærkriterier/tie-break utover delt kåring.
- «Best mot handicap»-positivkåring (naturlig søster-idé — egen sak hvis ønsket).
- Endringer i #1497-regnskapet, lagtotaler eller matchvisning.
