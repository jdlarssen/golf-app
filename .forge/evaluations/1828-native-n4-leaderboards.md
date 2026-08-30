# Evaluering: #1828 Native N4 — leaderboards + format-familiene

- **Kontrakt:** `.forge/contracts/1828-native-n4-leaderboards.md` (inkl. MoSCoW-scope-revisjon 2026-08-30: greensome = Must, scramble = levert Could, wolf/BBB gatet m/ #1832 bokført)
- **Branch:** `claude/n4-leaderboards-formatfamilier` @ `156e1638`
- **Evaluator:** fersk-kontekst subagent, 2026-08-30 ~22:00
- **Metode:** alle porter re-kjørt uavhengig; kode lest med fil:linje; staging lest read-only med service-role; simulator 498CF5EF skjermdumpet (820CA940 ikke rørt)

## Porter (re-kjørt av evaluator)

| Port | Resultat | Exit |
|---|---|---|
| `npx jest` (native/app) | 16 suiter / 183 tester passed | 0 |
| `npx tsc --noEmit` (native/app) | grønn | 0 |
| `npx eslint native/app` (rot) | grønn | 0 |
| `npm run typecheck` (rot) | grønn | 0 |
| `npx vitest run lib/sync lib/scoring` (rot, pipefail) | 55 filer / 1303 passed | 0 |
| `npm run build` (rot) | HOPPET OVER — bevist i hovedøkta, akseptert per evaluerings-instruks | — |
| `npx expo export --platform ios` | HOPPET OVER — bevist i hovedøkta, akseptert per evaluerings-instruks | — |

Tallene matcher kontraktens påstander eksakt (16/183 jest, 1303 vitest).

## Diff-scope

- `git diff origin/main...HEAD --name-only` (three-dot, branch-only): KUN `native/app/**`, `docs/native/**`, `.forge/**`. Filen `docs/superpowers/specs/...` i two-dot-diffen er den ENE innkommende origin/main-committen (`546005f0`), ikke branch-arbeid.
- `git diff origin/main -- lib/` = **0 linjer**. Web-fredningen holder.
- N2-datalaget: `writeScore.ts`, `syncWorker.ts`, `db.ts`, `realtime.ts` har null diff mot origin/main — kun `gameBundle.ts`(+test) endret i `data/`.

## Per-kriterium

### 1. Adapter + renderere jest-låst — **PASS**

- Jest re-kjørt: 16 suiter / 183 tester, exit 0. Nye suiter bekreftet i kjøringsloggen: scoringContext, leaderboardModel, teamPlay, scorecardRows, formatGate, gameBundle, Leaderboard, Hole.
- Exhaustive never-guard finnes to steder og kompilerer (app-tsc exit 0): `scoringContext.ts:348–353` (mode-switch) og `ResultView.tsx:295–302` (kind-switch, med rolig fallskjerm-tekst).
- Default-gren-test med maskert kind: `Leaderboard.test.tsx:226` (`kind: 'lasersnooker' as unknown as ModeResult`).
- scoringContext-suiten dekker mapping (frosset CH/lag/tee-kjønn, par per kjønn), strokes→gross med ALLE rader, withdrawn-filtrering, tom-tilstand, delegering til delte hjelpere, og problem-propagering uten motor-kall (`scoringContext.test.ts:88–277`).

### 2. Stableford-leaderboard live — **PASS**

- Byneset-spillet verifisert på staging: id `9df7b9e0-dcfb-446a-afd1-d0a8dc8029f0`, stableford, active, `score_visibility='live'`.
- Realtime-mekanikken kodeverifisert: `Leaderboard.tsx:57–67` rir på eksisterende `subscribeGameScores` (ingen ny kanal), hver merge → `reload()` → recompute fra lokal DB. Regnestykket går via `computeGameLeaderboard` → delt motor (`scoringContext.ts:362–369`).
- Simulator-live-beviset (27 poeng / realtime-oppdatering) er hovedøktas; jeg bekreftet at appen kjører og rendrer på 498CF5EF (skjermdump 22:01) og at kodeveien og staging-tilstanden stemmer med evidensen.

### 3. Greensome ende-til-ende (Must) — **PASS**

- **Staging-fasit (service-role-les):** spill `abf1d897-a5a7-4c85-bfd5-6e3e1d749a66` (TEST-N4-Greensome, greensome_matchplay, active) har NØYAKTIG to scores-rader, begge hull 1, begge kaptein-eide: `252e1a6f…` strokes 3 (lex-min på lag 1 vs `5a821331…`) og `20aa36ea…` strokes 5 (lex-min på lag 2 vs `5dc4f82e…`). `game_players.submitted_at`/`approved_at` = null for alle fire — riggen er nullstilt som påstått.
- **Kaptein-ruting delt:** `teamPlay.ts:23–24` importerer `scoredHoleNumbers`/`teamScoreOwnerId` fra `lib/games/`; skriv rutes via `scoreOwnerForHole` i `Hole.tsx:236,242`; kortet leser kapteinens rad (`Hole.tsx:214`).
- **Ingen lokal handicap-formel:** grep etter 0.6/0.4/allowance-aritmetikk i `native/app/src` gir kun styling-konstanter (`Table.tsx:99` letterSpacing, `Hole.tsx:525` opacity). Badgen hentes fra motor-output (`teamPlay.ts:173–196`: `teamHandicap`+`strokesForHole` for scramble, `side1Extra`/`side2Extra` for alternate-shot), `null` på `{ok:false}` — aldri gjettet 0.
- **Helt trukket lag utelates:** `teamPlay.ts:90–91` (captainId null → continue), test `teamPlay.test.ts:140`.
- **Putts-only sender aldri strokes:** `Hole.tsx:176–182` (kun `putts` i payload, kommentert hvorfor).
- **Lever-gate:** `Scorecard.tsx:204–206` viser «Levering av lagkort gjøres på nettsiden ennå» i stedet for knappen; `canSubmit` ekskluderer teamMode (linje 132–133). Lagets stempel fra ETT medlem: `teamPlay.ts:54–63` (`firstStamp`), test :171.
- **Test gjennom EKTE motor:** `teamPlay.test.ts:20` importerer `computeGameLeaderboard`; greensome-fiksturer inkl. `team_strokes_override` (:436–448).
- Greensome-config på staging matcher delt type (`allowance_pct` finnes, `types.ts:507/522/550`).

### 4. Matchplay-status — **PASS**

- `MatchView`-wiring for alle tre matchplay-kinds i `ResultView.tsx:235–286` (greensome/chapman/gruesome dekkes av foursomes_matchplay-grenen, som motoren foreskriver).
- Stripe/stilling er rene funksjoner over motor-output: `matchStrip` (kun spilte hull), `matchStanding` (`holesUp`/`result.formatted`/`runningStatusLabel`) — ingen egen «hvem leder»-formel (`leaderboardModel.ts:93–156`).
- Singles-spillet `ae930e68…` finnes på staging med scores (sett i hull 2-spørringen). Skjermbilde-evidensen er hovedøktas; kodeveien og datagrunnlaget bekreftet.

### 5. Gate-endringene — **PASS**

- `formatGate.ts:35–39`: `GATED_MODES = ['wolf','bingo_bango_bongo','patsome']`; segment-testen er `holeSegment !== 'full'` (:57); derived (:58). ÉN funksjon (`gateReason`) bak både `isScoringSupported` og alt annet.
- Leaderboard-lenken følger samme gate: `GameHome.tsx:86` (`gateReason`) → `supported` gater både Scorekort- og Resultater-knappen (:141–162), og `Leaderboard.tsx:108–110` re-sjekker `gateReason` i dybden.
- `formatGate.test.ts` låser transisjonene per familie med `it.each` (scramble + alternate-shot åpne, wolf/BBB/patsome stengt).
- Restanse-issuet **#1832 er opprettet og OPEN** («Native — wolf/BBB valg-UI i appen»). Ingen wolf-spill med e2e-spilleren på staging → simulator-stikkprøven bortfaller per kriteriets egen «ellers kun jest»-klausul.

### 6. Reveal-modus — **PASS**

- **Kodebeviset er sterkere enn skjermbilder:** i `LeaderboardBody` avgjøres visibility FØR motoren kalles — i `hidden`-grenen kjøres `computeGameLeaderboard` aldri, så det finnes ingen netto/poeng-data i render-treet (`Leaderboard.tsx:112–137`). `gross-only` regnes fra lokale slag i roster-rekkefølge, bevisst IKKE fra motor-resultatet (`leaderboardModel.ts:213–243`), kolonner = navn/brutto/hull.
- Delte predikater: `revealState`/`shouldHideNetto` fra `lib/games/visibility` + `isMatchplayFamily` (`leaderboardModel.ts:8–47`).
- Begge testspill står tilbake på `'live'` på staging (greensome abf1d897 + Byneset 9df7b9e0) — flipp-tilbake-påstanden bekreftet i DB.

### 7. Web urørt + porter + runbook + iPhone — **PARTIAL (som bokført)**

- Diff-scope ✓ (over), `lib/` 0 linjer ✓, alle porter grønne ✓ (re-kjørt).
- Runbook-N4-seksjonen finnes (`docs/native/app-spike.md:250–313`). Tre påstander stikkprøvd mot kode/staging:
  1. **OTP-oppskriften** (magiclink-type, kode i `email_otp`-feltet, mint ETTER appens egen sending) matcher `Login.tsx`-flyten eksakt (`signInWithOtp` :24 → `verifyOtp({type:'email'})` :39–42).
  2. **Gate-lista** (wolf/BBB gatet til #1832, greensome Must / scramble levert Could) matcher `formatGate.ts`.
  3. **Seed-oppskriften**: greensome-configen i runbooken er tegn for tegn det som ligger på det riggede spillet i staging, og alle feltene finnes i delt type.
- **Restansen står:** eier-tapptest på fysisk iPhone er ikke utført. Ærlig bokført i kontrakten med udekket boks — kompatibelt med ACCEPT per evalueringsinstruksen.
- Simulator 498CF5EF viser N4-appen live på greensome-spillet (skjermdump 22:01: lagroster Lag 1/2, Resultater-knapp, lag-stempel-banner).

## Findings

| # | Fil | Kriterium | Alvorlighet | Beskrivelse |
|---|---|---|---|---|
| F1 | `docs/native/app-spike.md:204–209` | 7 | Lav (docs) | N3-seksjonen «### Format-gaten» beskriver fortsatt N3-tilstanden («lag-kollapsede formater … henvises til nettsiden») som N4 opphevet. N4-seksjonen sier det nye sanne, men en leser som stopper i N3-seksjonen kan misledes. Én setnings-oppdatering («opphevet i N4, se under») rydder det. |
| F2 | Simulator-observasjon | 3 | Info | Skjermen på 498CF5EF viser «Kortet er levert og godkjent» fra den CACHEDE bundelen selv om riggen er nullstilt i DB (submitted_at null). Forventet stale-while-revalidate-oppførsel, ikke en feil — neste refetch retter det. Ingen handling. |
| F3 | `scoringContext.ts:210–247` | — | Info (akseptert avvik) | `buildUniformContext`-duplikatet er en tro kopi av webbens (`buildModeResultForGame.ts:302–341`; withdrawn-filtrering skjer oppstrøms i appen med samme netto-effekt, `users`-avviket er dokumentert og korrekt for bundle-formen). Bokført som #1831 (OPEN). |

Ingen funn på Medium+ nivå. Ingen kontraktsbrudd.

## Verdikt

Alle porter grønne re-kjørt uavhengig; kriterium 1–6 PASS med egen evidens; kriterium 7 PARTIAL nøyaktig slik kontrakten ærlig bokfører (eier-tapptest på fysisk iPhone gjenstår, restansen er eksplisitt). Scope-revisjonen er fulgt: greensome er bevist som Must-mål, scramble bokført som levert Could, wolf/BBB-gaten står med #1832 opprettet.

**ACCEPT**
