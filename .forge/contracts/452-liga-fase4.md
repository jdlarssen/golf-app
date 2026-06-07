# Forge-kontrakt: Liga Fase 4 — flere spillmodi (#452)

**Branch:** `issue-452-liga-fase4`
**Issue:** #452 (epic, SISTE fase) · **Versjon:** v1.93.0 → **v1.94.0** (minor)
**Skrevet:** 2026-06-08 · contract-first, gråsoner avklart med eier via AskUserQuestion.

## 1. Mål

Åpne liga-formatet fra å være låst til slagspill (`'stroke'`) til også å støtte
**Stableford** og **Modifisert Stableford** (begge solo, individuell order-of-merit).
Sesong-tabellen aggregerer hvert formats native per-runde-verdi over et **felles,
retnings-bevisst poeng-grunnlag** — mot-par (lavest best) for slagspill, stableford-poeng
(høyest best) for stableford.

Issue #452 låser allerede retningen: Total-modellen er definert som «sum mot par / **sum
poeng**». Fase 4 realiserer «sum poeng»-halvdelen.

## 2. Eier-beslutninger (gråsoner, låst 2026-06-08)

1. **Format-scope:** Slagspill (eksisterende) + **Stableford** + **Modifisert Stableford**,
   alle **solo**. Lag-stableford og matchplay-familien er uegnet (liga er individuell).
   Relative formater (Skins/Nassau/Wolf/Nines) gir flight-relative verdier som ikke kan
   sammenlignes på tvers av feltet → utelatt.
2. **Mapping:** **Rå poeng i alle fire sesong-modellene.** Total = sum poeng, Snitt = snitt
   poeng, Beste-N = sum av N **høyeste** poeng-runder, Poeng-per-plassering = plasser feltet
   etter poeng → tildel plasserings-poeng. Krever retnings-bevisst aggregator.
3. **Uteblitt runde (poeng-liga):** **0 poeng = naturlig straff.** Straffescore-TYPE-valget
   (dårligste+1 / fast) skjules for stableford. Missed-round-policy beholder `penalty`
   (= 0 poeng) vs `must_play_all` (urangert).
4. **Netto/brutto:** **Kun netto for stableford.** Tabell-valget låses til «Netto» når
   format ≠ slagspill (Brutto/Begge skjules). Ingen brutto-stableford-kodesti.

## 3. Hvor format-låsen ligger i dag (kartlagt)

| # | Sted | Hva som er hardkodet |
|---|---|---|
| 1 | `lib/league/types.ts:6` | `LeagueFormat = 'stroke'` |
| 2 | `lib/league/actions.ts:135` | `createLeagueDraft` skriver `format: 'stroke'` |
| 3 | `lib/league/actions.ts:595-596` | `startLeagueRoundFlight` lager flight som `solo_strokeplay` |
| 4 | `lib/league/getLigaSnapshot.ts:292-327` | scorer hver flight via `computeSoloStrokeplay`, utleder `netToPar`/`grossToPar` |
| 5 | `app/admin/liga/new/CreateLigaForm.tsx` | ingen format-velger; poster aldri `format` |

DB: `leagues.format text not null default 'stroke'` — **ingen CHECK** i dag (additivt å utvide).

En liga-flight er en helt vanlig `games`-rad; en stableford-flight rendrer det eksisterende
stableford-scorekortet uendret. Ingen per-flight-UI-arbeid.

## 4. Kjerne-design: retnings-bevisst aggregator

`computeLeagueStandings` antar i dag at per-runde-verdien er **lavest-best** overalt; den
eneste retnings-flippen (`higherIsBetter = standingsModel === 'points'`) gjelder kun
sesong-verdiens sortering. Fase 4 skiller to uavhengige retninger:

- **`roundHigherIsBetter`** = `config.pointsBased` (stableford → `true`). Styrer: dedup-til-beste
  per spiller, plasserings-sortering i points-modellen, straffe-«verste», Beste-N-utvalg.
- **`seasonHigherIsBetter`** = `standingsModel === 'points' || config.pointsBased`. Styrer:
  sluttsortering av rader + countback-retning + `worst`-sentinel.
- **Felt-valg i countback** = `standingsModel === 'points' ? cell.points : cell.value`
  (uavhengig av retning — må IKKE utledes fra `seasonHigherIsBetter`).

### Sannhetstabell

| format | modell | roundHigher | seasonHigher | per-runde-celle | uteblitt runde |
|---|---|---|---|---|---|
| stroke | total | false | false | mot-par | straff (verste+1 / fast) el. urangert |
| stroke | average | false | false | mot-par | ekskludert |
| stroke | best_n | false | false | mot-par | straffe-fyll opp til N |
| stroke | points | false | **true** | plasserings-poeng | 0 poeng |
| stableford | total | **true** | **true** | stableford-poeng | **0 poeng** el. urangert |
| stableford | average | **true** | **true** | poeng | ekskludert |
| stableford | best_n | **true** | **true** | poeng | **0-fyll** opp til N |
| stableford | points | **true** | **true** | plasserings-poeng | 0 poeng |

`penaltyForRound`: `if (config.pointsBased) return 0;` ellers uendret (`verste+1` / `fast`).

**Slagspill-atferd er identisk bevart:** med `pointsBased=false` blir `roundHigherIsBetter=false`
og `seasonHigherIsBetter = (modell==='points')` — eksakt dagens semantikk. Alle eksisterende
liga-tester skal forbli grønne; stableford-tester legges til.

## 5. Data-modell-endringer (rename for ærlighet)

`netToPar`/`grossToPar` er misvisende når feltet holder poeng. Nøytraliser:

- `LeagueRoundPlayerScore`: `netToPar` → **`net`**, `grossToPar` → **`gross`** (fortsatt
  `number`; mot-par for stroke, poeng for stableford). Stableford setter `net = gross =
  totalPoints` (gross rangeres aldri for stableford siden `scoring='net'`; speiling unngår
  nullability-churn i den tungt-testede aggregatoren — dokumenteres).
- `LeagueStandingCell`: `toPar` → **`value`** (rå per-runde-verdi på aktiv akse). `points`
  (plasserings-poeng) uendret.
- `LeagueStandingsConfig`: + **`pointsBased: boolean`**.
- `LeagueFormat`: `'stroke' | 'stableford' | 'modified_stableford'`.
- Ny helper i `types.ts`: `isPointsBasedFormat(format): boolean` (gjenbrukes i snapshot,
  display, wizard).

Rename-flate (liten, kartlagt): `net/gross` → 4 filer; `toPar`→`value` → 5 filer.

## 6. Fil-for-fil-plan

**Migrasjon**
- `supabase/migrations/0087_league_format_modes.sql` — `alter table leagues add constraint
  leagues_format_check check (format in ('stroke','stableford','modified_stableford'))`.
  Rollback-tx-valider → apply via Supabase MCP → regenerer `database.types.ts` → security-advisor.

**Ren logikk (TDD først)**
- `lib/league/flightFormat.ts` (NY) — `leagueFlightGameConfig(format)` → `{ gameMode, modeConfig }`
  (stroke→solo_strokeplay; stableford→`{kind:'stableford',team_size:1,points_table:'standard'}`;
  modified→`{kind:'modified_stableford',team_size:1,points_table:'modified'}`). + `isPointsBasedFormat`.
  Type-A tester.
- `lib/league/roundScoring.ts` (NY) — `computeFlightRoundValues(format, ctx, holeCount, parByUser)`
  → `LeagueRoundPlayerScore[]`: ruter til riktig compute, mapper til `net`/`gross`, dropper
  ufullstendige kort (`holesPlayed !== holeCount`). Stroke: net/gross = total(net/gross) − par.
  Stableford/modified: net = gross = totalPoints. Type-A tester (stroke, stableford, modified,
  ufullstendig kort).
- `lib/league/computeLeagueStandings.ts` — retnings-bevisst refaktor (§4). + stableford-tester
  i `computeLeagueStandings.test.ts` (alle 4 modeller, 0-poeng-uteblitt, Beste-N høyest, countback).

**Server**
- `lib/league/getLigaSnapshot.ts` — les `league.format`; bruk `computeFlightRoundValues`;
  `config.pointsBased = isPointsBasedFormat(format)`.
- `lib/league/actions.ts` — `createLeagueDraft`: les+valider `format`; for ikke-stroke tving
  `scoring='net'` + `penalty_kind='worst_plus_one'`/`penalty_fixed=null` (defense-in-depth).
  `startLeagueRoundFlight`: les `format`, sett game_mode/mode_config via `leagueFlightGameConfig`.

**UI**
- `app/admin/liga/new/CreateLigaForm.tsx` — format-velger (Slagspill default / Stableford /
  Modifisert Stableford); poster `format`. Når format ≠ stroke: lås `scoring='net'` (skjul
  Brutto/Begge), skjul straffescore-type-blokken, format-bevisst copy på Sesong-modell
  («Sum poeng …» vs «Sum mot par …»). Humanizer på all ny/endret norsk copy.
- `components/league/LeagueStandingsTable.tsx` (+ test) — prop `pointsBased`; formater rå
  verdier som rene poeng (`formatPoints`) i stedet for mot-par når `pointsBased`. `points`-modell
  uendret.
- `components/league/LeagueStandingsPanel.tsx` (+ test) — tråd `pointsBased` videre. Net-only
  for stableford gir allerede én tabell uten bryter (ingen endring i den logikken).
- `app/liga/[id]/page.tsx` — send `pointsBased`/`format` inn til Panel.

**Versjon/changelog/flyt**
- `package.json` → `1.94.0`; `CHANGELOG.md`-oppføring (tagline + Teknisk).
- Flyt-diagram: liga-flyten endrer ikke form (format er et konfig-valg i samme wizard, ikke en
  ny gren). Sjekk `docs/flows/` for et liga/flyt-6-diagram; oppdater kun hvis det enumererer
  format eksplisitt. Ellers ingen diagram-endring (begrunnes i closing-kommentar).

## 7. Suksesskriterier

- [ ] `leagues.format` har CHECK-constraint `in ('stroke','stableford','modified_stableford')`; migrasjon rollback-validert + applyet; `database.types.ts` regenerert; security-advisor uten nye funn.
- [ ] `leagueFlightGameConfig` + `isPointsBasedFormat` finnes med Type-A-tester (grønne).
- [ ] `computeFlightRoundValues` ruter stroke/stableford/modified korrekt, dropper ufullstendige kort; Type-A-tester grønne.
- [ ] `computeLeagueStandings` er retnings-bevisst per §4-sannhetstabellen; **alle eksisterende stroke-tester grønne**; nye stableford-tester (4 modeller + 0-poeng-uteblitt + Beste-N-høyest + countback) grønne.
- [ ] `getLigaSnapshot` scorer stableford-flights til poeng og setter `pointsBased`; netto-only-tabell for stableford.
- [ ] `createLeagueDraft` lagrer valgt `format`; tvinger `scoring='net'` for ikke-stroke. `startLeagueRoundFlight` lager flight med riktig game_mode/mode_config per format.
- [ ] `CreateLigaForm` har format-velger; låser scoring + skjuler straffe-type + format-bevisst copy for stableford. Humanizer kjørt på ny norsk copy.
- [ ] `LeagueStandingsTable`/`Panel` viser stableford-verdier som rene poeng (ikke «+/−/E»); render-tester grønne (maks én ny render-test per komponent per Type-C).
- [ ] `npm run build` grønn (Vercel-paritet); `package.json` = 1.94.0; CHANGELOG oppdatert.
- [ ] Skeptisk opus-eval (fresh-context) = ACCEPT før PR.

## 8. Gates (kjøres scoped per chunk)

- `npx tsc --noEmit` (eller `npm run build` ved slutten — ikke filtrer feil som «pre-existing»).
- `npx vitest run lib/league components/league lib/scoring/modes/stableford lib/scoring/modes/modifiedStableford` (+ endrede co-located filer).
- Humanizer-skill på ny/endret norsk copy før commit.

## 9. Risiko & ikke-mål

- **Risiko:** refaktor av tungt-testet aggregator. Mitigering: slagspill-atferd bevisst
  bit-for-bit bevart (§4); kjør hele eksisterende liga-suite grønn før stableford-tester legges på.
- **Ikke-mål:** lag-stableford/par-stableford i liga; brutto-stableford; relative formater
  (Skins/Nassau/Wolf/Nines); matchplay-familien; per-runde-format (format er liga-globalt);
  retroaktiv konvertering av eksisterende slagspill-ligaer (de er allerede `format='stroke'`).
- **Migrasjons-rekkefølge:** CHECK-constrainten tåler å applyes før kode-deploy (additiv,
  default 'stroke' passerer). Ingen seed-avhengighet (jf. format-seed-fellen — gjelder ikke her).

## 10. Atomiske commits (forventet rekkefølge)

1. `chore(db): #452 leagues.format CHECK for stableford modes (0087)`
2. `chore(league): #452 flightFormat + isPointsBasedFormat helpers + Type-A`
3. `chore(league): #452 computeFlightRoundValues round-scoring helper + Type-A`
4. `feat(league): #452 direction-aware standings aggregator (points-based formats)` *(bump+CHANGELOG her eller i siste)*
5. `feat(league): #452 score stableford flights in getLigaSnapshot`
6. `feat(league): #452 format picker + stableford flight creation`
7. `feat(league): #452 points-aware standings display`
8. `chore(forge): #452 Fase 4 skeptical evaluation`

(Hver `feat(...)` bumper/oppdaterer CHANGELOG der hooken krever det.)
