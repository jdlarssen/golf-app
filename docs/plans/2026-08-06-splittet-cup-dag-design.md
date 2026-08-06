# Splittet cup-dag — design + faseplan

**Issue:** #1441 · **Branch:** `claude/golf-cup-nord-sor-8lmocp` · **Eierbestilling:** 2026-08-06

## Målbilde (brukerspråk)

**Revidert 2026-08-06 etter arrangør-oppsettet + eier-avklaringer i økta** (erstatter
opprinnelig målbilde; fourball-matchen på back 9 utgikk, bestball + vektede poeng +
manuelle sidepoeng kom inn).

Én fysisk 18-hulls-runde per flight (2 fra hvert lag) teller som fire cup-konkurranser:

| Hull | Format | Spill (6v6) | Hcp | Føring |
|---|---|---|---|---|
| 1–9 | Greensome 2v2 (spilles som Irish greensome ute) | 3 | **Manuelle lag-slag** (arrangør: 40 % av høyeste) | Lagball — paret fører, som i dag |
| 10–18 | Best ball 2v2 (netto lagtotal) | 3 | 85 % | Individuelle slag, alle fire — **host-spillet** |
| 10–18 | Singles 1v1 (2 per flight: N1vS1 + N2vS2) | 6 | 100 % (ingen justering) | **Ingen egen føring** — leser best ball-scorene |

Poeng: **vektbare cup-poeng** (denne dagen: seier 5, delt 2–2; default 1/½ som før).
Med egendefinerte vekter settes `points_to_win` til NULL («først til X» skjules; vinner
avgjøres ved avslutning). I tillegg **manuelle sidepoeng**: closest hull 4 + 11 (2 poeng),
longest hull 6 (3 poeng) — arrangør taster vinner-spiller etter runden, poenget legges på
spillerens lag i cup-totalen. Personlig cup-cap 4 → 16 matcher (ikke-admin setter opp hele
dagen selv), allowance-% justerbar i oppsettet.

## Designbeslutninger

### D1 — `games.hole_segment`

`text NOT NULL DEFAULT 'full' CHECK (hole_segment IN ('full','front9','back9'))`.
Bevisst IKKE generisk hull-range: banene i appen er alltid 18 hull, og bruksfallet er
front/back-splitt. `full` = dagens oppførsel for alt eksisterende.

### D2 — Motoren regner mot hull-i-scope, ikke hardkodet 18

Alle matchplay-computes (`singlesMatchplay`, `fourballMatchplay`, `foursomesMatchplay`
(+ greensome/chapman/gruesome som deler kjernen), `computeMatchplayRunningStatus`)
erstatter hardkodet `18` med antall hull i `ctx.holes`. Kallere sender segment-filtrerte
hull (`holesForSegment`-helper i `lib/games/` eller `lib/scoring/`). 18 hull inn = identisk
oppførsel som i dag; 9 hull inn = «AS» etter 9, mat-em «5&4», «2up» etter 9 osv.
Hull-numrene i back9-scope er 10–18 — remaining/decided regnes på antall, ikke nummer.
TDD: `lib/scoring/` krever test først (lib/scoring/AGENTS.md).

### D3 — Avledede matcher: `games.source_game_id`

`uuid NULL REFERENCES games(id)`. En avledet match (singles på back 9) har egne
`game_players` (1v1, team 1/2) men INGEN egne scores: alle lese-stier henter scores fra
`source_game_id ?? id`, filtrert på segmentets hull og matchens spillere. **Host på
back 9 er best ball-spillet** (individuell føring, 85 %); singles-matchene (100 %)
avleder fra det. Ingen score-entry-UI for avledede spill — game-home viser live
match-status + lenke til host-spillet. Offline-sync røres ikke (avledede spill skriver
aldri).

**Lifecycle:** host-spillet avsluttes (approve-flyt) → server action flipper avledede
spill til `finished` i samme operasjon (kompensert batch, `expectAffected`).
ON DELETE: host slettes → avledede slettes (CASCADE) — de er meningsløse uten kilden.

**RLS:** lesing av host-scores dekkes av eksisterende policies (singles-spillerne ER
spillere i host-spillet / cup-sider bruker admin-client). Verifiseres i F2 mot staging.
Avledede spill trenger ingen score-INSERT-policy (skriv skjer aldri).

### D4 — Cup-preset «Splittet cup-dag»

Ny preset i `cupTemplates.ts` + generering i `cupPairing.ts`/wizard: per flight genereres
en **bunt** — greensome (front9, manuelle lag-slag) + best ball (back9, 85 %, host) +
2 singles (back9, 100 %, `source` = best ball-spillet). Samme fire spillere i hele bunten
(fysisk krav). Oppstillings-editoren redigerer flight-sammensetning og singles-paringene
innen flighten. `sessionMatchCount` for bunten: `floor(teamSize/2)` flights →
`4 × flights` spill totalt. Generer-actions insert-er `hole_segment` + `source_game_id`
per match; rollback-batchen (#675-mønsteret) dekker de nye radene. Best ball krever at
`CupSessionFormat`/snapshot-en lærer et ikke-matchplay-format: bestball-konkurransen
poengsettes på netto lagtotal (lavest vinner, delt ved likhet), ikke hull-for-hull.

### D5 — Cap: `MAX_PERSONAL_CUP_MATCHES` 4 → 16

Spiller-cap 24 uendret (12 trengs for 6v6). Copy som nevner taket oppdateres (T2-sweep
på litteralen `4` i cap-lagene: limits + tester + evt. UI-copy).

### D6 — Irish greensome = variant-copy, ikke ny modus

Scoring og laghandicap er identisk med greensome (60 % laveste + 40 % høyeste CH,
allowance-% på toppen). Ingen ny `game_mode`-enum-verdi, ingen DB-endring. Varianten
synliggjøres i copy/labels der greensome velges i cup-oppsettet (helper-tekst som
forklarer Irish-mekanikken ute på banen). Full egen modus er et separat, senere issue
hvis promo-verdien tilsier det. (Med D10 er formel-poenget mindre viktig for cup-dagen —
lag-slagene settes manuelt der.)

### D7 — Allowance synlig for ikke-admin cup-skaper

Feltene finnes i tournaments-raden og oppsett-formene; F3 verifiserer at ikke-admin-stien
eksponerer dem (ikke bare hidden defaults). Per-spiller handicap-overstyring er IKKE i
scope (detaljer fra spillerne venter).

### D8 — Vektbare cup-poeng (eier-avklart i økta)

`tournaments.win_points` / `tie_points` (numeric, default 1 / 0.5 — dagens oppførsel).
`computeCupLeaderboard` bruker vektene i stedet for hardkodet 1/½. Når vektene avviker
fra default settes `points_to_win = NULL` ved start («først til X» skjules; vinner =
høyest poengsum ved `finishTournament`, som allerede takler NULL). Denne dagen: 5/2.
Merk at delt (2+2) betaler mindre enn seier (5) — derfor gir ikke «halvparten av
totalen» mening som mål.

### D9 — Manuelle sidepoeng (closest/longest) (eier-avklart i økta)

Ny tabell `tournament_side_awards`: `tournament_id` (FK CASCADE), `kind`
('ctp'|'ld'), `hole_number`, `points`, `winner_user_id` (NULL til arrangør taster
vinner etter runden). Konfigureres i cup-oppsettet (denne dagen: ctp 4 + 11 à 2 poeng,
ld 6 à 3 poeng). Vinnerens lag (fra roster) får poengene i cup-totalen. IKKE koblet til
spill-nivå-sideturneringen (#576-skjulingen står) — dette er rene cup-poeng med manuell
vinner-registrering. RLS: SELECT for authenticated; ingen write-policies — skriv går
kun via service-role i gatede server-actions (hostile-PATCH-trygt).

### D10 — Manuelle lag-slag i greensome (eier-avklart i økta)

Arrangør-formelen (40 % av høyeste spillers spillehandicap) kan ikke uttrykkes via
allowance-% på appens 60/40-formel. Løsning: `mode_config.team_strokes_override`
(`{team1: n, team2: n}`) — settes i oppsettet, motoren bruker tallene som lag-slag i
stedet for formelen når feltet finnes. Robust mot enhver framtidig arrangørformel.
lib/scoring-endring → test først.

### D11 — Best ball er segment-berettiget (revisjon av D2/0151-grensen)

Back 9-hosten er et best ball-spill → `hole_segment='back9'` må være gyldig for
`best_ball`. Migrasjon 0152 utvider CHECK-en; nytt predikat `supportsHoleSegment(mode)`
(= `isMatchplayFamily(mode) || mode === 'best_ball'`) erstatter `isMatchplayFamily` som
TS-motpart i layer-agreement-testen. Best ball-motoren gjøres segment-aware (lagtotal
over hull-i-scope; padTo18/tiebreaker-adferd avklares i test først). Øvrige
strokeplay-formater forblir 18-hulls.

### D12 — Blind cup-dag (eier-krav i økta: «ingenting avsløres før arrangøren avslutter»)

Bunt-spillene opprettes med eksisterende `score_visibility='reveal'`. Det som mangler er
håndheving i matchplay-/cup-flatene (duell-views har bevisst ingen reveal-props i dag):

- **Spill-leaderboard (duell + best ball):** `status='active'` + `'reveal'` → ingen
  match-status/lagtotal; placeholder («Avsløres når arrangøren avslutter»). Egen føring
  vises alltid (spilleren ser egne slag).
- **Cup-siden:** matcher uten `status='finished'` viser «pågår» uten resultat/poeng;
  lagtotalene på cup-leaderboardet teller kun ferdige spill (gjelder generelt, men blir
  synlig-viktig her).
- **Avledet singles-home:** ingen live-status — kun lenke til host for føring.
- Reveal-trigger = arrangøren avslutter spillet (`status='finished'`) — dagens
  RLS-regel «alle ser alt etter finished» gjør resten.
- Samtidig føring («én i flighten fører for alle») er dekket av eksisterende
  co-scoring (0088) — verifiseres i staging-runden, ingen ny kode ventet.

## Ikke i scope

- Generisk hull-range eller 9-hulls-baner i banearkivet.
- Per-spiller handicap-overstyring i cup.
- Endring av stroke play-moduser (best_ball, stableford, …) til segment — kun
  matchplay-familien som cupen bruker.

## Faser (subagent-drevet, én PR, atomiske commits med `Refs #1441`)

### F1 — Scoring-motor matchplay (TDD) — ✅ LEVERT (commits aa4fb70…f918fa4)
- Matchplay-computene + `computeMatchplayRunningStatus` regner mot hull-i-scope;
  `HoleSegment`-type + `holesForSegment` i `lib/scoring/holeSegment.ts`. 1085 grønne.
- Bonusfunn fikset: match avgjort på siste hull noterte «X&0» i stedet for «Xup».

### F2 — DB-migrasjon 0151 (staging) — ✅ LEVERT (commit 6d08d19 + 170dcc2)
- `hole_segment` + `source_game_id` + CHECK + FK CASCADE + indeks; påført og
  probe-verifisert på staging. TS-typer håndutvidet med regen-markør.
  Layer-agreement-test binder CHECK ↔ `isMatchplayFamily`.
- **Prod KUN etter eksplisitt eier-OK** (brannmur #1074) — drift-sjekken er
  forventet rød til da.

### F1b — Scoring-motor del 2 (TDD): best ball-segment + manuelle lag-slag
- `supportsHoleSegment(mode)`-predikat (matchplay-familien + `best_ball`);
  layer-agreement-testen bytter predikat og leser 0152-constrainten.
- Best ball segment-aware: lagtotal over hull-i-scope (padTo18/tiebreaker-adferd
  avklares i test først; back9 = hull 10–18).
- `mode_config.team_strokes_override` i greensome-computen (D10) — test først.

### F2b — DB-migrasjoner 0152–0154 (staging)
- 0152: utvid `games_hole_segment_matchplay_only` med `best_ball` (D11).
- 0153: `tournaments.win_points`/`tie_points` (D8).
- 0154: `tournament_side_awards` + RLS (D9).
- Staging-apply + probe-verifisering; prod venter på samme eier-OK som 0151.

### F3 — Cup-generering + cup-poeng
- Preset «Splittet cup-dag»: bunt per flight (greensome front9 + best ball back9-host +
  2 singles avledet), oppstillings-editor (singles-paring innen flight), generer-actions
  (segment/source/`score_visibility='reveal'` i insert, to-pass host→avledet, rollback),
  cap 16, allowance-eksponering (85/100-defaults), manuelt lag-slag-felt (D10),
  vekt-felter (D8) + sidepoeng-oppsett og vinner-registrering (D9).
- `getCupSnapshot`/`computeCupMatchResult`/`computeCupLeaderboard`: score-fetch via
  `source_game_id ?? id`, hull-filter per segment, bestball-award (netto lagtotal),
  vektede poeng, sidepoeng, blind-gating (D12).

### F4 — Spill-flater (Explore-sweepen 2026-08-06 er fasit-lista)
- Kompletthet/innlevering: `deliveryStatus`/`getActiveGameCardData`/submit/approve/
  PrimaryCta/purring — «alle hull» = segmentets hull.
- Hull-navigasjon: HoleStrip/HoleClient/hole-page-bounds/scorecard `nextHole` —
  segment-scope + avledet-guard (ingen score-entry på avledede spill).
- Leaderboard-røret: `leaderboardContent` (holes-filter + `source_game_id ?? id`),
  frontNineGate, CSV-export, spectate/embed arver.
- Reveal-gating i duell-/bestball-views (D12).
- Avledet game-home: les-visning + lenke til host; lifecycle-fanout host→avledet i
  `endGame`/`endGameWithSideWinners`/`reopenGame` (kompensert batch, `expectAffected`).
- Stats/historikk/arkiv/achievements: `source_game_id IS NULL`-filter mot
  dobbelttelling (`getMyStats`, historikk-page, `getFinishedGamesForUser`,
  admin-lista, Home-kortene).
- `getGameWithPlayers`: nye kolonner i select + cache-key-bump (gwp6 → gwp7).

### F5 — Polish + verifisering
- Irish-copy (humanizer-skill), flows-diagram + PNG-regen (`docs/flows/README.md`),
  CHANGELOG + versjonsbump på den bruker-synlige feat-commiten, e2e golden path
  (splittet dag) vurdert mot @gate-suiten.
- Staging-klikkrunde av hele flyten (opprett → generer → før blindt → arrangør
  avslutter → reveal + poeng) FØR merge. Verifiser co-scoring (én fører for flighten).

## Risiko

- **Bredde i F4:** «alle hull»-antakelsen ligger i mange flater; sweep-lista må lukkes
  før merge, ellers viser en flate 18 hull for et 9-hulls-spill.
- **Avledede spill i statistikk:** dobbelttelling av runder hvis sweepen bommer.
- **Tidsvindu:** helgemålet krever staging-verifisering fredag + eier-OK på
  prod-migrasjonen. Fallback hvis F3/F4 glipper: singles føres som egne (ikke-avledede)
  back9-matcher — formatet består, men med dobbel føring.
