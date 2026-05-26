# Evaluation: #240 — Per-kjønn-overstyring av hull-par

**Verdict:** ACCEPT

## Kriterier

### 1. DB-migrasjon kjørt
- [x] Verified by Supabase MCP:
  - `list_migrations`: `20260526094252 course_holes_per_gender_par` er applied.
  - `execute_sql` mot `information_schema.columns`: `course_holes` har nå `course_id, hole_number, stroke_index, par_mens, par_ladies, par_juniors` (alle NOT NULL, integer). Gammel `par`-kolonne er borte.
  - Migration-filen `supabase/migrations/0039_course_holes_per_gender_par.sql` matcher kontraktens design (add → backfill → NOT NULL → drop par + comments).

### 2. Types regenerert
- [x] `lib/database.types.ts:155-176` har `par_mens`, `par_ladies`, `par_juniors` på `course_holes` Row, Insert og Update.
- [x] Ingen `par: number`-felt på `course_holes` i database.types.ts (`grep -n "^[[:space:]]*par:[[:space:]]*number" lib/database.types.ts` → tomt).

### 3. ScoringHole + parFor
- [x] `lib/scoring/modes/parResolver.ts` definerer `parFor(hole, gender)` med fallback til `hole.par` når `parByGender` er undefined.
- [x] `lib/scoring/modes/types.ts` har `ScoringGender = 'mens' | 'ladies' | 'juniors'` (linje 71), `ScoringHole.parByGender?` (linje 92), `ScoringPlayer.teeGender?` (linje 113), og `MatchplayHoleRow.side{1,2}Par` (linje 288).

### 4. Nye scoring-tester skrevet og grønne
- [x] Alle 4 modi har `describe('compute — per-gender par (#240)')`-blokker:
  - `stableford.test.ts:690` — solo (herre vs dame får ulike poeng på samme gross), lag (team-rep par), backward compat.
  - `bestBallNetto.test.ts:85` — per-spiller par + fallback.
  - `singlesMatchplay.test.ts:393` — `side1Par`/`side2Par`, fallback, sides-tuple bærer teeGender.
  - `texasScramble.test.ts:564` — kapteinens teeGender styrer lag-par (herre-kaptein og dame-kaptein), fallback.
- [x] `npm test -- lib/scoring/modes/` → **112/112 tests pass**.
- [x] `npm test -- lib/scoring/` → **320/320 tests pass** (ingen regresjon).

### 5. Alle 4 scoring-modi oppdatert
- [x] `lib/scoring/modes/{stableford,bestBallNetto,singlesMatchplay,texasScramble}.ts` importerer alle `parFor` og bruker det for hull-par-resolusjon. Gjenværende `hole.par`-bruk er bare i tomme-lag-fallback (`teamPar = members.length === 0 ? hole.par : parFor(hole, members[0].teeGender)`) som er korrekt defensiv.

### 6. Mapper-laget oppdatert
- [x] Alle 14 `course_holes`-SELECTs i app/ + lib/ er oppdatert til `'hole_number, par_mens, par_ladies, par_juniors, stroke_index'` (verifisert via `grep -A2 "from('course_holes')"`):
  - `app/admin/courses/[id]/edit/page.tsx`, `app/profile/statistikk/page.tsx`, `app/games/[id]/{submit,leaderboard,leaderboard/holes,leaderboard/export,holes/[holeNumber],scorecard,approve}/...`, `lib/mail/gameFinishedRecipients.ts` (×4 blokker).
  - `app/admin/courses/{new,[id]/edit}/actions.ts` insert-blokkene fyller per-kjønn-kolonner.
- [x] `grep -rn "parByGender:" app/ lib/` finner 20+ map-sites som fyller parByGender.
- [x] `grep -rn "teeGender:" app/ lib/` finner 12+ mapper-sites som setter teeGender fra `p.tee_gender` (`profile/statistikk`, `leaderboard/holes`, `leaderboard/export`, `leaderboard/page.tsx` ×5, `mail/gameFinishedRecipients.ts` ×4).
- [x] `grep -rn "'hole_number, par,'" app/ lib/` → tomt (gamle SELECT-strenger borte).

### 7. CourseForm utvidet
- [x] `app/admin/courses/CourseForm.tsx`:
  - `expandedLadiesPar`/`expandedJuniorsPar` state initialiseres via `hasGenderParOverride()` på edit-flyten (linje 144-152).
  - `removeGenderParOverride(gender)` tilbakestiller per-kjønn-par til `par_mens` (linje 238).
  - `GenderParOverrideSection`-komponent renderer 18 input-felt med remove-knapp (linje 607+).
  - Toggle-knapper for å legge til/fjerne dame- og junior-overstyring (linje 322-394).
- [x] `app/admin/courses/{new,[id]/edit}/actions.ts` parser `hole_${i}_par_mens/_ladies/_juniors` fra FormData.

### 8. Server-actions auto-syncer par_total_<gender>
- [x] `app/admin/courses/new/actions.ts:113-114` regner `parSumLadies` + `parSumJuniors` (egne summer per kjønn).
- [x] `app/admin/courses/new/actions.ts:175-181` setter `par_total_mens/_ladies/_juniors` til respektive summer (gated på `isCompleteRating()`).
- [x] Samme mønster i `app/admin/courses/[id]/edit/actions.ts:107-176`.

### 9. Avvik-indikator vises på 3 surfaces
- [x] `lib/games/parDisplay.ts` definerer `hasParDifference`, `formatOtherGendersPar`, `parForPlayer`.
- [x] **Scorekort:** `app/games/[id]/scorecard/page.tsx:306,475` bruker `parForPlayer(parByGender, myTeeGender)` for spillerens egen par; `ParAsideInline`-komponent (linje 667+) renderer asterisk med tooltip på linje 356 + 575.
- [x] **Hull-page:** `components/hole/HoleHero.tsx:80,94` renderer `ParAsideMarker` via `hasParDifference(parByGender)` + `formatOtherGendersPar`. HoleClient propagerer `parByGender` + `playerGender` fra page.tsx.
- [x] **Leaderboard-hull-tab:** `app/games/[id]/leaderboard/holes/page.tsx:565-574` renderer `<sup>`-asterisk med title + aria-label.

### 10. Eksisterende ~40 scoring-tester grønne
- [x] `npm test` → **1256/1256 tests pass** (106 testfiler). Ingen regresjon.

### 11. Typecheck grønn
- [x] `npx tsc --noEmit` → EXIT 0.

### 12. Lint
- [x] `npm run lint` → 5 errors + 8 warnings, alle pre-eksisterende på `main`:
  - `_formData`-warning i `app/admin/courses/[id]/edit/actions.ts:294` finnes på main (`git show main:...` bekrefter).
  - `_gameId`-warnings i 4 leaderboard-view-filer er pre-eksisterende.
  - `offline-sync.spec.ts`-`any`-errors er pre-eksisterende.
  - `vi`-warning i `GameForm.test.tsx`, `MatchplaySide`/`_gameStatus` i `MatchplayMatchView.tsx` — pre-eksisterende.
  - Ingen nye lint-issues introdusert av denne branchen.

### 13. CHANGELOG + versjon
- [x] `package.json` version 1.31.0.
- [x] `CHANGELOG.md` har ny tema-heading `## 1.31.y — Per-kjønn-overstyring av hull-par` (åpen, øverst).
- [x] `### [1.31.0] - 2026-05-26` med Jørgen-tagline (blockquote) som forklarer på vanlig norsk.
- [x] `<details><summary>Teknisk</summary>` med Added/Changed/Notes-seksjoner.
- [x] Forrige minor-serie `## 1.30.y` er wrappet i `<details>` med `<summary><strong>…</strong></summary>` (linje 50-75).

## Out-of-scope verifikasjon

- [x] **Stroke-index per kjønn:** Ikke implementert. `course_holes.stroke_index` forblir én felles kolonne. Migrasjon legger ikke til si_mens/si_ladies/si_juniors. Bekreftet.
- [x] **Texas-scramble blandet-lag:** Bruker kapteinens teeGender (lex-minste userId). Verifisert i `texasScramble.ts:111` (`parFor(hole, captainPlayer?.teeGender)`) og bekreftet med dedikert test (`texasScramble.test.ts:588` «hull-rad-par bytter når kapteinen er dame»).
- [x] **Ingen alltid-på side-by-side-visning:** `formatOtherGendersPar` ekskluderer spillerens egne kjønn fra tooltip-en (`parDisplay.ts:48-51`). Bare medspillere av andre kjønn vises.
- [x] **Historisk frozen state ikke utvidet:** `game_players` og `scores` har ikke nye snapshot-kolonner for par. Konsekvens (par-endring kan endre ferdige-spill-output) er nevnt i CHANGELOG Notes.

## Bug-hunt funn

Disse er IKKE i contract success criteria — flagget som potensielle oppfølginger, ikke blokkerende:

1. **`app/games/[id]/submit/page.tsx:230` bruker `par: h.par_mens`** uavhengig av spillerens `me.tee_gender`. Submit er "DITT KORT"-preview før innlevering. En dame-spiller med par_ladies=5 på et avvikshull vil her se "Par 4" (herre-par) og hennes 5-strokes vil ScoreShape-rendre som bogey istedenfor par. `me.tee_gender` er allerede tilgjengelig via `getGameWithPlayers`, men sendes ikke til `ReviewBody`. Anbefales oppfølgings-issue: «Avvik-indikator + parForPlayer på submit-page».

2. **`app/games/[id]/approve/page.tsx:280,287,288` bruker `h.par_mens`** uavhengig av spillerens (kortet som godkjennes) tee_gender. Admin/flight-mate som godkjenner et dame-kort på en avviksbane ser herre-par og feil bogey/par/birdie-shape. Mindre alvorlig (admin/flight-mate-internt review), men inkonsistent med kontraktens prinsipp om "spillerens egen par". Anbefalt: oppfølgings-issue.

3. **`app/games/[id]/leaderboard/holes/page.tsx:607-608` `scoreShape(pc.gross, row.par)`** bruker team-radens par (kapteinens/første medlems teeGender) til per-spiller-celle-tone. På blandet-kjønn best-ball-lag på avvikshull blir tonen feil for medspilleren som ikke er "kapteinen". `pc.par` finnes i datamodellen (`PlayerHoleCell.par` settes per spiller i `lib/leaderboard.ts:144`) men brukes ikke i shape/tone — kun til vsPar-beregning. Anbefalt: oppfølgings-issue.

4. **Tomme-lag-fallback bruker `hole.par`** (`bestBallNetto.ts:144`, `stableford.ts:239`) istedenfor `parFor(hole, undefined)` — defensiv guard mot tom medlems-array. Konsekvensløst i praksis (lag uten medlemmer eksisterer ikke i Tørny), men inkonsistent stil. Ikke et fix-issue verdt.

Alle fire er edge-cases utenfor success criteria-listen. Kontrakten gjør eksplisitt scoping til scorekort + hull-page + leaderboard (ikke submit/approve), og out-of-scope-seksjonen ekskluderer blandet-kjønn-håndtering for Texas-scramble (men ikke best-ball — strengt tatt et lite skår).

## Anbefalte forbedringer

Hovedchatten bør opprette oppfølgings-issues:
- **Submit-page avvik-indikator + parForPlayer** (#1 over) — mest synlig for spillere.
- **Approve-page avvik-indikator** (#2) — admin-side, lavere prioritet.
- **Best-ball-leaderboard per-spiller-celle bruker pc.par til scoreShape/scoreTone** (#3) — for blandet-kjønn-lag.

Ikke blokkerende — kontrakten leverte det den lovet. Oppfølgings-issues sikrer at gjenværende display-flater følger samme prinsipp.

## Sammenfatning

Implementasjonen er solid og oppfyller alle 13 success criteria med konkret evidens. DB-migrasjonen er kjørt med forced cutover som spesifisert. Alle 4 scoring-modi resolverer par per spiller via `parFor()`, med dedikerte per-gender-tester (112/112 grønne i modes/, 320/320 i scoring/). Mapper-laget er sweepet komplett (14 SELECTs, 12+ teeGender-setters). CourseForm har den ekspanderbare per-kjønn-seksjonen med auto-sync av par_total. Indikator (asterisk + tooltip) vises på alle tre kontrakts-spesifiserte surfaces. Versjon + CHANGELOG følger Tørny-disiplinen.

Tre display-edge-cases (submit-page, approve-page, best-ball-leaderboard-celle-tone) er utenfor kontraktens eksplisitte scope men bør fanges opp som oppfølgings-issues før klubb-skala-test med faktiske avviksbaner.
