# Spec: Native N4 — leaderboards + format-familiene (scramble, matchplay, poengspill)

> **Scope-revisjon 2026-08-30 21:10 (eierbeslutning, MoSCoW i epic #1816 — kommentar på #1828):**
> Must = de 8 brukte formatene (stableford, modified_stableford, singles_matchplay,
> greensome_matchplay, best_ball, wolf, BBB, skins). **Greensome erstatter scramble som
> Must-målet for lag-infraen** (samme kollaps-mekanikk); scramble-familien + foursomes/
> fourball/chapman/gruesome/patsome + nassau/nines/acey_deucey/round_robin/solo_strokeplay
> er Could. Allerede bygget Could-arbeid (chunk 1-renderere, scramble-grener) beholdes og
> bokføres som «levert Could» — det poleres ikke videre. Wolf/BBB-gaten står, men valg-UI-
> slicen er Must FØR butikk-byttet (eget issue). Kriterium 3 er omskrevet til greensome;
> scramble-beviset nedgraderes til bonus-evidens.

## Problem

Etter N3 (#1825) kan appen føre og levere enkle formater, men den har ingen resultatvisning — og format-gaten henviser hele lag- og matchplay-familien til nettsiden. N4 gir appen leaderboard-skjermen (drevet av delt `computeLeaderboard`, samme motor som webben) og un-gater de store familiene: scramble-lagene og matchplay. Wolf/BBB (krever egen per-hull-valg-UI) og patsome (segment-hybrid) bokføres ærlig som gjenstående i stedet for å skipes halvveis.

## Research Findings (verifisert i økta 2026-08-30, fil:linje i kartleggingen på issuet)

- **RLS gjør leaderboard-lesing mulig UTEN service-role:** `scores select gating per mode` (0031→0161) har en 0121-gren som gir deltakere i AKTIVT spill med `score_visibility='live'` (default) kryssflight-lesing av ALLE scores. Ferdige spill: deltaker-grenen holder. Webbens service-role-swap (`getResultReadClient`, #1632/#1542) finnes KUN for å slippe inn ikke-deltakere på ferdige spill — den flaten forblir web-eneste.
- **Motoren er allerede delt og komplett:** `computeLeaderboard(ctx: ScoringContext): ModeResult` (`lib/scoring/index.ts:44`) ruter alle 21 modi til 16 `kind`-diskriminerte resultatformer (`lib/scoring/modes/types.ts:2282`). `ScoringHoleScore` = `{userId, holeNumber, gross}` — putts inngår ikke i motoren. `ambrose`/`florida` returnerer `kind:'texas_scramble'`; greensome/chapman/gruesome returnerer `kind:'foursomes_matchplay'`.
- **Motoren eksponerer handicap-tallene UI trenger:** `TexasScrambleResult.teams[].teamHandicap`, og `MatchplayHoleRow` bærer per-side gross/net/extra per hull (types.ts:1005–1027). Appens lag-«+N»-badges kan derfor hentes FRA motoren — webbens hull-side har en duplisert inline-implementasjon av side-handicap-formlene (60/40, scramble-pct), og et tredje hjem for de formlene er forbudt terreng (trap 4).
- **Reveal-modus er 100 % render-lag:** RLS skjuler ingenting; webben skjuler via `revealState`/`shouldHideNetto` (`lib/games/visibility.ts` — verifisert import-ren, delbar). Matchplay-familien: `RevealHiddenView` (ingenting vises); øvrige: brutto-visning. Matchplay har bevisst INGEN podium/reveal-props (`isMatchplayFamily`, types.ts:113).
- **Web-leaderboardet er realtime** via samme `postgres_changes`-kanal appen alt har (N2 `subscribeGameScores`) — appen skal gjenbruke sitt eksisterende abonnement, aldri åpne en kanal til.
- **Staging-seed-mønster finnes:** `e2e/_helpers/games.ts:seedFinishedModeGame` (#736) viser insert-fasongen (games + game_players + scores via service-role). N4 gjenbruker fasongen inline (curl) med `status:'active'` for å rigge testspill; captain = leksikografisk minste user_id (`teamScoreOwnerId`).

## Prior Decisions (N1 #1818, N2 #1823, N3 #1825 — alle står)

- Frittstående app i `native/app/`; deling via watchFolders; web-fredning (diff kun `native/app/**`, `docs/native/**`, `.forge/**`; `lib/` null diff). Sanksjonerte rot-unntak KUN ved byggekollisjon, dokumenteres her.
- N3-mønstrene gjenbrukes: navigasjonsstacken, `gameBundle`-cachen (stale-while-revalidate), `seedGameScores` + realtime → lokal DB er eneste lesekilde for skjermene, jest-expo-harnessen, `chore(native)`-commits uten `.changes`-notat.
- All skriving mot staging; simulator 820CA940 for iterasjon; eier-tapptest på fysisk iPhone som sluttbevis.

## Design

**Ny skjerm: Leaderboard** (nav-param gameId; lenke fra GameHome for alle ikke-gatede formater, alle statuser):
1. **Adapter** `src/lib/scoringContext.ts`: bygg `ScoringContext` fra bundle + lokal DB — players (user_id/team/flight/frosset CH/tee_gender fra rosteret), holes (par per kjønn + SI fra bundle), scores (lokal DB: strokes → gross; ALLE spillets rader, ikke bare egne). Kjør delt `computeLeaderboard`. Type A-tester på adapteren (mapping, withdrawn-filtrering, tom-tilstand).
2. **Renderer** per resultat-familie (én komponent per visuell form, `kind`-switch med exhaustiveness):
   - *Rad-tabeller:* `solo_strokeplay` (netto/brutto), `stableford` (variant solo/team → poeng), `texas_scramble` (lag, teamHandicap, totalNet), `shamble`, `best_ball`, `nines`, `round_robin`, `acey_deucey` — kolonner per form, rank-sortering fra motoren, `tabular-nums`-stil.
   - *Match-status (duell):* `singles_matchplay`/`fourball_matchplay`/`foursomes_matchplay` — sidene m/ navn, holes-up-status («2 up» / «AS»), hull-rad-stripe (W/L/T per hull fra `holes[]`), `result`-strengen («3&2») når avgjort. INGEN podium/rank — familien har det ikke på web heller.
   - *Potter:* `skins` (totalSkins per spiller + carriedPot), `nassau` (tre seksjoner front9/back9/total18 m/ vinnere). Enkle lister — spike-grad.
   - `wolf`/`bingo_bango_bongo`/`patsome`-kinds kan ikke oppstå (formatene er gatet, se under) — `default`-grenen viser rolig «Formatet vises på nettsiden ennå», aldri krasj.
3. **Reveal:** delt `revealState`/`shouldHideNetto` fra `lib/games/visibility.ts`. `reveal-active` + matchplay-familie → alt skjult («Resultatet avsløres når runden avsluttes»); `reveal-active` + øvrige → kun brutto-kolonner, ingen netto/poeng/rank. Krever `score_visibility` i bundelen (v-bump av bundle-payloaden, se datalag).
4. **Realtime:** skjermen abonnerer via eksisterende `subscribeGameScores` (som Hole gjør) — hver merge → recompute fra lokal DB. `seedGameScores` ved åpning.

**Format-gate-endringer** (`src/lib/formatGate.ts` — fortsatt ett hjem):
- **UT av gaten (scoring støttes nå):** scramble-familien (texas/ambrose/florida) og alternate-shot-matchplay (foursomes/greensome/chapman/gruesome).
- **INN i gaten (var misvisende åpne):** `wolf` og `bingo_bango_bongo` — ren slag-tasting uten valg-UI gir menings­løse resultater (wolf resolvér «pending» hvert hull). Bokføres som egen restanse-slice.
- **Fortsatt gatet:** `patsome` (segment-hybrid + egne tee-starters), segment-spill (`hole_segment !== 'full'`), derived. Gate-teksten differensieres: «Formatet føres på nettsiden ennå».
- Leaderboard-lenken følger samme gate som føring, MED unntak: gate-ede formater viser heller ingen leaderboard i appen (én regel, ingen halvstater).

**Lag-føring (un-gatede team-formater), i Hole/Scorecard:**
- Kort per LAG via delte `modeCollapsesToTeamCard` + `teamScoreOwnerId` (leksikografisk minste aktive medlem); kortnavn «Lag N · Fornavn1, Fornavn2»; skriv går til kapteinens rad via delt `scoreOwnerForHole` (`enteredBy` = meg). Putter føres på samme delte rad.
- **«+N»-badge fra motoren:** kjør `computeLeaderboard` på gjeldende kontekst; scramble → `teams[].teamHandicap` → `strokesForHole(teamHandicap, SI)`; alternate-shot → `holes[]`-radens per-side extra for hullet. Ingen ny handicap-formel i appen.
- Scorecard forblir Layout A og viser lagets (kapteinens) rader for kollapsede formater; matchplay-status vises på Leaderboard-skjermen, ikke i scorekortet (Layout B bokføres som senere polish).
- **Lever gates for team-kollapsede formater:** webbens team-submit oppdaterer HELE lagets rader via service-role — appen kan bare skrive egen rad under RLS, og et halv-levert lag ville blokkert `endGame`. Scorecard viser «Levering av lagkort gjøres på nettsiden ennå» i stedet for Lever-knappen. Restanse: `submit_team_scorecard`-RPC (SECURITY DEFINER) som egen DB-kontrakt senere. Singles/fourball matchplay er per-spiller-rader — Lever fungerer som i dag.
- Foursomes-familien: vis tee-starter-hintet («X slår ut på odde hull») når `games.foursomes_side1/2_tee_starter_user_id` er satt i bundelen; valget gjøres på web (ingen skrivevei i appen).

**Datalag:** bundle-payload utvides (`score_visibility`, `tournament_id`, foursomes-tee-starter-feltene) — payload-versjonering slik at gamle cache-entries re-fetches i stedet for å krasje narrowingen. GameHome-CTA-en for team-kollapsede formater peker på lagets føring (neste ufylte hull for KAPTEINENS rader).

## Edge Cases & Guardrails

- **Web-fredning:** som N1–N3. `lib/` null diff.
- **Reveal-active må aldri lekke netto/poeng** i appen — samme delte predikat som web; matchplay-familien viser INGENTING (heller ikke brutto).
- **Delvis datasett:** leaderboard uten alle scores (midt i runden) skal rendre det motoren gir — aldri kreve komplett felt. Tomt spill → rolig tom-tilstand.
- **Withdrawn:** filtreres fra ScoringContext-players (delte hjelpere); et helt trukket lag (captain null) → laget utelates.
- **Team-skriv-kappløp:** to lagmedlemmer taster samme hull → samme rad-id (kapteinens) → N2s LWW/kø-semantikk gjelder uendret; `conflictRecordFor` varsler som før.
- **Exhaustive kind-switch:** ny motor-kind i fremtiden skal gi kompilefeil i appen (satisfies/never-guard), aldri stille tom render — MEN gate-ede kinds går i default-grenen med ærlig tekst.
- **Ingen nye npm-deps.** Ingen ny realtime-kanal. Ingen DB-endringer (RPC-restansen er bokført, ikke bygget).
- **Cache-migrering:** bundle-payload-versjon bumpes; gammel payload → refetch, aldri undefined-krasj.

## Key Decisions

- **Leaderboard kun for deltakere/admin i appen** — RLS-lesing som deltaker er komplett for aktive (0121) og ferdige (deltaker-gren) spill; webbens ikke-deltaker-visning av ferdige spill (service-role) forblir web. Teknisk valg, bokført.
- **Badges og lag-handicap hentes fra motor-output** — aldri en tredje kopi av 60/40-/pct-formlene (trap 4).
- **Wolf/BBB gates NÅ** — misvisende halv-støtte er verre enn ærlig henvisning; egen slice med valg-UI + `wolf_hole_choices`/`bingo_bango_bongo_holes`-fetch bokføres. *(MoSCoW-revisjonen: slicen er Must før butikk-byttet — bokført som eget issue.)*
- **Team-lever gates** — RLS tillater kun egen rad; team-submit-RPC er egen fremtidig DB-kontrakt (aldri auto-merge, jf. prod-regler).
- **Én gate-regel for føring OG leaderboard** — ingen formater som kan «ses men ikke føres» i appen i N4 (unntak: ferdige spill av un-gatede formater vises selvsagt).

**Claude's Discretion:** komponentstruktur, kolonnedetaljer per tabellform, match-stripens utforming, tom-/delvis-tilstandstekster, hvordan payload-versjonen kodes, testfil-inndeling. Nøktern styling (brandfarger, `tabular-nums`, tap-targets ≥44px).

## Success Criteria

- [x] 1. **Adapter + renderere jest-låst:** `npx jest` grønn i `native/app/` med nye Type A-suiter for ScoringContext-adapteren (mapping/withdrawn/tomt) og minst rad-tabell-, match- og potte-render-logikken (logikk-nivå; maks 1 Type C per ny skjerm); exhaustive kind-håndtering bevist med kompilerende never-guard. Evidens: kjøringslogg + filliste.
  - *Evidens:* `npx jest` 16 suiter / 183 tester, exit 0 (chunk 2-slutt). Nye suiter: scoringContext (mapping/withdrawn/tomt/ustøttet config), leaderboardModel, teamPlay (31, greensome primærfikstur inkl. team_strokes_override), scorecardRows (7), formatGate-transisjoner, gameBundle v-mismatch; 1 Type C per ny skjerm (Leaderboard-stableford, Hole-greensome-tap). Exhaustiveness: never-guard kompilerer (app-tsc exit 0) + default-gren-test med maskert kind.
- [x] 2. **Stableford-leaderboard live:** Byneset-spillet (9df7b9e0) i simulator viser poeng-tabell konsistent med delt motor (stikkprøve mot `computeLeaderboard`-output for samme input); ekstern score-endring via RPC oppdaterer tabellen uten reload (realtime-piggyback). Evidens: skjermbilder + service-role-les.
  - *Evidens:* (21:46, simulator) Byneset 9df7b9e0 viser poengtabell: rangert, «27 poeng / 12 hull» øverst (meg, uthevet) — motoren regnet alt fra bundle+lokal DB. Realtime-piggybacken på Leaderboard-skjermen er live-bevist på greensome-duellen (21:45): ekstern RPC → «1up» uten reload innen sekunder (samme skjerm/abonnement for alle former).
- [x] 3. **Greensome ende-til-ende (Must, revidert fra scramble):** service-role-rigget AKTIVT greensome_matchplay-spill (2×2, e2e-spiller som kaptein på side 1, side-CH 14 vs 18 → høyside +4) — appen viser ETT kort per side på hull-siden med motor-derivert «+N» (per-side extra fra `holes[]`-radene); tasting skriver til kapteinens rad på staging (service-role-les av `user_id`); leaderboardet viser duell-status; Lever-knappen er erstattet av web-henvisning. *Bonus (levert Could):* samme mekanikk stikkprøves på det riggede texas_scramble-spillet (lag-kort + teamHandicap-badge). Evidens: skjermbilder + service-role-les.
  - *Evidens:* (21:43–21:48, rigget spill abf1d897, side-CH 14 vs 18): hull-siden viser ETT kort per side («Lag 1 · Test, Bjørn (ditt lag)» / «Lag 2 · Kari, Petter»); hull 4 (SI 1) viser «+1» KUN på høysiden (motor-derivert per-side extra); tasting landet på kapteinens rad (service-role: eneste scores-rad = user_id 252e1a6f, entered_by=me); scorekortet viser lagradene m/ motor-netto og gate-teksten «Levering av lagkort gjøres på nettsiden ennå» i stedet for Lever; leaderboardet viser duellen. Lag-lås: Bjørn rigget levert → mitt GameHome viste «Kortet er levert og godkjent» (lagets stempel). *Bonus (levert Could):* scramble-spillet viser lag-kort m/ «+1» på begge lag (teamHandicap 8/8 via motor). Rigg nullstilt etterpå.
- [x] 4. **Matchplay-status:** i et aktivt singles_matchplay-spill (eksisterende TEST-Cup) viser leaderboardet begge sider, per-hull W/L/T-stripe og korrekt holes-up-status mot motorens fasit; foursomes-rigget spill viser side-kort med delt rad-føring. Evidens: skjermbilder.
  - *Evidens:* (21:54, singles TEST-Cup ae930e68): begge sider m/ navn, «2up — Test Admin 2up etter 7 hull», W/T/W/T/L/T/W-stripe for de 7 avgjorte hullene — alt fra motorens holes[]/holesUp. Foursomes-familiens side-kort + delt rad-føring er bevist via greensome (samme kind foursomes_matchplay, kriterium 3); TEST-N4-Foursomes-spillet står rigget som ekstra-rigg.
- [x] 5. **Gate-endringene:** wolf/BBB-spill viser gate-tekst (ingen føring, ingen leaderboard); scramble/alternate-shot er åpne; patsome/segment/derived fortsatt gatet — jest-låst i formatGate-suiten + simulator-stikkprøve på ett wolf-spill hvis et finnes på staging (ellers kun jest).
  - *Evidens:* formatGate-suiten låser alle transisjoner (scramble+alternate-shot åpne; wolf/BBB gatet; patsome/segment/derived gatet); app-tsc grønn. Ingen wolf-spill med e2e-spilleren på staging → simulator-stikkprøven bortfaller per kriteriets «ellers kun jest». Valg-UI-slicen bokført som Must-issue #1832.
- [x] 6. **Reveal-modus:** service-role-flipp av `score_visibility` til 'reveal' på et aktivt testspill → appen skjuler netto/poeng (brutto-visning) og matchplay viser ingenting; flipp tilbake gjenoppretter. Evidens: skjermbilder før/etter.
  - *Evidens:* (21:47–21:48) Byneset flippet til reveal → banner «Runden spilles blindt …» + KUN brutto-kolonner i roster-rekkefølge (ingen poeng/rank); greensome flippet → matchplay viser INGENTING («Resultatet avsløres når runden avsluttes»); flipp tilbake gjenopprettet full duell («1up» + W-stripe). Skjermbilder i økta; begge spill tilbake på live.
- [ ] 7. **Web urørt + porter + runbook + iPhone:** diff-scope som N3 (`lib/` null diff); alle Gates grønne; runbook-seksjon for N4 (leaderboard, gate-endringene, seed-oppskriften); eier-tapptest på fysisk iPhone (greensome-føring + leaderboard, revidert fra scramble). Eier utilgjengelig → `VERIFICATION GAP` + restanse.
  - *Delvis:* diff-scope verifisert (kun `native/app/**` + docs/forge; `lib/` null diff), alle Gates grønne, runbook-seksjonen skrevet (inkl. seed-oppskrift og OTP-fiks). **Restanse: eier-tapptesten på fysisk iPhone** — N4-bygget installeres på enheten av økta; boksen krysses først etter eier-bekreftelse. Merk delt-simulator-læringen: 820CA940 ble overtatt av #1830-øktas bygg midt i verifiseringen (samme bundle-id); N4-verifiseringen ble fullført på 498CF5EF med autonom OTP-innlogging.

## Gates

- [x] `npx jest` i `native/app/` grønt — 16 suiter / 183 tester, exit 0
- [x] `npx tsc --noEmit` i `native/app/` grønt — exit 0
- [x] `npx expo export --platform ios` grønt (`dist/` slettes etterpå) — exit 0, 1000 moduler / 2.9 MB
- [x] `npm run typecheck` (rot) grønt — exit 0
- [x] `npx vitest run lib/sync lib/scoring` grønt (uendret antall) — 1303 passed, exit 0 m/ pipefail
- [x] `npm run build` (rot) grønt før PR — exit 0 (hovedøkta 21:44)
- [x] `npx eslint native/app` grønt — exit 0

## Files Likely Touched

- `native/app/src/screens/Leaderboard.tsx` + `src/components/leaderboard/*` — ny skjerm + form-renderere
- `native/app/src/lib/scoringContext.ts` — ScoringContext-adapter (ny)
- `native/app/src/lib/formatGate.ts` — gate-endringene
- `native/app/src/lib/teamRoster.ts` (el.l.) — lag-kort-bygging m/ delte captain-hjelpere
- `native/app/src/screens/{GameHome,Hole,Scorecard}.tsx` — lag-kort, badge fra motor, lever-gate, leaderboard-lenke
- `native/app/src/data/gameBundle.ts` — payload v-bump + nye felt
- `native/app/src/**/*.test.ts(x)` — nye suiter
- `docs/native/app-spike.md` — N4-seksjon
- `.forge/contracts/native-n4-leaderboards.md` — denne

## Out of Scope

- Wolf/BBB valg-UI + datafetch (egen slice, bokføres som issue); patsome; Layout B-scorekort i app; podium-/reveal-seremoni-polish; «Hull for hull»-drilldown; side-turneringer (LD/CTP); cup-/liga-etiketter og segment-spill (N5); team-submit-RPC (egen DB-kontrakt); ikke-deltaker-visning av ferdige spill; arrangørflater (N6); push (N7).
- Deferred fra tidligere: plattformnøytral sync-refaktor; expo-router-revurdering (N7).
