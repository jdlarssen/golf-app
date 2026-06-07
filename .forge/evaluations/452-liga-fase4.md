# Skeptisk evaluering: Liga Fase 4 — flere spillmodi (#452)

**Branch:** `issue-452-liga-fase4` · **Base:** `origin/main` · **Versjon:** 1.94.0
**Evaluert:** 2026-06-08 (fresh-context opus, adversarial)
**Verdikt:** **ACCEPT**

---

## Gates (kjørt selv)

| Gate | Resultat |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx vitest run lib/league components/league` | **64 passed (7 files)** |
| `npx vitest run lib/scoring/modes/stableford lib/scoring/modes/modifiedStableford` | **51 passed (2 files)** |
| `npm run build` | **exit 0** (Vercel-paritet) |
| `computeLeagueStandings.test.ts` isolert | **31 passed** (23 stroke + 8 stableford) |

---

## Suksesskriterier — per kriterium

### 1. CHECK-constraint applyet + types + advisor — PASS
- Migrasjon `0087_league_format_modes.sql` lagt til. Mot prod (`glofubopddkjhymcbaph`) er constrainten LIVE:
  `CHECK ((format = ANY (ARRAY['stroke','stableford','modified_stableford'])))`. Migrasjon `league_format_modes` (20260607221616) i `list_migrations`.
- `database.types.ts` bevisst IKKE regenerert. **Verifisert sunt:** `lib/database.types.ts:1074` har `format: string` — en CHECK på en `text`-kolonne endrer ikke generert type (kun ENUM/kolonnetype gjør det). Koden caster `league.format as LeagueFormat` på alle 3 konsumentene (snapshot, actions, page). Begrunnelsen holder.
- Security-advisor: ingen NYE funn. Alle treff er pre-eksisterende prosjekt-warnings (mutable search_path, SECURITY DEFINER RPCs, RLS-no-policy på audit-tabeller, leaked-password). Ingen refererer `leagues_format_check`. Migrasjonen er ren DDL — ingen ny funksjon/tabell/RLS-flate.

### 2. `leagueFlightGameConfig` + `isPointsBasedFormat` med Type-A — PASS
`lib/league/flightFormat.ts` korrekt: stroke→solo_strokeplay; stableford→`{kind:'stableford',team_size:1,points_table:'standard'}`; modified→`{kind:'modified_stableford',team_size:1,points_table:'modified'}`. Begge modeConfig matcher `GameModeConfig`-unionen (`types.ts:308-311`). `flightFormat.test.ts` dekker alle tre + isPointsBased-tabell.

### 3. `computeFlightRoundValues` ruter + dropper ufullstendige — PASS
`roundScoring.ts`: ruter til soloStrokeplay/stableford/modifiedStableford. Stroke: net/gross = total−par, dropper ukjent par. Stableford/modified: net=gross=totalPoints. `holesPlayed !== holeCount` → drop (komplett-kort-regel flyttet hit fra snapshot, samme semantikk). `result.variant !== 'solo'` defensivt mot team. Tester dekker stroke/stableford/modified + ufullstendig kort (`it.each` over alle 3 formater) + flag-passthrough.

### 4. Retnings-bevisst aggregator per §4 — PASS (kjernen, gransket linje-for-linje)
- **Stroke bit-for-bit bevart:** Med `pointsBased=false` blir `roundHigherIsBetter=false`, `seasonHigherIsBetter = (model==='points')`. Gammel `higherIsBetter = (model==='points')` → identisk. `betterRound` reduserer til `a < b` (gammel dedup), points-placement-sort til `a.score - b.score` (uendret), best_n-sort til `a - b` (uendret), `byValue`/`worst` identisk. Alle 23 stroke-tester grønne uten verdiendring (kun feltnavn-rename i `score`-helper).
- **Stableford-retning korrekt overalt** (verifisert mot tester + håndtrace):
  - dedup beholder HØYEST (`betterRound` = `a > b`) — test linje 388.
  - points-placement: HØYEST poeng = best plassering (`b.score - a.score`) — test 374.
  - best_n: N HØYESTE (`b - a` så slice(0,n) tar topp-N) — test 351.
  - uteblitt = 0 (`penaltyForRound: if pointsBased return 0`) — test 315/363.
  - sesong-sort høyest-først (`seasonHigherIsBetter=true` → `byValue` flipper) — test 320 (high→low rekkefølge).
  - countback siste runde høyest-best — test 395 (A vant siste 30>20).
- **De to retningene IKKE sammenblandet (krav #3):** countback FELT-valg er `usePlacementPoints = (model==='points')`, IKKE retning (`cellValue` linje 196). `worst`-sentinel og `byValue` bruker `seasonHigherIsBetter`. Dette er nettopp §4-kravet. Gjennomgått alle 8 model×format-kombos: ingen sorterer feil vei. Spesielt stableford+total: `usePlacementPoints=false` → countback på `cell.value` (poeng), `seasonHigherIsBetter=true` → `worst=-Inf` (riktig for høyest-best).

### 5. `getLigaSnapshot` scorer stableford til poeng + netto-only — PASS
Leser `league.format`, ruter hver flight gjennom `computeFlightRoundValues`, setter `config.pointsBased = isPointsBasedFormat(format)`. Netto-only: `createLeagueDraft` tvinger `scoring='net'` for pointsBased → `standings.gross = null` (scoring er ikke 'gross'/'both'), `standings.net` beregnes. Gross-aksen (=totalPoints) rangeres aldri som egen tabell. Markør-regelen (`eligible.length < 2 continue`) og komplett-kort-regelen holder.

### 6. `createLeagueDraft` + `startLeagueRoundFlight` — PASS
`createLeagueDraft`: leser+validerer `format` (return `{error:'format'}` ved ugyldig), tvinger `scoring='net'` + `penalty_kind='worst_plus_one'` for pointsBased (defense-in-depth), persisterer `format` (ikke lenger hardkodet `'stroke'`). `startLeagueRoundFlight`: leser `format` fra SELECT, setter `game_mode`/`mode_config` via `leagueFlightGameConfig` — stableford-liga lager faktisk stableford-flights.

### 7. `CreateLigaForm` format-velger + låsing + copy — PASS
Spillform-radiogruppe (Slagspill default / Stableford / Modifisert). Hidden `scoring` = `pointsBased ? 'net' : scoring` (overstyrer selv om brukeren valgte gross/both før). Brutto/Begge-radioene erstattet av info-tekst for pointsBased. Straffescore-type-blokk gated med `!pointsBased`. Format-bevisst copy på alle sesong-modeller + missed-round-policy. Humanizer kjørt — ingen AI-tells.

### 8. `LeagueStandingsTable`/`Panel` viser rå poeng — PASS
`pointsBased`-prop trådd page→Panel→Table. `formatValue`/`RoundCell`: `model==='points' || pointsBased` → `formatPoints` (rene tall), ellers `formatNetToPar`. Verifisert: stableford+total viser "32" ikke "+32", straffet uteblitt runde viser "0" ikke "E" (`formatPoints(0)='0'`). Ny render-test asserterer nettopp dette (maks én ny test per komponent — Type-C overholdt). Points-modellen uendret.

### 9. Build grønn + versjon + CHANGELOG — PASS
`npm run build` exit 0. `package.json`=1.94.0. CHANGELOG har `## 1.94.y — Liga · stableford` med tagline («Du kan nå velge spillform …») + Teknisk-details. Rename netToPar→net dokumentert.

---

## Adversarielle funn

Ingen funksjonelle bugs funnet. To kosmetiske nits (ikke blokkerende):

1. **`lib/league/actions.ts:525` — stale JSDoc.** `startLeagueRoundFlight`-docstringen sier «Creates a solo_strokeplay game», men body-en ruter nå via `leagueFlightGameConfig(league.format)`. Bare en kommentar; oppførselen er korrekt. Severity: trivial/docs.
2. **`LeagueStandingsTable.test.tsx:9-35` — lokale `formatNetToPar`/`formatPoints`/`formatValue`-kopier** øverst i testfila ser ut til å være ubrukt legacy (de nye testene `render(<LeagueStandingsTable/>)` mot ekte komponent). Pre-eksisterende, ikke introdusert her. Severity: trivial/test-hygiene.

Ingen av disse rettferdiggjør et eget issue (rene stil-meninger per CLAUDE.md «ikke filer rene stil-meninger som issues»). Verdt en én-linjes JSDoc-fix om man er innom, men ikke blokkerende.

## Kontroller fra oppdraget

- **Hardkodet 'stroke'/'solo_strokeplay':** Alle gjenværende treff er legitime (tester, flightFormat-switch stroke-case, format-bevisst label, defaults). Ingen som burde rute per format.
- **database.types.ts ikke regenerert:** Sunt — verifisert `format: string` uendret av CHECK.
- **Norsk copy:** Ingen AI-tells, ingen em-dash-kjeder i bruker-rettet tekst (em-dash kun i kode-kommentarer), ingen særskriving. Idiomatisk sporty stemme.
- **Stroke-path brutt?** Nei — 23 pre-eksisterende aggregator-tester grønne, verdier uendret.

---

## VERDIKT: ACCEPT
