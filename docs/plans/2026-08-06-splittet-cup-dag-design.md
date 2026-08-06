# Splittet cup-dag — design + faseplan

**Issue:** #1441 · **Branch:** `claude/golf-cup-nord-sor-8lmocp` · **Eierbestilling:** 2026-08-06

## Målbilde (brukerspråk)

Én fysisk 18-hulls-runde per flight (2 fra hvert lag) teller som tre cup-sesjoner:

| Hull | Format | Matcher (6v6) | Føring |
|---|---|---|---|
| 1–9 | Greensome 2v2 (spilles som Irish greensome ute) | 3 | Lagball — kaptein fører, som i dag |
| 10–18 | Fourball/best ball 2v2 | 3 | Individuelle slag, alle fire |
| 10–18 | Singles 1v1 (2 per flight: N1vS1 + N2vS2) | 6 | **Ingen egen føring** — leser fourball-scorene |

12 matcher → 12 poeng, `derivePointsToWin` uendret. I tillegg: personlig cup-cap 4 → 16
matcher (ikke-admin kan sette opp hele dagen selv), allowance-% justerbar i oppsettet.

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
`source_game_id ?? id`, filtrert på segmentets hull og matchens spillere. Ingen
score-entry-UI for avledede spill — game-home viser live match-status + lenke til
host-spillet. Offline-sync røres ikke (avledede spill skriver aldri).

**Lifecycle:** host-spillet avsluttes (approve-flyt) → server action flipper avledede
spill til `finished` i samme operasjon (kompensert batch, `expectAffected`).
ON DELETE: host slettes → avledede slettes (CASCADE) — de er meningsløse uten kilden.

**RLS:** lesing av host-scores dekkes av eksisterende policies (singles-spillerne ER
spillere i host-spillet / cup-sider bruker admin-client). Verifiseres i F2 mot staging.
Avledede spill trenger ingen score-INSERT-policy (skriv skjer aldri).

### D4 — Cup-preset «Splittet cup-dag»

Ny preset i `cupTemplates.ts` + generering i `cupPairing.ts`/wizard: per flight genereres
en **bunt** — greensome (front9) + fourball (back9) + 2 singles (back9, `source` =
fourball-spillet). Samme fire spillere i hele bunten (fysisk krav). Oppstillings-editoren
redigerer flight-sammensetning og singles-paringene innen flighten. `sessionMatchCount`
for bunten: `floor(teamSize/2)` flights → `4 × flights` matcher totalt.
Generer-actions insert-er `hole_segment` + `source_game_id` per match; rollback-batchen
(#675-mønsteret) dekker de nye radene.

### D5 — Cap: `MAX_PERSONAL_CUP_MATCHES` 4 → 16

Spiller-cap 24 uendret (12 trengs for 6v6). Copy som nevner taket oppdateres (T2-sweep
på litteralen `4` i cap-lagene: limits + tester + evt. UI-copy).

### D6 — Irish greensome = variant-copy, ikke ny modus

Scoring og laghandicap er identisk med greensome (60 % laveste + 40 % høyeste CH,
allowance-% på toppen). Ingen ny `game_mode`-enum-verdi, ingen DB-endring. Varianten
synliggjøres i copy/labels der greensome velges i cup-oppsettet (helper-tekst som
forklarer Irish-mekanikken ute på banen). Full egen modus er et separat, senere issue
hvis promo-verdien tilsier det.

### D7 — Allowance synlig for ikke-admin cup-skaper

Feltene finnes i tournaments-raden og oppsett-formene; F3 verifiserer at ikke-admin-stien
eksponerer dem (ikke bare hidden defaults). Per-spiller handicap-overstyring er IKKE i
scope (detaljer fra spillerne venter).

## Ikke i scope

- Generisk hull-range eller 9-hulls-baner i banearkivet.
- Per-spiller handicap-overstyring i cup.
- Endring av stroke play-moduser (best_ball, stableford, …) til segment — kun
  matchplay-familien som cupen bruker.

## Faser (subagent-drevet, én PR, atomiske commits med `Refs #1441`)

### F1 — Scoring-motor (TDD)
- Nye tester først (9-hulls-scope: AS / mat-em «5&4» / «2up» / hull 10–18-numre /
  score utenfor scope ignoreres / 18-hulls uendret) → rød → implementer → grønn.
- Filer: `lib/scoring/modes/singlesMatchplay.ts`, `fourballMatchplay.ts`,
  `foursomesMatchplay.ts` (+ greensome/chapman/gruesome hvis de ikke deler kjernen),
  delte helpers (`computeMatchplayRunningStatus`). Grep etter `18` i lib/scoring for
  full enumerering (T2).
- Gate: `npx vitest run lib/scoring` grønn (1029+ nye).

### F2 — DB-migrasjon (staging først)
- Én migrasjon: `hole_segment` + `source_game_id` + CHECK + FK (CASCADE) + indeks på
  `source_game_id`. Nummerering sjekkes mot `origin/main`.
- Påføres **staging** via Supabase MCP → introspekter staging → TS-typer
  (staging-gen eller håndutvidelse med regen-markør). **Prod KUN etter eksplisitt
  eier-OK** (brannmur #1074) — aldri auto.
- RLS-verifisering av host-score-lesing (pgTAP hvis policy røres; ellers dokumentert
  resonnement + hostile-sjekk).

### F3 — Cup-generering
- Preset + bunt-paring + oppstillings-editor (singles-paring innen flight) +
  generer-actions (segment/source i insert, rollback) + cap 16 + allowance-eksponering.
- `computeCupMatchResult`/`getCupSnapshot`: score-fetch via `source_game_id ?? id`,
  hull-filter per segment.

### F4 — Spill-flater
- Score-entry/hull-navigasjon/scorecard/submit/approve segment-aware («alle hull ført»
  = segmentets hull). Leaderboard/views for 9-hulls-matcher.
- Avledet game-home: les-visning + lenke til host; finish-kobling host→avledet.
- Sweep: historikk/stats/achievements/round report — avledede spill ekskluderes eller
  spesialbehandles (ingen dobbelttelling av runder). Explore-kartet fra økta styrer lista.

### F5 — Polish + verifisering
- Irish-copy (humanizer-skill), flows-diagram + PNG-regen (`docs/flows/README.md`),
  CHANGELOG + versjonsbump på den bruker-synlige feat-commiten, e2e golden path
  (splittet dag) vurdert mot @gate-suiten.
- Staging-klikkrunde av hele flyten (opprett → generer → før → lever → poeng) FØR merge.

## Risiko

- **Bredde i F4:** «alle hull»-antakelsen ligger i mange flater; sweep-lista må lukkes
  før merge, ellers viser en flate 18 hull for et 9-hulls-spill.
- **Avledede spill i statistikk:** dobbelttelling av runder hvis sweepen bommer.
- **Tidsvindu:** helgemålet krever staging-verifisering fredag + eier-OK på
  prod-migrasjonen. Fallback hvis F3/F4 glipper: singles føres som egne (ikke-avledede)
  back9-matcher — formatet består, men med dobbel føring.
