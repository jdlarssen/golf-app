# Forge-kontrakt: #946 — Sesong-/års-oppsummering

**Issue:** [#946](https://github.com/jdlarssen/golf-app/issues/946) — Sesong-/års-oppsummering på «Mine tall» (runder, snitt, beste per sesong)
**Milestone:** Runde 1 — Nå (quick wins + stats-momentum)
**Branch:** `claude/sad-shaw-43236c`
**Type:** `feat` (bruker-synlig) → minor version bump + CHANGELOG Funksjon-rad

---

## Bakgrunn

Spilleren har bare livstidstall i dag. 40 runder denne sesongen ser likt ut som 40
runder over fem år. Issuet vil ha en «din 2026-sesong»-recap: runder i år, snitt,
lavrunde, bragder, sammenlignet med i fjor.

Personlig statistikk lever på **`/profile/historikk`** (stats-huben med
Statistikk/Runder-fane, #940), IKKE på «Mine tall»-kortet på `/profile`. Issue-tittelen
sier «på «Mine tall»», men det er stale ordlyd fra gap-analysen (2026-06-24, før #940
sementerte IA-en). Per IA-beslutningen i #936/#940 vokser personlige stats-seksjoner på
**Statistikk-fanen** — der formkurven (#936) og per-bane-panelet (#940) allerede bor.

## Beslutninger (fra gray-area-diskusjon)

1. **Sesong = kalenderår, Oslo-tid.** Bøtte på `osloParts(effektivDato).year`. Matcher
   «din 2026-sesong», entydig, gjenbruker eksisterende Oslo-tz-helper. Effektiv dato =
   `scheduled_tee_off_at ?? ended_at` (samme fallback som rundelista/sorteringen).
2. **År-velger + delta.** Piller/segmenter for hvert år spilleren har runder; valgt år
   viser recap + en «vs {forrige år}»-sammenligning der forrige år finnes. Default =
   seneste år. Matcher issuets «år-velgende vindu».
3. **Full bragd-rad, men snowman skilt ut.** Recap viser Runder, Snitt, Beste, og en
   bragd-stripe. **Bragder = hole-in-one, eagle, birdie, turkey** (positive). **Snowman
   er IKKE en bragd** — vises separat med nøytral/selvironisk ramme (sporty kompis-tone),
   aldri under «Bragder». (Det eksisterende «Mine tall»-kortet lumper feilaktig snowman
   inn under Bragder — pre-eksisterende inkonsistens, ut av scope her, noteres som mulig
   oppfølging.)
4. **Bragder regnes fra rå scorer, uavhengig av sideturnering.** birdie/eagle/HIO/turkey
   utledes av `scores.strokes` vs kjønns-par per hull — aldri gated på `game_mode` eller
   `game_side_winners` (LD/CTP). Dette er allerede hvordan `playerStats` fungerer.
5. **Plassering:** ny «Sesong»-seksjon **øverst** i Statistikk-fanen (over formkurven),
   som «din {år}-sesong»-overskriften.

## Disiplin (arvet fra #865/#936/#940)

- **Ren brutto.** Handicap-uavhengig, universelt trygt for alle 22 modi. Netto er ikke
  med i recap-en.
- **Snitt + beste KUN over komplette 18-hulls-runder** (nøyaktig 18 ikke-null slag) —
  eple-mot-eple. 9-hulls/ufullstendige runder gir `completeBrutto = null`.
- **Runder teller alle ferdige spill** i året (paritet med historikk-tellingen), også
  uten registrerte scorer.
- **Bragder teller over alle spilte hull** i året.
- Aggregatorer er **rene og I/O-frie** (Type A, jf. `lib/scoring/AGENTS.md`); kallstedet
  velger kjønns-par + Oslo-år før det sender inn.

---

## Arkitektur

### 1. `lib/stats/achievements.ts` (ny — delt, DRY-uttrekk)

Trekker ut den delte bragd-/par-logikken slik at både `playerStats`, `seasonStats` og
historikk-siden bruker ÉN kilde (i dag er `parForGender` en lokal kopi i
`app/[locale]/profile/page.tsx`, og bragd-tellingen er inline i `playerStats`):

- `export type HoleScore = { holeNumber; strokes: number | null; par }` (flyttet fra playerStats)
- `export type Achievements = { holeInOne; eagle; birdie; turkey; snowman }` (flyttet fra playerStats)
- `export const EMPTY_ACHIEVEMENTS: Achievements`
- `export function countRoundAchievements(holes: HoleScore[]): Achievements` — bragder for
  én runde, inkl. ikke-overlappende turkey-vinduer (flyttet fra `playerStats.countTurkeys`
  + inline-tellingen). Snowman (8 slag) telles her, men forblir et eget felt.
- `export function parForGender(hole: CourseHoleRow, gender: ScoringGender | null): number`
  (flyttet fra den lokale kopien i `profile/page.tsx`).

`playerStats.ts` importerer disse og beholder `RoundInput`, `MyStats`,
`completeRoundTotal`, `computePlayerStats` — **atferds-bevarende refaktor**, dekket av
eksisterende `playerStats.test.ts`. `profile/page.tsx` importerer `parForGender` (sletter
den lokale kopien).

### 2. `lib/stats/seasonStats.ts` (ny — Type A aggregator)

```ts
export type SeasonRoundInput = {
  year: number | null;            // Oslo-kalenderår; null ⇒ udaterbar runde (ekskluderes)
  completeBrutto: number | null;  // total brutto for komplett 18-hulls-runde, ellers null
  achievements: Achievements;     // per-runde bragder fra rå scorer
};

export type SeasonSummary = {
  year: number;
  rounds: number;                 // alle daterte ferdige runder i året
  grossAverage: number | null;    // snitt brutto over komplette 18-runder, avrundet
  bestRound: number | null;       // laveste brutto over komplette 18-runder
  achievements: Achievements;     // summert over året
};

export function computeSeasonStats(rounds: SeasonRoundInput[]): SeasonSummary[];
// Bøtter per år, summerer, sorterer NYESTE år først. Udaterbare (year==null) hoppes over.
```

### 3. `components/stats/SeasonRecapPanel.tsx` (ny — `'use client'`)

Year-velger trenger klient-state (første klient-state-bit i stats-huben; formkurve +
per-bane er server-noder). Rent presentasjonelt: tar `seasons: SeasonSummary[]` (nyeste
først) + i18n-strenger som props (samme mønster som `CoursePerformancePanel`).

- **År-piller:** segmentert kontroll av tilgjengelige år; default = `seasons[0].year`.
- **Recap for valgt år:** 3 StatTiles (Runder / Snitt / Beste) — speiler «Mine tall»-stilen.
- **Bragd-stripe:** HIO/eagle/birdie/turkey som piller, kun de med count > 0 (samme
  pill-stil som «Mine tall»). Snowman EKSKLUDERT herfra.
- **Snowman separat:** egen nøytral/selvironisk linje under bragd-stripa, kun når > 0.
  Tydelig ikke en bragd (muted styling).
- **Delta vs forrige år:** når `seasons` inneholder `valgtÅr − 1`, vis en liten «vs {år}»-
  caption med nøytral fortegns-delta per tall (ingen grønn/rød — «lavere er bedre» for
  score men «høyere er bedre» for runder/bragder, så fargedom utelates i v1).
- **Tom:** når `seasons` er tom (kun udaterte runder — svært sjeldent siden fanen bare
  rendres ved finishedCount > 0), vis muted tom-melding.

### 4. `app/[locale]/profile/historikk/page.tsx` (utvidet datalag + wiring)

Historikk-siden henter i dag `scores(game_id, strokes)` — **ingen par/hull-nr/kjønn**, så
den kan ikke regne bragder. Utvid (speiler `getMyStats`-mønsteret i `profile/page.tsx`):

- Legg `tee_gender` til `game_players`-select-en.
- Legg `hole_number` til `scores`-select-en.
- Ny parallell round-trip: `course_holes` (`COURSE_HOLES_SELECT` fra
  `lib/supabase/queryFragments.ts`) for de involverte banene.
- Bygg per-runde `SeasonRoundInput`: `year = osloParts(effektivDato).year` (eller `null`),
  `completeBrutto` (gjenbruk komplett-18-logikken), `achievements =
  countRoundAchievements(holesMedKjønnsPar)`.
- `computeSeasonStats(...)` → render `<SeasonRecapPanel>` øverst i `statsContent`.

### 5. i18n (`messages/no.json` + `messages/en.json`)

Nye nøkler under `profile.historikk`: `seasonHeading`, `seasonSubtitle`,
`seasonColRounds`, `seasonColAvg`, `seasonColBest`, `seasonBragderLabel`,
`seasonSnowmanLabel`, `seasonVsPrevious`, `seasonEmpty`, `seasonYearAriaLabel`. Bragd-navn
(holeInOne/eagle/birdie/turkey) gjenbrukes/dupliseres fra `profile.myStats`-stilen.
Norsk copy kjøres gjennom `humanizer:humanizer`; engelsk via `no-nb`/oversettelse.

---

## Suksesskriterier

- [x] **K1.** `lib/stats/achievements.ts` finnes med `countRoundAchievements` + `parForGender`
      + `Achievements`/`HoleScore`/`EMPTY_ACHIEVEMENTS`. `playerStats.ts` og
      `profile/page.tsx` importerer derfra (ingen duplisert `parForGender`/bragd-logikk).
      *Evidens: `lib/stats/achievements.ts:43,98`; `playerStats.ts:14-20` re-eksporterer;
      `profile/page.tsx` importerer `parForGender` (lokal kopi slettet); 42 tester grønne
      (achievements.test + uendret playerStats.test). Commit 301e0cc8.*
- [x] **K2.** `lib/stats/seasonStats.ts` med `computeSeasonStats` bøtter per Oslo-år,
      snitt/beste kun over komplette 18-runder, runder teller alle daterte, bragder
      summeres, sortert nyeste år først, udaterte ekskludert.
      *Evidens: `seasonStats.ts:48`; `seasonStats.test.ts` 8/8 grønne. Commit 3711d292.*
- [x] **K3.** `SeasonRecapPanel` rendrer år-velger (default seneste år), bytter innhold
      ved år-valg, viser snowman SEPARAT fra bragd-stripa, og «vs forrige år»-delta når
      forrige år finnes. *Evidens: `SeasonRecapPanel.tsx`; render-test 1/1 grønn;
      staging-skjermbilde 2026 (delta −23) + 2025 (snowman-linje «1 snømann · Dem teller vi
      ikke som bragder» separat, ingen delta). Commit a89f43ad.*
- [x] **K4.** Bragder utledes fra rå scorer uavhengig av modus/sideturnering (samme tall
      som «Mine tall» livstid, men per år). *Evidens: historikk-siden mater
      `countRoundAchievements(holesMedKjønnsPar)` fra `scores.strokes`; staging viste
      Eagle/Birdie/Turkey regnet fra seedede rå slag, ingen sideturnering involvert.*
- [x] **K5.** «Sesong»-seksjonen vises øverst i Statistikk-fanen på `/profile/historikk`,
      under formkurven og per-bane. *Evidens: staging-skjermbilde — «Sesongen din» øverst,
      «Formkurven din» + «Baner» under. 0 console-errors.*
- [x] **K6.** Norsk copy er humanisert; engelsk finnes for alle nye nøkler; ingen
      manglende-nøkkel-advarsler. *Evidens: humanizer-skill kjørt (copy ren); no/en har 15
      season-nøkler hver (MATCH).*
- [x] **K7.** Version bump (minor) + én CHANGELOG Funksjon-rad. *Evidens: 1.147.0 → 1.148.0;
      CHANGELOG «1.148 · Din sesong i tall»; `npm run build` exit 0. Commit a89f43ad.*

## Gates (kjøres scoped til endring etter hver chunk)

1. `npx tsc --noEmit` — grønn (full `npm run build` ved sluttverifisering).
2. `npm run lint` — grønn.
3. `npx vitest run lib/stats components/stats` — alle grønne (inkl. uendret
   `playerStats.test.ts`, `courseStats.test.ts`, `scoringTrend.test.ts`,
   `HistorikkTabs.test.ts`).
4. `humanizer:humanizer` på ny norsk copy før feat-commit.
5. Staging-klikkrunde av `/profile/historikk` → Statistikk-fanen før merge (bruker-synlig).

## Test-plan (per test-disiplin)

- **Type A:** `lib/stats/achievements.test.ts` (countRoundAchievements: birdie/eagle/HIO/
  turkey-vinduer/snowman, uspilt bryter rekke; parForGender per kjønn + fallback) +
  `lib/stats/seasonStats.test.ts` (bøtting, komplett-18-snitt/beste, runde-telling,
  bragd-sum, sortering, null-år-eksklusjon, tom input).
- **Type C:** ÉN `components/stats/SeasonRecapPanel.test.tsx` — struktur + interaksjon
  (år-pille-bytte, snowman skilt fra bragder, delta-caption). Re-asserter IKKE
  aggregerings-tall fra Type A.
- `playerStats.test.ts` forblir grønn (refaktor atferds-bevarende). Ingen «mens jeg var
  her»-tester.

## Utenfor scope (mulige oppfølginger)

- Snowman feil-lumpet under «Bragder» på `/profile`-«Mine tall»-kortet (pre-eksisterende;
  egen issue hvis ønsket).
- Netto sesong-tall (brutto-only her, samme som resten av huben).
- Golfsesong-vindu (apr–okt) i stedet for kalenderår (forkastet i diskusjon).
- Achievement-vegg / unlock-moment (#947, Runde 2).
