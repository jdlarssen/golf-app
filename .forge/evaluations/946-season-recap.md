# Forge-evaluering: #946 — Sesong-/års-oppsummering

**Evaluator:** skeptical fresh-context sub-agent
**Branch:** `claude/sad-shaw-43236c`
**Dato:** 2026-06-27
**Verdikt:** ACCEPT

---

## Gates (kjørt selv, Node 22)

| Gate | Kommando | Resultat |
|------|----------|----------|
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| ESLint (5 endrede filer) | `npx eslint lib/stats/achievements.ts lib/stats/seasonStats.ts components/stats/SeasonRecapPanel.tsx 'app/[locale]/profile/historikk/page.tsx' 'app/[locale]/profile/page.tsx'` | **exit 0** (ren) |
| Vitest | `npx vitest run lib/stats components/stats` | **11 filer / 100 tester passert, exit 0** |
| Full build | `npm run build` | **exit 0** |
| i18n-paritet | node-sammenligning av `season*`-nøkler | **15 = 15, perfekt match** |

---

## Per-kriterium

### K1 — delt achievements-uttrekk · PASS
- `lib/stats/achievements.ts` eksporterer alle fem påkrevde symboler:
  `HoleScore` (`:15`), `Achievements` (`:25`), `EMPTY_ACHIEVEMENTS` (`:33`),
  `parForGender` (`:42`), `countRoundAchievements` (`:95`).
- `playerStats.ts:14-19` importerer `countRoundAchievements`, `EMPTY_ACHIEVEMENTS`,
  `Achievements`, `HoleScore` fra `./achievements`; re-eksporterer typene (`:23`) for
  bakoverkompat. Ingen lokal `countTurkeys`/inline-bragd igjen — grep på
  `countTurkeys|runLength` utenfor `achievements.ts` ga **0 treff**.
- `profile/page.tsx:30` importerer `parForGender`; den lokale `function parForGender`
  som fantes på `main` (`git show main:...profile/page.tsx` → linje 45) er **slettet**.
  Grep i `profile/page.tsx` viser kun import + kallsted, ingen def.
- `playerStats.test.ts` **uendret** vs main (`git diff --stat` tomt) og passerer (exit 0)
  → atferds-bevarende refaktor bekreftet.

### K2 — `computeSeasonStats` aggregator · PASS
Lest `seasonStats.ts` + `seasonStats.test.ts` (8 tester, alle grønne):
- Bøtter per `round.year`, hopper over `year == null` (`:51`) — testet («excludes
  undatable rounds», `seasonStats.test.ts:29`).
- Snitt/beste KUN over `completeBrutto != null` (`:62`, `:74-81`) — testet at en
  inkomplett runde teller i `rounds` men ikke i snitt/beste (`:42-51`).
- `rounds` += 1 per datert runde uansett komplett-status (`:61`) — testet (`rounds=3`).
- Bragder summeres felt-for-felt (`:65-69`) — testet inkl. snowman-summering (`:67`).
- Sortert nyeste år først (`:91`) — testet `[2026,2025,2024]` (`:26`).
- Avrunding `Math.round` (`:76`) — testet `72.5 → 73`.
- Mutasjons-sikkerhet: egen test bekrefter `EMPTY_ACHIEVEMENTS` ikke muteres (`:81`).

### K3 — `SeasonRecapPanel` · PASS
- År-velger defaulter til nyeste: `useState(seasons[0]?.year ...)` (`:25-27`), og
  `selected` faller til `seasons[0]` (`:42`). Render-test asserterer 2026 `aria-selected=true`.
- Bytter innhold ved år-valg: `onClick={() => setSelectedYear(s.year)}` (`:78`); testen
  klikker 2025 og verifiserer at turkey + snowman-linje + delta forsvinner.
- **Snowman skilt fra bragd-stripa:** `BRAG_KEYS = ['holeInOne','eagle','birdie','turkey']`
  (`:13`) — snowman **ikke** med. Snowman rendres som egen muted `<p>` (`:152-157`).
  Testen asserterer `queryByText('Snowman')` er fraværende, men `/snømenn/` +
  «Dem teller vi ikke som bragder» finnes.
- «vs forrige år»-delta kun når forrige år finnes: `previous = seasons.find(s => s.year ===
  selected.year - 1) ?? null` (`:43`); delta-caption gated på `previous &&` (`:125`);
  per-tall-delta gated på begge verdier ikke-null (`:104-110`, `:115-121`). Testen
  bekrefter delta vises for 2026 (2025 finnes) og forsvinner for 2025 (2024 mangler).
- **Nøyaktig ÉN render-test** (`grep -cE '^\s*(it|test)\('` = 1) → test-disiplin (maks én
  Type-C per komponent) overholdt.

### K4 — bragder fra rå scorer, modus-/sideturnering-uavhengig · PASS
- `historikk/page.tsx:244-266` bygger `SeasonRoundInput` ved å mate
  `countRoundAchievements(holes)` der `holes` er `{holeNumber, strokes, par}` med
  `par = parForGender(holeRow, gender)`. Ingen `game_mode`-, `result_summary`- eller
  `game_side_winners`-avhengighet i bragd-stien.
- `countRoundAchievements` (`achievements.ts:95`) leser kun `strokes` vs `par`.
- `game_mode`/`mode_config` brukes kun til runde-listas format-label (`:310-315`), ikke
  til sesong-bragdene. `game_side_winners` forekommer ikke i fila.

### K5 — «Sesongen din» øverst i Statistikk-fanen · PASS
- `statsContent` (`historikk/page.tsx:271`) har `<SeasonRecapPanel seasons={seasonStats} />`
  som **første** barn (`:273`), FØR formkurve-Card (`:274`) og `CoursePerformancePanel`
  (`:291`). Stemmer med staging-skjermbildet (Sesong → Formkurve → Baner).

### K6 — copy-kvalitet + i18n-paritet · PASS
- 15 `season*`-nøkler i både `no.json` og `en.json`, perfekt match (skript-verifisert).
- Norsk copy ren for AI-tells: ingen em-dash-kjeder, ingen kalker. «Tallene dine år for
  år», «Dem teller vi ikke som bragder» — idiomatisk, sporty kompis-tone.
- Snowman rammes eksplisitt som IKKE-bragd: `seasonSnowmanCaption` = «Dem teller vi ikke
  som bragder» / «We don't count those as highlights».
- Plural-ICU korrekt: `{count, plural, one {1 snømann} other {# snømenn}}`.
- Build kompilerte uten manglende-nøkkel-feil.

### K7 — versjons-bump + CHANGELOG · PASS
- `package.json`: main 1.147.0 → HEAD **1.148.0** (minor bump for feat — korrekt).
- CHANGELOG: **nøyaktig én** Funksjon-rad lagt til, refererer #946 (grep `946` = 1),
  to-seksjons-format med `<details>`-blokk «1.148 · Din sesong i tall».
- `npm run build` exit 0.

---

## Funn

**Ingen blokkerende funn.**

Mindre, ikke-blokkerende observasjoner (ingen handling kreves):

1. **[Trivielt — kontrakt-drift, ikke kode-feil]** Kontrakten nevner nøkkelnavnene
   `seasonSnowmanLabel` og `seasonBragderLabel`; implementasjonen bruker `seasonSnowman`
   (ICU plural) + `seasonSnowmanCaption` + `seasonBrag_<key>`. Alle nødvendige nøkler
   finnes, NO/EN matcher, og rammingen er riktig. Navne-avviket er kosmetisk og bedre enn
   kontrakt-skissen (separat tall + caption + ICU plural). Ingen handling.

2. **[Out-of-scope, allerede notert i kontrakt]** «Mine tall»-kortet på `/profile`
   lumper fortsatt snowman inn under Bragder (`profile/page.tsx:463-465`). Pre-eksisterende
   inkonsistens, eksplisitt holdt utenfor scope i kontraktens «Utenfor scope». Sesong-recap
   gjør det riktig. Ingen handling her.

3. Greps etter `par_ladies` ga mange treff i `leaderboard/`- og `admin/courses/`-koden,
   men de bruker et separat `{mens, ladies, juniors}`-objektmønster (ikke en duplisert
   `parForGender`). Ikke en regresjon av DRY-uttrekket.

---

## Konklusjon

Alle syv kriterier holder mot kode + kommando-output, ikke bare mot påstander. Alle fire
selv-kjørte gater (tsc, eslint, vitest 100/100, full build) er grønne. i18n-pariteten er
verifisert programmatisk. Refaktoren er bevisbart atferds-bevarende (`playerStats.test.ts`
uendret + grønn). Staging-UI-evidensen (allerede innhentet av hovedchatten) følger logisk
av koden: 2026 med delta −23 mot 2025, 2025 med separat snømann-linje og ingen delta.

VERDICT: ACCEPT
