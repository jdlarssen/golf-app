# Native app-spike (N1 #1818, N2 #1823, N3 #1825, N4 #1828) — runbook

Frittstående Expo-app i `native/app/` som beviser fundamentet for epic #1816:
delt `lib/scoring`-kilde med webappen, Supabase-OTP-innlogging mot staging
(N1), et lokal-først datalag med sync-kø og realtime (N2) og spillerflatene
hjem → game-home → hull-føring → scorekort → lever/godkjenn (N3). Dette er
IKKE produkt-appen ennå — men fra N3 er det flatene spillerne skal arve.

## Arkitektur-beslutninger (kontrakt på [#1818](https://github.com/jdlarssen/golf-app/issues/1818))

- **Ingen npm-workspaces.** Appen er et selvstendig npm-prosjekt (samme mønster
  som `native/ios/`-skallet); repo-rota og Vercel-bygget røres ikke. Deling
  skjer via Metro `watchFolders` mot repoets `lib/` + tsconfig-paths for
  `@/*`-aliasene inni scoring-grafen (Expo leser paths automatisk).
- **AsyncStorage som session-lager** (offisiell Supabase RN-oppskrift);
  SecureStore-herding er bevisst utsatt til senere etappe.
- **Dev bundle id `no.tornygolf.dev`** — kolliderer aldri med TestFlight-skallet
  (`no.tornygolf.app`). Produkt-appen arver skallets id først ved butikk-byttet
  (N8 i #1816).

## Oppsett

```bash
cd native/app
source ~/.nvm/nvm.sh && nvm use 22
npm install
```

Env (gitignorert — repoet er offentlig, aldri commit nøkler):

```bash
# native/app/.env.local — verdier fra repo-rotas .env.staging.local
EXPO_PUBLIC_SUPABASE_URL=<staging-URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<staging anon-key>
```

## Kjøring

```bash
# Simulator (dev, med Metro):
npm run ios

# Simulator (Release, selvstendig bundle — brukt til spike-verifiseringen):
npx expo prebuild --platform ios --no-install
(cd ios && LANG=en_US.UTF-8 pod install)
(cd ios && xcodebuild -workspace TrnyDev.xcworkspace -scheme TrnyDev \
  -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build)
xcrun simctl install booted ios/build/Build/Products/Release-iphonesimulator/TrnyDev.app
xcrun simctl launch booted no.tornygolf.dev

# Fysisk iPhone (team 8C8WCW67J9; enheten koblet til / parret):
npx expo run:ios --device --configuration Release
```

Fallgruver:

- **Expo SDK 57 krever Xcode 26.4+** (offisiell støttetabell). Med eldre Xcode
  feiler `expo-modules-jsi`-rammeverksbygget på Swift-interop-sjekker
  (`SWIFT_RETURNS_RETAINED` på `RuntimeScheduler`) — det er versjonskravet,
  ikke en kodefeil. Oppdater Xcode via App Store; ikke patch modulen
  (frarådet oppstrøms).
- `pod install` krever `LANG=en_US.UTF-8` (CocoaPods 1.17 + Ruby 4 kræsjer
  ellers).
- **`expo-sqlite` og `expo-network` er native moduler** (N2, #1823), og
  N3 (#1825) la til `react-native-screens` + `react-native-safe-area-context`
  (navigasjonen). Et eksisterende `ios/`-bygg kjenner dem ikke — kjør
  `npx expo prebuild` + `pod install` + nytt xcodebuild etter at de kom inn,
  ellers krasjer appen ved oppstart eller første DB-kall. `npx expo export`
  bundler fint uten rebuild, så JS-porten fanger ikke dette.
- `ios/`-mappa er prebuild-output og gitignorert — regenerer den heller enn å
  redigere den.
- Rot-`tsconfig.json` ekskluderer `native/` — React Natives globale typer
  (egen `FormData` m.fl.) forgifter ellers DOM-typene i hele web-programmet.
  Fjern aldri den exclude-linjen.

## Innlogging (staging)

Samme autonome mønster som web-e2e (CLAUDE.md «Testing — staging»): mint kode
via service-role REST `POST <staging-URL>/auth/v1/admin/generate_link` med
`type: "magiclink"` — koden ligger som **`email_otp`-felt i svaret** (dagens
GoTrue avviser `type: "email_otp"` som request-type; verifisert 2026-08-30).
Tast e-post → «Send meg kode» → minted kode → «Logg inn». Mint koden ETTER at
appen har sendt sin egen (siste OTP vinner). Staging-koder validerer kun mot
staging. E-postfeltet: simctl pbcopy + Paste-menyen (tekstinjeksjon radbrekker
`+`/`@`); selve koden er sifre og kan tastes rett inn.

## Datalaget (N2, #1823)

Lokal-først: tastingen treffer SQLite på enheten og er ferdig; sync mot staging
skjer i bakgrunnen mot nøyaktig samme server-kontrakt som webben bruker
(`upsert_score_if_newer`, LWW på `client_updated_at`).

### Delt kilde vs. speilet kode

Web-appens sync-motor er Dexie- og DOM-bundet og kan ikke kjøre i appen. Skillet
er derfor bevisst:

| Kommer rett fra repo-kilden (`lib/sync/`) | Speilet i `native/app/src/data/` |
| --- | --- |
| `conflict.ts` — `resolveConflict`, `conflictRecordFor` | `db.ts` — expo-sqlite i stedet for Dexie |
| `classifyError.ts` — `syncRetryDecision` | `writeScore.ts` |
| `queueScope.ts` — `isActiveForGame` | `syncWorker.ts` (drain-rekkefølgen) |
| Typene `LocalScore`/`SyncQueueItem`/`ConflictRecord` (type-import) | `realtime.ts` (kanal + merge) |

Alle avgjørelser som kan gå galt — hvem vinner en konflikt, fortjener en
overskriving et varsel, skal et feilet kø-element gis opp — bor ÉTT sted, i
repo-kilden. Bare rekkefølgen rundt dem er speilet. `lib/sync/` har null diff
fra N2; trenger en etappe å endre noe der, er det en egen beslutning.

Type-import er runtime-fri (babel stripper `import type`), så Dexie følger aldri
med i app-bundelen — verifiserbart med `grep -i dexie` mot `dist/`-bundelen etter
`npx expo export`.

### Lokalt skjema (`torny.db`, `PRAGMA user_version = 1`)

| Tabell | Nøkkel | Merk |
| --- | --- | --- |
| `scores` | `${gameId}:${userId}:${holeNumber}` | Speiler `scoreKey`; `strokes`/`putts` nullbare, `server_updated_at` null til første vellykkede sync |
| `sync_queue` | = score-id | Ny tasting på samme hull ERSTATTER elementet; `created_at = client_updated_at` gir køens rekkefølge; `abandoned_at` = karantene (#668) |
| `conflicts` | = score-id | Skrives når en server-verdi overskrev et tall tastet på denne enheten |

Kolonnene er snake_case, typene camelCase; mappingen bor kun i `db.ts`.
Journalmodus er WAL — `withExclusiveTransactionAsync` skriver på en egen
forbindelse, og bare WAL lar lesinger fortsette mens den låsen står. `withTxn`
serialiserer transaksjonene, ellers ville to overlappende gitt «database is
locked».

### Triggere for drain

Speil av webbens `startSyncListener`, med appens egne signaler:

- **expo-network** — `isConnected` flipper til true (på iOS er
  `isInternetReachable` bare et ekko av `isConnected`, så `isConnected` ER
  signalet)
- **AppState** — appen kommer i forgrunnen
- **30 s-intervall**
- **Oppstart** — én drain når triggerne startes

En tasting drainer med vilje IKKE — samme som på web. Køen skal være synlig
til en trigger tømmer den.

### Realtime

Én kanal per spill (`postgres_changes`, `event: '*'`, filter
`game_id=eq.<id>` på `scores`). #1366-disiplinen er ufravikelig og speilet i
`realtime.ts`: argumentløs `await supabase.realtime.setAuth()` FØR hver
`subscribe`, per kanalbygg; statuscallback; ny kanal etter 3 påfølgende
`CHANNEL_ERROR`/`TIMED_OUT` med backoff; retries parkert mens enheten er
offline. Send aldri tokenet som argument — det skrur av bibliotekets eget
token-vedlikehold, og en runde varer lenger enn et access-token.

Innkommende rad merges kun når `client_updated_at` er strengt nyere enn den
lokale. Ekkoet av enhetens egen skriving har LIK timestamp og droppes derfor
stille — det blir aldri en konflikt.

### Sync-lab (tredje skjerm)

Bak innlogging: «Åpne sync-lab» på hjem-skjermen. Laben velger nyeste AKTIVE
spill spilleren er med i (vanlig RLS-lesing), viser hull 1–3 med −/+ på slag,
og en statusblokk med kø-lengde, siste drain, realtime-status og
konflikt-teller. «Synk nå» tvinger en drain. Alle kontroller har `testID`.

Ingen aktive spill på staging → rolig tom-tilstand, ingen krasj.

### Flymodus-testen (fysisk iPhone)

1. Åpne Sync-laben og la den koble seg opp (realtime: «tilkoblet»).
2. Slå på flymodus.
3. Tast slag på hull 1–3. Tallene skal oppdatere seg UMIDDELBART, og «I kø»
   skal telle opp.
4. Slå av flymodus. Innen ~30 s (eller straks, med «Synk nå») skal «I kø» gå til
   0 og radene si «synket».
5. Verifiser mot staging med en service-role-lesing av `scores` for spillet —
   `client_updated_at` skal være appens tidsstempel.

Realtime motsatt vei: kjør en `upsert_score_if_newer` med service-role utenfra
(nyere timestamp, annet slag-tall) mens laben står åpen — tallet skal bytte i
appen uten reload.

## Spillerflatene (N3, #1825)

Fem skjermer på en `@react-navigation/native-stack` (`src/navigation.tsx`),
bak samme login-gate som før: Hjem → GameHome → Hole/Scorecard/Approve.
Sync-laben lever videre som dev-verktøy — fra #1906 lenket fra utvikler-seksjonen
i profil-rommet, og bare i staging-bygg.

- **Hjem** (`src/screens/Home.tsx`) — «Pågår nå» / «Mine spill» / «Siste
  avsluttede» fra RLS-spørringer (speil av webbens hjem, minus discovery).
  Lista caches i `cache_entries` (`home`) og re-hentes ved fokus.
- **GameHome** — leser `gameBundle`-cachen øyeblikkelig, re-henter i bakgrunnen.
  Primær-CTA-en er webbens `computeState`-maskin speilet i
  `src/lib/primaryCtaState.ts`.
- **Hole** — flighten avgjøres av delt `isSingleFlightGame`-regel (≤4 aktive
  eller wolf = alle; ellers samme `flight_number`); «+N»-badgen kommer fra delt
  `strokesForHole`. Slag- og putte-stepperne skriver via N2s `writeScore`
  (putte-skriv sender IKKE slag med — mergen bevarer det) og drainer etter hver
  tasting, som webben.
- **Scorecard** — webbens Layout A (Hull/Par/SI/Slag/Netto + totaler).
  «Lever»-knappen speiler webbens to porter: drain + kø-vakt (delt
  `isActiveForGame`), og bekreftelses-Alert ved manglende hull.
- **Approve** — lista fra delt `pendingApprovalsFor`; godkjenn/avvis er rene
  `game_players`-oppdateringer under 0106-policyen.

### Format-gaten

**⚠️ Modus-lista under er N3-tilstanden — erstattet av N4 (#1828), se
«Format-gaten» i N4-seksjonen.** Selve segment-regelen består: `hole_segment`
er NOT NULL med default `'full'` — gaten tester `!== 'full'`, aldri «er satt»
(et vanlig spill står alltid som `'full'`).

### Datalag v2

`PRAGMA user_version = 2` legger til `cache_entries (key, payload, fetched_at)`
— JSON-cache for spill-bundler (`game:<id>`, via `src/data/gameBundle.ts`) og
hjem-lista (`home`). Migrasjonen er additiv; N2-data overlever.
`src/data/seedScores.ts` (`seedGameScores`) erstatter SyncLab-ens gamle
hull 1–3-seed: ALLE spillets scores går gjennom `mergeServerScore`, så LWW
forblir eneste vei server-data kommer inn lokalt. `src/data/playerActions.ts`
(lever/godkjenn/avvis) speiler webbens server-action-guards og asserter
radantall med delt `expectAffected` (`lib/supabase/affectedRows.ts`) — en
0-raders UPDATE er en synlig feil, aldri stille suksess. Merk: skriv fra appen
sender INGEN notifikasjoner (webbens server actions eier dem) — bokført gap
mot N7.

### Test-harnessen (jest-expo)

```bash
cd native/app && source ~/.nvm/nvm.sh && nvm use 22
npx jest            # hele suiten
npx jest writeScore # én suite
```

`jest.config.js` bruker `preset: "jest-expo"` og mapper `expo-sqlite` →
`src/test/sqliteMock.ts`: en adapter over better-sqlite3 (in-memory) som
implementerer nøyaktig subsettet appen bruker — ekte SQL-semantikk i test,
ingen håndlaget fake. (better-sqlite3 avviser `$`-prefiksede bind-nøkler;
adapteren stripper prefikset, appens SQL kjører uendret.) `@/*`-aliasene i
delt kode mappes til repo-rota. `src/test/supabaseMock.ts` har chainbare
stubs for `from`/`rpc`. TypeScript 6 auto-inkluderer ikke `@types/` lenger —
`"types": ["jest", "node"]` i tsconfig er derfor lastbærende.

### Godkjenn-testen mot staging

Godkjenn krever et levert kort fra en flight-makker. Rigg med service-role:
sett makkerens `game_players.submitted_at` (`is.null`-filter så det er
idempotent), åpne spillet i appen → «Godkjenn (1)» → godkjenn/avvis, og
verifiser kolonnene med en service-role-lesing etterpå. Selv-godkjenning
stoppes av 0106-triggeren.

## Leaderboards + lag-føring (N4, #1828)

MoSCoW-revisjonen (epic #1816, 2026-08-30) styrer scope: Must er de 8 brukte
formatene; greensome er Must-målet for lag-mekanikken, scramble-familien er
levert som Could-biprodukt av samme kode. Wolf/BBB er gatet til valg-UI-slicen
(#1832) står.

### Leaderboard-skjermen

`src/screens/Leaderboard.tsx` (lenket fra GameHome, «Resultater») bygger
`ScoringContext` fra bundle + lokal DB via `src/lib/scoringContext.ts`
(`computeGameLeaderboard`) og rendrer delt `computeLeaderboard`-output per
`kind` — tabellformer, duell-status for matchplay (holes-up, W/L/T-stripe,
«3&2»-resultat) og potter (skins/nassau). Exhaustiveness er kompilehåndhevet;
en ukjent/gatet kind faller i en rolig default-gren. Reveal-modus respekteres
via delt `lib/games/visibility.ts`: matchplay skjuler ALT under reveal-active,
øvrige viser kun brutto. Realtime rir på det eksisterende
`subscribeGameScores`-abonnementet — aldri en ny kanal.

Merk: appens leaderboard er for deltakere/admin. Webbens «alle innloggede kan
se ferdige spill» krever service-role (#1542/#1632) og forblir web.

### Lag-føring (kollapsede formater)

`src/lib/teamPlay.ts` er appens ene hjem for lag-reglene, og ALT delegerer til
delt kilde: `modeCollapsesToTeamCard` avgjør kollaps per hull,
`teamScoreOwnerId` velger kaptein (leksikografisk minste aktive),
`scoreOwnerForHole` ruter skrivingene til kapteinens rad. «+N»-badgen hentes
fra MOTOR-output (`teams[].teamHandicap` for scramble via `strokesForHole`;
per-side `side1Extra`/`side2Extra` fra `holes[]` for alternate-shot) — det
finnes bevisst INGEN handicap-formel i appen (webbens hull-side har alt en
duplikat; en tredje kopi var forbudt i kontrakten). Ukjent allokering → ingen
badge og «—» i netto, aldri gjettet 0.

Lever for kollapsede formater går gjennom app→server-ruta
`POST /api/games/{id}/submit-team` (#1918, se §«App→server-ruter»): webbens
team-submit skriver hele lagets rader med service-role, og appen kan bare egen
rad under RLS — et halv-levert lag ville blokkert avslutning. Fram til #1918
var knappen derfor en lenke til nettsiden; nå er det samme kjerne bak begge.

### Rigge testspill på staging (service-role)

Fasongen speiler `e2e/_helpers/games.ts:seedFinishedModeGame`, men med
`status:'active'`: insert i `games` (name/course_id/tee_box_id/status/
game_mode/mode_config/created_by) → `game_players` (user_id/team_number/
flight_number 1/course_handicap/accepted_at). Greensome-config:
`{"kind":"greensome_matchplay","team_size":2,"teams_count":2,"allowance_pct":100}`.
Gi sidene ulik side-CH (60/40-blanding) så høysiden får synlige ekstra slag.
⚠️ Bruk FULLE user-id-er lest fra DB — trunkerte prefikser fra terminal-
utskrift er ikke id-er. Kaptein = leksikografisk minste id på laget; vil du at
e2e-spilleren skal taste, må hen være kaptein.

### Porter

```bash
# I native/app/ (Node 22):
npx jest
npx tsc --noEmit
npx expo export --platform ios   # slett dist/ etterpå
# I repo-rota:
npm run typecheck
npx vitest run lib/sync lib/scoring
npx eslint native/app
```

## Design-fundamentet (#1830)

Fraunces/Inter og lys/mørk token-splitt, lagt ADDITIVT oppå N3-theme-fila av
hensyn til N4-parallellen (#1828) — `COLORS`, `TAP` og `ui` beholdt navn og
nøkler; skjermkonvertering er egen oppfølger.

- **Fonter:** seks snitt (Fraunces 500/600, Inter 400/500/600/700) via
  `useFonts` i `App.tsx`; splashen står til fontene OG sesjons-sjekken er
  ferdig (`expo-splash-screen`), så kaldstart aldri viser systemfont-blits.
  Font-feil slipper appen videre på systemfonter.
  - **Felle:** importér snittene fra per-vekt-subpath
    (`@expo-google-fonts/inter/400Regular`) — pakke-rotas index require-er
    ALLE snitt og kursiver (~15 MB TTF inn i bundelen).
  - **Felle:** expo-font registrerer én familie per snitt — `fontWeight`
    velger ikke snitt for custom-fonter (Android fake-bolder, iOS faller
    tilbake). Bruk `FONTS`-tokenene fra `theme.ts`, aldri `fontWeight` oppå
    en custom familie.
- **Tokens:** `theme.ts` eksporterer `PALETTES` (lys = N3-verdiene
  bit-identisk; mørk = webbens klubbhus-natt fra `app/globals.css`), `FONTS`,
  `Scheme`/`ThemeColors`/`Theme` og `useTheme()` (via `useColorScheme`; null/
  `'unspecified'` → lys). Per-scheme `StyleSheet`-varianter bygges én gang på
  modulnivå; `ui` er lys-varianten. `theme.test.ts` låser rolle-mapping og
  nøkkelsett-paritet.
- **Mørk modus-mekanismen:** `app.json` har `userInterfaceStyle: "automatic"`
  (sto på `"light"` — det LÅSTE appen til lys) + splash-plugin med mørk
  bakgrunnsvariant. Skjermene er fortsatt lyse til konverterings-oppfølgeren
  tar dem (StatusBar står derfor bevisst på `style="dark"` inntil videre).
- **Native modul-fella igjen:** expo-font/expo-splash-screen er native
  moduler — prebuild + pod install + nytt xcodebuild før simulatorbevis.

## Wolf/BBB valg-UI (#1832)

Format-gaten er åpnet for `wolf` og `bingo_bango_bongo` — `GATED_MODES` i
`src/lib/formatGate.ts` inneholder nå kun `patsome`. Åpningen gjør også
wolf-/BBB-scorekort levérbare fra appen (per-spiller-rader, samme lever-flyt
som web — tilsiktet).

### Valg-semantikken

- **Datalag:** `src/data/choices.ts` — fetch (`fetchWolfChoices`/
  `fetchBingoBangoBongoHoles`, select-lister speiler webbens
  `getWolfChoices`/`getBingoBangoBongoHoles`, snake→camel til de delte
  scoring-typene) + validerte skriv (`setWolfChoice`/`setBingoBangoBongoHole`)
  som direkte RLS-upserts med trap 2-vern (`.select()`-kjeding, 0 rader =
  typet feil). Valideringene speiler webbens server actions: wolf har INGEN
  finished-lås (paritet med web v1), BBB avviser skriv når
  `games.status === 'finished'` (status tas inn som parameter fra bundlen —
  RLS håndhever den ikke, appen MÅ speile sjekken).
- **Wolf på Hole-skjermen:** badge via delt `lib/wolf/wolfRotation.ts`
  (flyttet fra webbens hull-mappe i denne slicen — web importerer samme fil).
  Rotasjonslista bygges som webbens `computeWolfContext`: `team_number` =
  rotasjonsslot, INGEN sortering, withdrawn-spillere står i lista (et
  WD-filter ville gitt en annen wolf enn web på trailing-hull — n styrer både
  rotasjonslengden og potten). Trailing-wolf-poeng hentes fra motorens
  `WolfPlayerLine.totalPoints`, aldri egen formel. Valg-UI vises kun for
  wolfen selv, når spillet er `active` og hullet mangler valg (web-paritet:
  ingen «endre valg»-flate i v1).
- **BBB på Hole-skjermen:** tre mottaker-chips (bingo/bango/bongo), åpne for
  alle deltakere. Upserten skriver ALLE tre kolonnene — derfor er kortet
  read-only til fetch har lyktes (et tap i blinde ville nullet de to andre
  kategoriene).
- **Ærlig-note-guardrailen:** har fetch ALDRI lyktes denne skjerm-økta viser
  leaderboardet en «fikk ikke hentet valgene»-note i stedet for en
  all-pending-tabell (adapterens `missing-choices`-problem); tom liste etter
  vellykket fetch er et gyldig mellomresultat. Valgene går ALDRI i
  sync-køen — skriv krever nett (v1-beslutning i kontrakten).

### Polling, ikke realtime

`wolf_hole_choices` og `bingo_bango_bongo_holes` står IKKE i
`supabase_realtime`-publikasjonen (staging + prod) — en
`postgres_changes`-binding leverer ingenting. Henting skjer derfor via
`useGameChoices` (`src/lib/useChoices.ts`): fetch ved fokus + intervall
`CHOICES_POLL_MS = 10 000` mens skjermen er aktiv, umiddelbar refetch etter
egen skriving. De elleve andre modiene fyrer null choice-requests
(`choiceSourceFor()` → null). Oppgradering til realtime krever
publikasjons-migrasjon (egen DB-kontrakt).

### Rigge wolf-/BBB-testspill på staging (service-role)

Samme fasong som greensome-oppskriften over, men:

- **Wolf:** eget spill med 3-5 spillere, `mode_config`
  `{"kind":"wolf"}` + `game_players.team_number` = rotasjonsslot (1..n, unik
  per spiller — slot 1 er Wolf på hull 1). Skal e2e-spilleren være wolf på
  hull h ≤ rotasjonslengden, gi hen slot `((h-1) mod n) + 1`. Valg-rader kan
  seedes/verifiseres direkte i `wolf_hole_choices`
  (`game_id, hole_number, wolf_user_id, choice, partner_user_id, entered_by`;
  PK = game_id+hole_number).
- **BBB:** 2-4 spillere, `mode_config` `{"kind":"bingo_bango_bongo"}`,
  ingen team_number-krav; rader i `bingo_bango_bongo_holes` har nullable
  `bingo_user_id`/`bango_user_id`/`bongo_user_id`.
- ⚠️ Sjekk `mode_config`-fasongen mot et ekte spill i staging-DB-en
  (`select mode_config from games where game_mode = '<mode>' limit 1`) før
  seeding — kolonnen har CHECK-er.

## Sideturnering — LD/CTP + poengjakt (#1850)

Appens resultatskjerm viser nå sideturneringen: LD/CTP-vinnerne og poengjakten
på tvers av de ~45 kategoriene. Ingen DB-endring — SELECT-policyen på
`game_side_winners` (0092:411-427) slipper deltakere gjennom nøyaktig når
`status = 'finished'`, som er det eneste tidspunktet appen trenger radene.

### Finished-gaten er hele regelen

Sideturneringen er et **post-game-reveal-element på web, i alle formater** —
verifisert i `formats/stableford.tsx:115-121`, `formats/skins.tsx:102`,
`renderMatchplaySideSection` (`sideTournament.tsx:265` — `return undefined` når
ikke finished) og best_ball-fallthrough i `leaderboardContent.tsx:516-529`.
Appen speiler det: en AKTIV runde viser ingenting side-relatert, uansett hva
`side_tournament_enabled` sier, og fyrer ikke fetchen heller.

Seksjonen rendres når **alle tre** holder: `status === 'finished'`,
`sideTournamentEnabled`, og `gateReason(game) === null`.

### `position` er en hull-slot, ikke en plassering

Den viktigste fella i denne tabellen. `game_side_winners.position` = **hvilket
LD-/CTP-hull** (1 eller 2), ikke medaljerang. Samme spiller kan derfor stå på
BEGGE slots og få 2p × 2. Linjene skrives alltid med slot-nummer
(«Lengste drive #1: Karl», «Lengste drive #2: Karl») — aldri «1. plass».
Slots uten kåret vinner (`winner_user_id = null`, arrangøren valgte «ingen
kvalifiserte») hoppes stille over.

### Grouping utledes, den hardkodes ikke

`teamGrouping` speiler webbens per-renderer-valg, men appen spør den delte
kilden i stedet for å føre en modus-liste: stableford-familien følger motorens
`variant` (`team` → `byTeamNumber`, `solo` → `solo`), og de delte
familie-predikatene avgjør resten. `modified_stableford` har ingen egen regel —
den rutes gjennom samme renderer som `stableford` og arver grenen der.

Én visningsregel henger sammen med dette: **et lag med nøyaktig ett medlem viser
spillerens navn, ikke «Lag N»** (`SideTournamentView.tsx:247-256`). Derfor viser
et singles-matchplay-spill spillernavn selv om grupperingen er `byTeamNumber`.

### Copy uten 344 KB JSON

Webbens etiketter bor i `messages/no.json` under `leaderboard.sideTournament`
(48 awards + 6 grupper) og `leaderboard.matchplaySide`. Fila er 341 KB — appen
speiler subsettet i `src/lib/sideTournamentCopy.ts`, og en **jest-paritetstest**
importerer `messages/no.json` node-side og krever at hver streng er identisk.
Drift fanges i CI uten at JSON-en havner i app-bundelen.

⚠️ Oppslagstabellen er nøklet på `SideCategory` (`lib/scoring/sideTournament.ts`),
ikke `SideCategoryId` (`sideTournamentConfig.ts`). De to unionene har 45 medlemmer
hver og er identiske bortsett fra `best_netto_front9`/`best_netto_back9` mot
`best_netto_f9`/`best_netto_b9` — se #1851.

### Ærlig note framfor feil tall

En fetch som ALDRI har lyktes (kaldstart offline på et finished side-spill med
slots) gir en rolig «fikk ikke hentet»-note i stedet for poengtabellen. Hver
slot er verdt 2p, så en tabell uten vinnerradene ville vist feil totaler med
autoritativ mine. Tom liste etter en VELLYKKET fetch er derimot gyldig — et
gammelt spill kan være avsluttet uten kåring. Samme skille som `data/choices.ts`.

### Rigge et ferdig side-spill på staging (service-role)

Samme fasong som greensome-/wolf-oppskriftene over, pluss:

- `games`: `side_tournament_enabled: true`, `side_ld_count` og `side_ctp_count`
  0-2, `side_disabled_categories: []`.
- `scores`: **`entered_by` er NOT NULL** — seed-skript som utelater den feiler
  med `23502`.
- `game_side_winners`: `game_id, category ('longest_drive'|'closest_to_pin'),
  position, winner_user_id`. Vil du bevise slot-semantikken, gi samme
  `winner_user_id` både `position: 1` og `position: 2`.
- Gi spillerne ulike course_handicap og et variert slag-mønster (én eagle, noen
  birdier, én `par+5` for snowman) — ellers fyrer bare et par kategorier og
  tabellen beviser lite.
- Kryssjekk mot web: kjør `next build` med `.env.staging.local` og `next start`,
  logg inn som e2e-spilleren, åpne `/no/games/<id>/leaderboard` og fanen
  «Sideturnering». Tallene der er fasit for appen.

## Opprett spill i appen (N6a, #1854)

Arrangøren oppretter runden i appen: format → oppsett → bane/tid → spillere/lag →
publiser. Fem steg i ÉN skjerm (`src/screens/CreateGame.tsx`) med lokal steg-state;
utkastet lever i minnet og forkastes hvis veiviseren avbrytes. Ingen DB-endring —
`games creator insert` (0071/0092) og `game_players creator insert` bærer skrivingen,
og `guard_game_players_invite_eligibility` (0115) håndhever hvem som kan legges til.

### Reglene er delt kode, bare monteringen er speilet

`buildGameInsertPayload` (`lib/games/gamePayload.ts`) bygger `mode_config` for alle åtte
modiene, akkurat som på web. Appen speiler ALDRI modus-reglene — den speiler bare
rekkefølgen og kolonnesettet fra `createGameInternal`. Delt og importert:
`buildGameInsertPayload`, `isTeeOffInPast`, `parsePrizesFromFormData`,
`parseSideTournamentFromFormData`, `acceptedAtForActor`, `fitsPlayerCount`.

**FormData-shimmen** (`src/lib/wizardFormData.ts`): byggeren leser `FormData`, og React
Natives globale `FormData` er laget for nettverks-opplasting — den har ingen `get()`.
Shimmen er en Map med `get`. Det holder: byggeren bruker `formData.get()` og ingenting
annet (53 kall, null `getAll`/`has`/`entries`). En jest-test mater byggeren et rått
`{get}`-objekt og krever identisk payload, så shimmens flate er låst.

To nøkkel-konvensjoner i samme payload, begge må treffes: spiller-slots leses på
INDEKS (`player_${i}_id`, `_team`, `_flight`), mens tee-kjønn leses på BRUKER-ID
(`player_${uuid}_gender`).

### ⚠️ Metro resolver bare-importer fra den IMPORTERENDE fila

`gamePayload.ts` value-importerer `prizes.ts`, som importerer `zod`. Metro slo den opp i
repo-rotas `node_modules` — utenfor prosjektet og utenfor `watchFolders` — og
`npx expo export` feilet med «Unable to resolve module zod».

**Jest var grønn hele tiden.** Den bruker Node-oppslag og fant rotas zod 4. Grønne
tester, rød bundle. `metro.config.js` har derfor `resolver.nodeModulesPaths` mot appens
egen `node_modules`, og regelen er nå: **enhver bare-import som er nåbar fra den delte
`lib/`-grafen MÅ være en deklarert dependency i `native/app`.** `npx expo export` er den
ENESTE porten som fanger et brudd.

### ⚠️ Ikke bruk webbens Oslo-parser i appen

`parseOsloDateTimeLocal` velger sommer- eller vintertid ved å STRENG-SAMMENLIGNE
`Intl`-utdata mot `'GMT+2'`. Den sammenligningen holder i Node og i nettlesere, men ikke
under Hermes — en dato i august fikk vintertidens `+01:00`, og en tee-off tastet 23:00
ble lagret som 22:00Z i stedet for 21:00Z. Funnet ved første publisering fra simulator.

Webben MÅ gå om veggklokke: `<input type="datetime-local">` har ingen tidssone. Appen
har pickerens `Date` — et faktisk øyeblikk — og bruker det direkte (`teeOffInstant`).
Picker, lagret verdi og `formatTeeOff` er da alle enhetens lokaltid.

⚠️ **`jest.config.js` pinner `process.env.TZ = 'UTC'`, og den linja er lastbærende.**
Den første regresjonsvakten for denne feilen var verdiløs: på en norsk maskin er
enhetens lokaltid og Oslo-veggklokke samme tall, så assertionen ble en identitet.
Evaluatoren gjeninnførte hele feilen og alle testene forble grønne. Med UTC pinnet er
de to ikke lenger samme tall, og vakten biter (bevist: mutanten gir 3 røde). Fjerner
noen TZ-pinningen, blir vakten teater igjen. Suiten er dessuten deterministisk uansett
hvilken sone maskinen står i — som er sonen CI kjører i.

### Hva appen IKKE kan (bevisste grenser)

- **Kandidatlista er medspillere, ikke venner.** `users`-SELECT under RLS gir egen rad ∨
  admin ∨ delt spill. Webbens union (venner ∪ medspillere ∪ klubbmedlemmer) er
  `server-only` + service-role. En venn du aldri har spilt med er ikke navnlesbar.
  Oppfølger: egen SECURITY DEFINER-RPC.
- **Gjester utelates.** En gjesterad MÅ inn via service-role (0115 blokkerer
  klient-inserten); å tilby en spiller hvis insert er dømt til å feile er uærlig.
- **Ingen tee-sett-velger** — utledes av `users.gender`, og junior er utilgjengelig
  (#1859).
- **Ingen utkast, ingen redigering, ingen e-postinvitasjon** — web-eid.
- Format-etikettene er speilet i `src/lib/appFormats.ts` med paritetstest mot
  `messages/no.json`: `formats`-tabellen har INGEN navne-kolonne, bare `slug`,
  `icon_key`, `scoring_module`, `is_active`, `is_cup_eligible`.
  `format_intent_mapping` nøkles på `format_slug`.

### Spillertak per modus

`src/lib/rosterLimits.ts` speiler slot-tellingen i `gamePayload.ts`, fordi
`fitsPlayerCount` alene er for løs: `fitsPlayerCount('stableford', 9)` er `true`, men
byggeren leser bare 8 slots — spiller nr. 9 ville forsvunnet stille. Tak: stableford /
modified / best ball 8, singles 2, greensome 4, wolf 5, skins / BBB 16. (Byggeren leser
17 for skins/BBB med vilje, så en 17. spiller blir en FEIL og ikke en stille kutting.)

### Verifisere en publisering mot staging

```bash
# Bygg + installer (datetimepicker er en NATIV modul — prebuild + pod install først):
cd native/app && source ~/.nvm/nvm.sh && nvm use 22
npx expo prebuild --platform ios --no-install
(cd ios && LANG=en_US.UTF-8 pod install)
(cd ios && LANG=en_US.UTF-8 xcodebuild -workspace TrnyDev.xcworkspace -scheme TrnyDev \
   -configuration Release -destination 'generic/platform=iOS Simulator' \
   -derivedDataPath build CODE_SIGNING_ALLOWED=NO build)
xcrun simctl install <UDID> ios/build/Build/Products/Release-iphonesimulator/TrnyDev.app
xcrun simctl launch <UDID> no.tornygolf.dev
```

Etter publisering, les raden med service-role og sjekk `status='scheduled'`,
`mode_config.kind`, `scheduled_tee_off_at at time zone 'Europe/Oslo'` mot det pickeren
viste, `team_number` (null for wolf), og at `accepted_at` kun er satt for arrangøren.

⚠️ **RN `Switch` tar ikke imot injiserte tapp** fra simulator-verktøyet. Dra i stedet:
en kort `swipe` tvers over bryteren slår den om. Vanlige `Pressable`-er tar tapp fint.

Web er fasit-konsument: bygg med `.env.staging.local` og kjør `npx next start`
(`torny-staging-prod` i `.claude/launch.json`), logg inn og åpne `/games/<id>`.

## Runde-drift i appen (N6b, #1855)

Fra `scheduled` til `active` uten å gå om nettsiden: spillerne bekrefter plassen sin
ved å åpne runden, arrangøren justerer rosteret, og «Start runden nå» flipper status.
Alt henger på `src/screens/GameHome.tsx` — `src/components/game/OrganiserSection.tsx`
rendres når `bundle.game.createdBy === userId`. **Ingen admin-flagg noe sted:** appen er
arrangørens flate, Sekretariatet bor på web.

### Auto-bekreftelse gjelder alle, ikke bare arrangøren

Åpner du spill-hjem og din egen rad har `accepted_at IS NULL` i et spill som ikke er
`draft`, setter appen stempelet stille (`confirmParticipation`). Ingen knapp, ingen
kvittering — webbens modell er «besøk = bekreftelse» (#463), og arrangøren ser bare at
merket dukker opp i rosteret. Policyen er `game_players self mark accepted` (0082);
webben bruker admin-klienten der kun fordi den kjører inne i `after()` uten cookies.

Betingelsen er skilt ut som `shouldConfirmParticipation` (`src/lib/roster.ts`) i stedet
for å ligge inne i effekten. Da kunne den testes med fire rader i stedet for en
render-test, og effekten kan ikke gå i ring: `refresh()` etterpå henter bundelen med
stempelet satt, og flagget slår om til false.

### Start-kjernen er delt kode, ikke speilet

`startScheduledGame` ble splittet i to (samme PR): `lib/games/startScheduledGameCore.ts`
er import-ren og eier ALT — tee-rating-vakta, pending-spillere, ufullstendige
sider/lag/flighter, rotasjons-antallet, frysingen av `course_handicap`,
greensome-overstyringen (#1628), rotasjonsslotene (#969) og selve status-flippen.
`lib/games/startScheduledGame.ts` er nå en tynn web-wrapper som legger varsel-fan-out
på toppen.

Hvorfor splitten: `notify` åpner med `import 'server-only'` og skriver via service-role.
Den ene tingen kjernen ikke kan gjøre er altså å varsle. Kjernen avslår derfor ventende
påmeldinger selv (DB-skrivet) og RETURNERER søkerne; wrapperen fyrer
`registration_expired` for dem. Appen (`src/data/startGame.ts`) kaller kjernen med sin
egen RLS-klient og slipper lista.

⚠️ **`{ ok: true, started: false }` er SUKSESS, ikke feil (#502).** Det betyr at en annen
aktør vant status-flippen: cron-sweepen på tee-off, nettsidens knapp, eller
E1-fallbacken når noen åpner spillsiden. Runden ER i gang, som er nøyaktig det
arrangøren trykket for. Appen bærer utfallet som `alreadyRunning: true` under `ok: true`
nettopp for at ingen skal lese det som en feilmelding.

⚠️ **To installasjoner av `@supabase/supabase-js`.** Appen har sin egen (Metro må resolve
mot appens avhengighetstre), rota har sin. Kjernen ligger i `lib/` og annoterer derfor
ROTAS `SupabaseClient`; TypeScript nominal-sammenligner klasser med `protected`-felter og
avviser de to som ulike. `startGame.ts` har ett dokumentert kast (`CoreSupabaseClient`,
hentet fra kjernens egen signatur) — et pakke-duplikat-kast, ikke et «typene stemmer
ikke»-kast.

### RLS-veien per skriv

Appen har ingen service-role og skal ikke få en. Alle sju skrivene i
`src/data/rosterActions.ts` går rett på `game_players` under RLS:

| Handling | Policy / vakt |
|---|---|
| Bekreft egen deltakelse | `game_players self mark accepted` (0082) |
| Legg til spiller | `game_players creator insert` (0071) + `guard_game_players_invite_eligibility` (0115) |
| Fjern spiller | `game_players creator delete` (0071), kun `draft`/`scheduled` |
| Sett lag / flight | `game_players creator update` (0071) + `guard_game_players_self_update` (siste kropp: **0168**), creator-bypass på andres OG egen rad |
| Trekk / angre trekk | samme som over |
| Start runden | `games creator update` (0071) for status-flippen; vaktas creator-bypass for CH-frysingen og rotasjonsslottene |

Gatene i TypeScript står foran for UX-ens skyld. **Porten er Postgres.** Hvert 0-rads-svar
splittes med ett oppfølgings-SELECT: er raden i måltilstanden, er handlingen idempotent
utført; er den ikke det, nektet RLS. Stille suksess finnes ikke (trap 2, #667/#704).

### ⚠️ Arrangørens EGEN rad — halvveis åpnet (#1868, migrasjon 0168)

`guard_game_players_self_update` blokkerte `team_number`, `flight_number` (gren b) og
`withdrawn_at` (gren c) på egen rad. Webben merket det aldri for lag/flight, fordi
`flightActions.ts` skriver med admin-klienten; appen har aldri service-role.

⚠️ **Funksjonen har mange hjem, og det siste er ikke det du tror.** Kroppen er skrevet om
av 0103 → 0106 → 0107 → 0108 → 0133 → 0147 → 0159 → 0168. Egen-rad-grenen hadde allerede
ETT creator-unntak før dette arbeidet: 0159 (#1362) lot oppretteren *fjerne* sin egen
godkjenning. Den nyanse kostet en runde her — første utkast av 0168 kopierte 0147 fordi
0147s egen kommentar sier «copy from the LATEST create-or-replace», og reverterte 0159
stille til staging. Finn den siste med kommando, ikke med tillit:

```bash
grep -l "create or replace function public.guard_game_players_self_update" \
  supabase/migrations/*.sql | tail -1
```

**Det var ikke kosmetikk.** `startScheduledGameCore` trekker wolf-/round-robin-slots (#969)
for ALLE aktive spillere, arrangøren inkludert, så vakta avviste nøyaktig én rad og hele
starten falt. Målt på staging 2026-09-01:

```
SLOT_WRITE 069cda6e error: null
SLOT_WRITE 252e1a6f error: 42501 "A player cannot change their own team_number/flight_number"
SLOT_WRITE 1f016c6a error: null
```

**Migrasjon 0168** gir oppretteren samme unntak på egen rad som de alt har på andres, for
`team_number`/`flight_number`. Ikke ny makt: samme arrangør kan alt omrokere alle andre og
legge til/fjerne hvem som helst før start.

**Gren (c) står.** En arrangør kan fortsatt ikke trekke seg selv — nøyaktig som på webben,
der `adminWithdrawPlayer` går på request-klienten og møter samme vakt. `OWN_ROW_LOCKED_NOTE`
står derfor fortsatt der trekk-knappen ellers ville vært:

> Appen får ikke endre ditt eget lag eller trekke deg selv. Det ordner du på nettsiden.

Fjern-knappen har derimot **ingen** selv-vakt, med vilje: `spillere/actions.ts` har ingen,
og både `game_players creator delete` (0071) og self-register-grenen (0043) tillater den.
To flater med hver sin regel er verre enn regelen selv.

### ⚠️ Hermes har ingen `crypto` — og delt kode antar at den finnes

`assignRotationSlots` (`lib/games/`) trekker rotasjonen med en Fisher–Yates backet av
`crypto.getRandomValues`. Kommentaren i fila sier selv «available in Node 18+», og det er
der den hadde kjørt til nå. Expos runtime-polyfills gir `AbortSignal`, `FormData`,
`TextDecoder`, `URL` og `fetch` — men **ikke** WebCrypto, og `expo-crypto` er ikke
installert.

Fra appen kastet kallet derfor, `OrganiserSection` fanget det i sin `try/catch` og viste
den generiske «Klarte ikke å oppdatere spillet. Prøv igjen.» Feilmeldingen pekte på
databasen mens årsaken var en manglende global, og den traff **kun** wolf og round robin —
solo-stableford startet fint hele veien. Det tok tre feilsøkingsrunder å se, fordi den ene
symptomteksten dekket to helt ulike årsaker (denne og 0147 over).

`react-native-get-random-values` importeres nå **først** i `index.ts`, før alt annet.

**Regelen for framtidig delt kode:** en `lib/`-modul som leser en JS-global må enten holde
seg til det Hermes + Expos winter-runtime faktisk gir, eller appen må polyfille den. Jest
fanger det aldri (Node har globalene), og `expo export` heller ikke — bare en kjøring på
enhet eller simulator gjør det. Samme klasse felle som metro-bare-importene over, men på
runtime-siden.

### Logg inn på test-enhet uten e-post

OTP-veien er ubrukelig for testkontoer: GoTrue nekter å SENDE kode til
`@torny-e2e.invalid` (domenet er ikke leverbart), og en ekte adresse går på
Supabase sitt time-tak for innebygd SMTP etter noen få forsøk. Appen kommer aldri
til kode-steget uten et vellykket `signInWithOtp`, så innloggingen låser seg.

Legg sesjonen rett inn i stedet. Virker på BÅDE simulator og fysisk enhet:

1. Mint sesjonen med appens egne klient-opsjoner mot en opptaks-storage, så du får
   den EKSAKTE nøkkelen og verdien — ikke gjett nøkkelnavnet.
2. AsyncStorage på iOS: `Library/Application Support/<bundleid>/RCTAsyncLocalStorage_V1`.
   `manifest.json` er `{"<nøkkel>": null}` når verdien er over 1024 byte
   (`RCTInlineValueThreshold`), og selve verdien ligger i en nabofil med
   `md5(nøkkel)` som navn, små bokstaver. En supabase-sesjon er ~2 kB, altså
   alltid egen fil. Nøkkelen mot staging er `sb-snwmueecmfqqdurxedxv-auth-token`.
3. Simulator: skriv rett i containeren (`xcrun simctl get_app_container <udid> <bundle> data`).
   Fysisk enhet: `xcrun devicectl device copy to --device <UDID> --domain-type
   appDataContainer --domain-identifier <bundle> --user mobile --source <fil>
   --destination "<sti i containeren>"`.
4. Avslutt appen før du skriver, start den etterpå.

⚠️ `devicectl` trenger at enheten står som `connected`. `available (paired)` kan
fungere, `unavailable` gjør det ikke — kabel i og telefonen ulåst.
⚠️ Simulatorens tekstinjeksjon skriver `-` som `+`. Skal du likevel taste noe inn,
bruk `xcrun simctl pbcopy` og lim inn med langtrykk.

### Bokførte gap

- **Ingen varsler fra appen.** `player_added` ved roster-endring og `registration_expired`
  for søkere starten avviste er server-eide (`notify` = `server-only` + service-role).
  Starter arrangøren fra appen, skjer avslaget i basen, men varselet uteblir. Cron-sweepen
  varsler fortsatt for spill som starter på tee-off.
- **Ingen admin-hendelseslogg.** `logAdminEvent` er server-eid; appens skriv legger ingen
  rad i loggen.
- **Åpen påmelding / forespørsels-godkjenning** (`game_registration_requests`-UI),
  `toggleSignupsClosed`, rediger-spill-feltene, gjester og e-postinvitasjoner er web-eid.
- **Lag-/flight-justering vises kun når noe MANGLER** (`needsTeamAssignment` /
  `needsFlightAssignment`). Er alle fordelt, hører omfordelingen hjemme på nettsiden.
- **Avslutt-flyten** kommer i N6c (#1856).

### Verifisere driften mot staging

Bygg og installer som i N6a-seksjonen over, og les med service-role etterpå:

1. E2E-spilleren åpner runden i appen → `game_players.accepted_at` er satt.
2. Arrangøren legger til og fjerner en spiller, setter lag → radene stemmer, og
   `flight_number` er satt sammen med `team_number` (CHECK 0030/0095).
3. «Start runden nå» → `games.status = 'active'`, `course_handicap` frosset på ALLE
   aktive rader, og et wolf-testspill har fått rotasjonsslots.
4. Trekk + angre i aktiv runde → `withdrawn_at` satt og nullet igjen.
5. Fasit: åpne samme spill på webben (`torny-staging-prod` i `.claude/launch.json`) og
   sammenlign roster og banehandicap.

## Avslutt runden i appen (N6c, #1856)

Arrangøren avslutter runden fra appen: leveringskontroll, «avslutt likevel» med
trekk-avkrysning, LD/CTP-kåring per slot, og status-flippen. Halen som webben kjører
etter flippen — differensialer, resultat-sammendrag, bragder, varsler/mail,
rundereferat — kan telefonen ikke kjøre. Den er derfor sentralisert server-side og
plukkes opp av en sweep.

### Halen kan ikke flyttes til telefonen — det er hele grunnen til fullføreren

Seks av post-stegene henter `getAdminClient()` **selv** og tar ikke injisert klient:
`persistResultSummaries`, `persistScoreDifferentials`, `notifyAchievementUnlocks`,
`generateAndPersistRoundReport`, `logAdminEvent` og `notify()` (inne i
`notifyPlayersGameFinished`). `score_differential` er dessuten trigger-låst for
ikke-admin (0117). En app-avslutning som bare flipper status ville gitt et ferdig
spill **uten** sammendrag, differensialer, bragder, referat og «Resultatet er klart»-mail.

`endGameCore` kan ikke gjenbrukes slik N6b gjenbrukte start-kjernen: linje 1 er
`import 'server-only'`, og `native/app/node_modules/server-only` er en bar `throw`.
Gatene speiles derfor tynt i `src/data/endGame.ts` med jest-paritet; halen deles ikke.

### Markøren vinnes FØRST, ikke sist

`runFinishPipeline` starter med å vinne raden:
`.update({finish_pipeline_at: now}).eq('status','finished').is('finish_pipeline_at', null).select('id').maybeSingle()`
— 0 rader betyr at noen andre eier kjøringen, og den returnerer uten å gjøre noe.
Formen er husets egen fra `lib/notifications/autoStartBlocked.ts:67-82`, status-predikatet
inkludert: statussjekken lenger oppe i `runFinishPipelineForGame` er en EGEN spørring, så
uten predikatet inne i selve kapringen kan en admin gjenåpne spillet i mellomtiden og
halen kjøre — og brenne markøren — mot en runde som er live igjen.

⚠️ **Gjenåpning MÅ nulle markøren.** `reopenGame` nuller `finish_pipeline_at` sammen med
`ended_at` og `round_report`, både på verts-spillet og på de avledede. Uten det finner
re-avslutningen ingenting å kapre, og hele halen hoppes over — inkludert referatet reopen
nettopp slettet. Handlingen er admin-only, så guard-triggeren i 0169 slipper den gjennom
på `is_admin()`-luka.

⚠️ **Ikke snu dette til «sett markøren sist».** Det gir at-least-once, og stegene tåler
det ikke: `notifyAchievementUnlocks` kaller `notify()`, som er en bar INSERT — prod har
**ingen** unik indeks på `public.notifications` (kun `notifications_pkey` + tre ikke-unike
btrees), så hver ekstra kjøring dupliserer varselet og fyrer push på nytt.
`generateAndPersistRoundReport` fakturerer et Anthropic-kall per kjøring, og
finish-mailen er re-sendbar. Dobbel-varsling er verre enn et manglende referat.

### Den optimistiske låsen ble bygget her — den fantes ikke før

Flippen var `.update({status, ended_at}).eq('id', gameId)`: ingen status-predikat, ingen
`.select()`. Et 0-rads-skriv ga `error === null`, og hele halen kjørte mot et spill som
fortsatt var aktivt. Det var maskert av at `status !== 'active'`-gaten blokkerte
re-inngang i hele pipelinen — et vern som forsvinner i det halen skilles ut. Låsen og
uttrekket hører derfor til i samme commit.

**0 rader = allerede avsluttet = idempotent suksess**, ikke en feil. Speilet fra
`startScheduledGameCore`s `started`-boolean, så et legitimt dobbelttrykk ikke gir
feilmelding.

### Cup-ness kommer to ulike steder fra

I **webben** kommer cup-oppførsel aldri fra `tournament_id` — `endGameCore` har null
treff på kolonnen. Den kommer fra hvilken klient calleren sender (`lib/cup/actions.ts`
sender service-role, fordi en klubb-styrer ikke er spillenes oppretter) og fra
`suppressPerGameNotifications`. Begge må forbli parametere gjennom uttrekket.
`finishDerivedGames` gater på `games.source_game_id` og kjører ubetinget.

I **appen** er `tournament_id` derimot riktig sjekk: den skjuler avslutt-CTA-en og viser
«Denne runden hører til en cup. Den avslutter du på nettsiden, så cup-tavla følger med.»

### Sweepen er pg_cron, ikke Vercel-cron

#502 er bevisst **ute** av `vercel.json` (Hobby gir 1/døgn). Jobben bor i migrasjon 0170:
`cron.schedule('finish-pipeline-sweep', '* * * * *', ...)` med `where exists`-gate, så
HTTP-POSTen kun fyrer når det finnes arbeid. **POST** — pg_net kan ikke GET. URL-formen er
0146s apex, ikke 0094s www. `cron_secret` finnes alt i Vault.

**Kandidatsettet har tre hjem og må være identisk i alle tre** (AGENTS.md-felle 4): ruta
sin egen spørring, `where exists`-gaten i 0170, og den partielle indeksen (0169, korrigert
i 0171). Fire predikater: `status='finished'`, `finish_pipeline_at is null`,
`tournament_id is null` og `source_game_id is null`. Det siste er ikke pynt — avledede
cup-kamper avsluttes av `finishDerivedGames`, som kun skriver `{status, ended_at}` og
aldri markøren, så de fødes som kandidater. `tournament_id` dekker dem ikke:
`games_tournament_id_fkey` er `ON DELETE SET NULL` (verifisert live), så en slettet cup
gjør hele kamptreet til kandidater. Sveipes én, kjøres HELE halen på nytt per kamp uten
cupens `suppressPerGameNotifications` — én «Resultatet er klart»-mail per kamp til de
samme spillerne, og ett fakturert Anthropic-referat hver.

### Rekkefølgen på migrasjonene er lastbærende — begge veier

**0169 + 0171 MÅ på prod FØR koden merges.** Merge til `main` deployer med én gang, og
den deployede koden kaprer markøren ved hver eneste web-avslutning. Mangler kolonnen,
svarer PostgREST 42703, `claimFinishPipeline` leser enhver feil som «ikke kapret» og
hopper over HELE halen — ingen sammendrag, differensialer, bragder, referat, auditrad
eller «Resultatet er klart»-mail — mens `endGameCore` fortsatt returnerer `{ok:true}` og
arrangøren ser en helt normal avslutning. Stumt, for hver runde som avsluttes i vinduet.
Og tapet blir permanent: backfillen i 0169 stempler alle alt-avsluttede spill som ferdige,
så de foreldreløse rundene er usynlige for sweepen i det den lander.

**0170 påføres SIST, etter deploy.** Jobben peker på `/api/cron/finish-pipeline`; påføres
den før ruta er ute, er hver fyring en 404.

| Steg | Hva | Hvorfor akkurat der |
|---|---|---|
| 1 | 0169 + 0171 på prod (eier-luka #1074) | Ingen kode avhenger av dem ennå; kolonnen må finnes før koden som skriver den |
| 2 | Merge → Vercel deployer | Koden kaprer markøren fra første avslutning |
| 3 | 0170 på prod | Ruta må finnes før cron POSTer mot den |

⚠️ **Staging kan ikke kjøre pg_cron-veien** — vaultet der er tomt, så
Authorization-headeren ville blitt NULL. Driv ruta direkte i stedet (se under).

### `finish_pipeline_at` har egen vakt

`games creator update` gir oppretteren blankofullmakt på alle kolonner, og markøren
styrer varsling og et betalt Anthropic-kall. 0169 legger derfor på en guard-trigger:
en klient som prøver å sette eller nulle kolonnen får 42501, mens urelaterte felt går
gjennom som før.

### RLS-veien for appens tre skriv

Alle tre går rett på RLS uten service-role, og hvert skriv rad-asserteres:

| Handling | Policy |
|---|---|
| Marker manglende spiller som trukket | `game_players creator update` (0071) + `guard_game_players_self_update` (0168) |
| Kår LD/CTP-vinnere | `game_side_winners creator all` (0071/0092), `onConflict: game_id,category,position` |
| Flipp `active → finished` | `games creator update` (0071/0092), låst på `status=eq.active` |

Empirisk bekreftet på staging med ekte JWT for en ikke-admin oppretter: upsert med
`return=representation` mens spillet er `active` gir **201 + rader** (husets
trap-2-idiom er trygt her — `creator all` har `cmd=ALL`, så SELECT-armen bærer det);
låst flipp gir 200 + rad; flipp på et alt avsluttet spill gir **200 + `[]`**;
re-upsert av vinnere på et finished spill virker (retry-stien).

### Verifisere avslutt-flyten mot staging

1. Seed et aktivt spill med side på (`side_ld_count`/`side_ctp_count` > 0), leverte kort
   og varierte slag. `scores.entered_by` er NOT NULL. Hull-par heter **`par_mens`**,
   ikke `par` — `course_holes` har `par_mens`/`par_ladies`/`par_juniors`.
2. Avslutt fra appen med kåring (én spiller på LD, «Ingen kvalifiserte» på CTP) →
   `game_side_winners` får `winner_user_id: null` for den tomme sloten,
   `status='finished'`, og `finish_pipeline_at` er **fortsatt null**.
3. Fyr sweepen. Staging har tomt vault, så POST ruta direkte mot en
   **prod-server-modus**-build (`next build` med `.env.staging.local` + `next start`,
   aldri dev):
   ```
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3111/api/cron/finish-pipeline
   ```
   → `{"ok":true,"checked":1,"completed":[...],"failed":[]}`, og etterpå har spillerne
   `score_differential` + `result_summary` og spillet `finish_pipeline_at`.
4. Fyr sweepen **én gang til** → `checked: 0`. Er den ikke 0, er markøren ikke satt og
   varsler vil dupliseres.
5. Fasit mot web: åpne `/no/games/<id>/leaderboard` → fanen «Sideturnering». Poengene
   der skal være identiske med appens seksjon.

⚠️ **Webbens avslutt-knapp kan ikke klikkes av et skript uten videre.** `EndGameButton`
pakker innsendingen i `window.confirm()`, og Playwright avviser dialoger som standard —
`preventDefault()` fyrer og formen sendes aldri. Registrer
`page.on('dialog', d => d.accept())` først. Symptomet er stumt: knappen rapporterer
`enabled: true`, klikket «lykkes», og ingenting skjer.

⚠️ **Ikke klikk «Send meg kode» i skript.** Det kaller `signInWithOtp` og
rate-limiter staging (`error=rate_limited_minute`), og da feiler server-action-en
stille på auth etterpå. Mint koden med service-role og gå rett til
`/no/login?step=verify&email=...`.

### Bokførte gap

- **Appen er strengere enn webben på «avslutt likevel».** Webbens avkryssinger er
  valgfrie — `avslutt/page.tsx` setter `allowMissing = missing.length > 0` uten å spørre.
  Appen krever at hver manglende spiller krysses av. Bevisst, per kontrakten: et trykk
  som trekker en spiller skal være et valg, ikke en bieffekt.
- **Slot-etikettene er norske i appen** («Lengste drive #1»), engelske i webbens
  admin-skjema. Divergensen fantes fra før på begge flater; det lastbærende —
  slot-NUMMERET, ikke en plassering — er identisk.
- **Kåringsvelgeren tilbyr også en spiller som er krysset av som trukket.** Speiler
  webben, som heller ikke filtrerer.
- **Cup-avslutning, reopen og Sekretariat-godkjenning forblir web/admin.**
- **Ingen admin-hendelseslogg for app-avslutningen selv** — `logAdminEvent` kjøres av
  fullføreren, med sweepen som aktør.

## Slett konto i appen (#1876)

Spilleren sletter kontoen sin uten å gå om nettsiden — App Store 5.1.1(v). Hele
slettingen er service-role (`anonymize_user` er `security definer` med execute kun for
`service_role`, og GoTrue-softdeleten er et admin-API), så telefonen kan ikke gjøre den
selv. Appen snakker i stedet med én ny route handler på web-deployen, og regelen blir
liggende der den alltid har ligget: `lib/users/deleteAccount.ts`. Ruta er transport,
ikke logikk — appen speiler ingen blokk-regel, den spør og viser svaret.

Flatene (oppdatert i #1906): ordet «Profil» oppe til høyre i hjem-headeren →
`src/screens/Profile.tsx` → `src/screens/DeleteAccount.tsx` (dedikert bekreftelsesskjerm,
husregelen for irreversible handlinger). `src/screens/Account.tsx` er slettet — rommet
erstattet den, og sletting ligger fortsatt to nivåer ned. Kallene bor i
`src/data/account.ts`, copyen i `src/lib/accountCopy.ts` (paritet med `messages/no.json`
→ `profile.deleteAccount`).

### API-kontrakten — ett endepunkt, to verb

`app/api/account/delete/route.ts`. Auth på BEGGE verb er
`Authorization: Bearer <supabase access_token>`, validert server-side med
`auth.getUser(token)` på admin-klienten (repoet har ingen fabrikk for en cookie-løs anon
server-klient). Det er altså GoTrue som avgjør om tokenet er ekte og gyldig, ikke oss.

```
GET  /api/account/delete
  200 { blocked: 'admin_account' | 'active_engagements' | null }
  401 { error: 'unauthorized' }
  500 { error: 'status_failed' }

POST /api/account/delete
  200 { mode: 'hard' | 'anonymized' }
  401 { error: 'unauthorized' }
  403 { error: 'admin_account' | 'active_engagements' }
  500 { error: 'delete_failed' }
```

**Bruker-id-en kommer KUN fra tokenet.** Ruta leser aldri body eller query etter en id,
og appen sender ingen — kallene har verken kropp eller query-parametre. Det finnes derfor
ingen vei til å slette en annens konto, og en `userId` limt inn i kroppen har null effekt
(egen test på nettopp det). `api/` ligger utenfor proxy-matcheren (`proxy.ts`), så ruta
eier sin egen auth: ingen sesjons-cookie, ingen `x-torny-user-id`.

GET-en er kun til visning — den styrer om skjermen viser banner eller knapp. POST-en
sjekker blokk-regelen på nytt og er den autoritative; noe kan ha startet i mellomtiden.

⚠️ **403-koden er hjelperens egen, ikke webbens copy-nøkkel.** `DeleteBlockReason` er
`'admin_account' | 'active_engagements'`, mens `messages/no.json` heter
`errors.active_games` og webben bygger bro i sin egen redirect. På wiren står regelens
navn; appen oversetter kode → setning i `accountCopy.ts`. Legger du `active_games` inn
her, har regelen fått to navn (AGENTS-felle 4).

Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig eksponert, så
`err.message` — Postgres-detaljer, env-navn — skal aldri ut.

### `EXPO_PUBLIC_WEB_BASE_URL` bakes inn ved bundling

Appen må vite hvor web-deployen står. Ny variabel i `native/app/.env.local`
(gitignorert, som de to andre):

```bash
# native/app/.env.local
# Staging-verify: lokal web i prod-server-modus, samme port som du starter under.
EXPO_PUBLIC_WEB_BASE_URL=http://localhost:3111
# Butikk-bygg: EXPO_PUBLIC_WEB_BASE_URL=https://tornygolf.no
```

⚠️ **`EXPO_PUBLIC_*` leses IKKE ved oppstart — den bakes inn i bundelen.** Babel bytter
`process.env.EXPO_PUBLIC_WEB_BASE_URL` med selve strengen når bundelen lages. Å rette
`.env.local` og starte appen på nytt gjør derfor ingenting: i dev må Metro startes med
tømt cache (`npx expo start -c`), i Release må du bygge og installere på nytt. Dette er
fella som koster en halvtime — symptomet er at appen fortsatt ringer den gamle adressen
mens fila på disk sier noe annet.

Mangler variabelen, sier skjermen det rett ut (kode `no-web-base-url`) i stedet for en
knapp som ikke gjør noe — samme ærlig-feil-guardrail som `supabase.ts` har for
Supabase-nøklene. Den leses inne i kallet, ikke på modulnivå: et kast ved import ville
tatt ned hele appen for en skjerm de fleste aldri åpner.

⚠️ **Bevis at simulatoren når adressen FØR du bygger hele flyten.** Simulatoren deler
Mac-ens nettverksstakk, så `http://localhost:<port>` skal virke, og ATS i det genererte
prosjektet tillater lokal trafikk (`NSAllowsLocalNetworking`). Men `native/app/ios/` er
gitignorert og regenereres av `expo prebuild`, så det er et artefakt og ikke en garanti.
Sjekk med et engangs-`fetch` mot `http://localhost:<port>/api/health` først. Blokkeres
det, fikses det via `ios.infoPlist.NSAppTransportSecurity` i `app.json` + ny prebuild —
aldri ved å redigere `ios/` for hånd.

### To slette-grener — vit hvilken du ser på

`deleteOrAnonymizeUser` velger gren på om brukeren har `game_players`-rader:

| Gren | Når | Hva du kan lese etterpå | Svar |
|---|---|---|---|
| **HARD** | 0 `game_players`-rader | Raden er BORTE fra både `auth.users` og (via cascade) `public.users` | `{ mode: 'hard' }` |
| **ANONYMISER** | brukeren har historikk | Gravsteins-rad står igjen, auth-raden er soft-slettet | `{ mode: 'anonymized' }` |

⚠️ **Dette er den vanligste feillesningen i denne flyten.** En fersk engangsbruker på
staging har null `game_players`-rader og tar HARD-grenen — da finnes det ingen
`deleted_at` og ingen «Slettet bruker» å asserte, og et helt korrekt resultat ser ut som
en feil. Skal du bevise gravsteinen, må brukeren ha historikk: service-role-INSERT i
`game_players` på et **ferdig** spill (et aktivt/planlagt ville trippet
`active_engagements`). Den insertet er unntatt invite-eligibility-triggeren
(`0115_game_players_invite_eligibility_rls.sql:112-123` — `auth.uid()` er NULL for
service-role). Si i PR-en hvilken gren hver testbruker beviste.

Gravsteins-fasiten er `supabase/migrations/0142_green_pins.sql:159-170`:

```sql
name = 'Slettet bruker', nickname = null,
email = 'slettet+' || p_user_id || '@deleted.tornygolf.no',
gender = null, locale = null, last_seen_at = null, hcp_index = 54.0,
friend_code = public.generate_friend_code(),
product_updates_unsubscribed_at = coalesce(product_updates_unsubscribed_at, now()),
deleted_at = coalesce(deleted_at, now())
```

**DB-objektet heter `anonymize_user` — innført i 0131, men kroppen som kjører er 0142-s**
(`create or replace`, som la til nullingen av `green_pins.user_id`). Siter 0142, ikke
0131; sender du neste leser til 0131, leser hen en utdatert kropp. Verifisert live i
denne økta: identisk funksjonskropp i staging og prod. Funksjonen er `security definer`
med execute kun for `service_role`, og den blokkerer admin-kontoer på DB-nivå
(`0142:154-157`, errcode `insufficient_privilege`) — blokk-regelen i TS er altså ikke det
eneste vernet. **Ingen migrasjon i denne slicen.**

⚠️ **Fra #1909 gjør RPC-en mer enn å skrubbe: den melder deg av alt som ikke er
avsluttet.** Migrasjon `0174_anonymize_user_withdraws_from_open_play.sql` legger fem steg
inn FØR scrubben, i samme transaksjon: pågående spill får `withdrawn_at` +
`withdrawn_by_user_id` på `game_players`-raden (raden og scorene består), ikke-startede
spill mister raden helt, og deltakelsen i uavsluttede cuper og ligaer — inkludert setene
i kaptein-uttaket — slettes så brukeren ikke rostres inn igjen ved neste runde. Avsluttede
spill, cuper og ligaer er urørt. Frafallet bor i RPC-en og ikke i helper-laget nettopp
fordi alle tre kallerne (selv-slett på web, admin-slett på web, denne ruta) går gjennom
`deleteOrAnonymizeUser` → RPC-en: ett hjem for regelen (AGENTS-felle 4), atomisk sammen
med `deleted_at`, og service-role-konteksten slipper forbi vaktene på `game_players` uten
at noen policy må endres. Konsekvensen for appen: kroppen å sitere er `0174`, ikke `0142`
— og en spiller midt i en runde som sletter seg SKAL ha `withdrawn_at` satt etterpå.

### Ingenting stopper sync eksplisitt — unmount-kaskaden gjør det

Appen har **ingen** `stopSync()`-primitiv, og fikk ingen her. `startSyncTriggers` gir
stopp-closuren til kalleren, `drainQueue` har ingen abort, `subscribeGameScores` gir
unsubscribe-closuren til kalleren — det finnes ikke noe register å be om stopp gjennom.

Rekkefølgen i `deleteAccount()` er derfor selve kontrakten:

1. **POST** mot ruta (krever nett).
2. **Kun ved 200:** `wipeLocalData()`.
3. **`signOut({ scope: 'local' })`** — sesjonene er alt revokert av GoTrue, så global
   scope ville bare gitt 403-støy.

Steg 3 er også stoppen: `App.tsx` lytter på `onAuthStateChange`, setter sesjonen til
null og bytter til Login-stacken, hvorpå hver skjerm unmountes og `useEffect`-oppryddingen
deres kjører stopp/unsubscribe. Det er bevisst, ikke en forglemmelse — å legge til et
eksplisitt stopp-API ville vært en ny primitiv for en kaskade som allerede kjører.

⚠️ **Aldri wipe på 401, 403, 500 eller nettverksfeil.** En 401 betyr som oftest bare at
tokenet gikk ut mens skjermen sto åpen; kontoen lever, og en wipe der ville slettet lokale
data for en bruker som fortsatt har dem. Ble kontoen faktisk slettet, feiler
re-innloggingen naturlig med «ingen konto».

### Wipen er `DELETE FROM` × 4 i `withTxn`

`wipeLocalData()` i `src/data/db.ts` tømmer alle fire tabellene — `scores`, `sync_queue`,
`conflicts`, `cache_entries` — i én transaksjon. Ikke `deleteDatabaseAsync`: den finnes i
expo-sqlite SDK 57, men mangler i jest-mocken (`src/test/sqliteMock.ts`), og et
fil-slett ville dessuten etterlatt den modul-lokale `dbPromise` som en levende peker mot
en slettet fil. Primitiven ligger i `db.ts` nettopp for at **#1877 (wipe ved vanlig
utlogging) skal gjenbruke den samme**.

Wipen står i `withTxn`-køen og kolliderer derfor aldri med en åpen skriving fra
sync-drainen. Den lover ikke mer enn det: en drain som er midt i en nettverks-rundtur når
wipen commiter, kan rekke å legge igjen en rad etterpå. I praksis tar signOut-kaskaden
rett over, og blokk-regelen har alt garantert at brukeren ikke er med i noe aktivt spill,
så køen er tom. Ikke skriv om denne setningen til noe sterkere.

### Verifisere sletting mot staging

🚨 **STAGING-VERN — les dette før du sletter noe som helst.** Staging deles med andre
økter. Disse kontoene skal **ALDRI** slettes:

- `E2E_ADMIN_EMAIL` og `E2E_PLAYER_EMAIL` (hele e2e-suiten er hardt avhengig av dem)
- App Store-review-kontoen og gjestene dens (`gjest+…@guest.tornygolf.no`)

**Trygg-å-slette-predikatet** er begge deler samtidig: e-posten slutter på
`@torny-e2e.invalid` **OG** id-en kom tilbake fra ditt eget `createUser` i denne
kjøringen. Sveip aldri på navneprefiks — en annen økt kan ha en bruker som ligner.

Web-ruta må kjøre i **prod-server-modus** (dev gir falske røde):

```bash
source ~/.nvm/nvm.sh && nvm use 22
set -a && source .env.staging.local && set +a
npm run build && npx next start -p 3111
```

⚠️ `torny-staging-prod` i `.claude/launch.json` **bygger ikke** og står på hardkodet port
3000. En søsterøkt på 3000 svarer stille med en build uten ruta di — en 404 du jakter i en
time. Velg egen port og sjekk eierskap: `lsof -ti:<port>` → `lsof -a -p <pid> -d cwd`.

Engangsbruker + Bearer-token (ingen ferdig skript finnes — sett det sammen slik):

```js
const admin = createClient(URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `test-slettkonto-${Date.now()}@torny-e2e.invalid`;
const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
// on_auth_user_created inserter public.users — poll ~5×200 ms og ASSERT rows.length > 0
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const otp = link.properties.email_otp.replace(/\s+/g, '');
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: s } = await anon.auth.verifyOtp({ email, token: otp, type: 'email' });
// s.session.access_token → Authorization: Bearer …
```

⚠️ `generateLink` regenererer engangstokenet og ugyldiggjør det forrige (#861) — mint
aldri to ganger og bruk den første.

Så, i rekkefølge:

1. `curl -H "Authorization: Bearer $TOKEN" http://localhost:3111/api/account/delete`
   → `{"blocked":null}`. Uten header → 401.
2. Seed den samme brukeren inn i et **aktivt** spill med service-role og gjenta →
   `{"blocked":"active_engagements"}`. Appen skal da vise banner og **ingen** slette-knapp.
3. Bruker A (historikk i et **ferdig** spill): slett fra appen → `{"mode":"anonymized"}`,
   og les med service-role: `deleted_at` satt, `name = 'Slettet bruker'`, e-post
   `slettet+<uuid>@deleted.tornygolf.no`, auth-raden soft-slettet, og de historiske
   `scores`-radene står igjen.
4. Bruker B (ingen spill): slett → `{"mode":"hard"}`, og raden er **borte** fra både
   `public.users` og `auth.users`. Null rader er fasit her, ikke en feil.
5. Enheten: appen står på Login etter slettingen, `torny.db` er tom i alle fire tabeller,
   og innlogging som en annen bruker starter rent.
6. Rydd opp: `await admin.auth.admin.deleteUser(id)` for de engangsbrukerne som fortsatt
   finnes.

Husk at appen må bygges på nytt hvis du endret `EXPO_PUBLIC_WEB_BASE_URL` mellom
forsøkene — se avsnittet over.

### Uten nett: les fritt, slett ikke

Skjermen skiller på to ting som lett blir én. Sier serveren «blokkert», er svaret
gitt: banner og ingenting mer. Fikk vi ikke SPURT — uten nett, utløpt sesjon, eller
et bygg uten server-adresse — står begge boksene der som vanlig, men den røde knappen
er byttet ut med grunnen til at den ikke er der. En midlertidig nettfeil skal ikke se
ut som et avslag.

Offline-setningen er slette-spesifikk med vilje. Den delte `OFFLINE_NOTE` i
`rosterCopy.ts` lover «koble til, så går det gjennom», og det er sant for en score som
ligger i sync-køen. Sletting legges aldri i kø. En test låser at vi ikke gjenbruker
den linja her.

Etter et 200-svar er kontoen borte, og da rapporteres ingen lokal feil som en feilet
sletting. Både wipen og den lokale utloggingen står i hver sin try/catch: glipper en
av dem, logges det, og utfallet er fortsatt «slettet». Å si «prøv igjen» ville sendt
brukeren tilbake til en konto som ikke finnes, og neste forsøk svarer uansett 401.

### Bokførte gap

- **Ingenting stopper et butikk-bygg uten `EXPO_PUBLIC_WEB_BASE_URL`.** Fila er
  gitignorert, Babel baker inn `undefined`, og appen kjører helt normalt helt til noen
  åpner «Slett konto» og får «Appen mangler adressen til serveren». Sjekk den før et
  butikk-bygg — det finnes ingen port som gjør det for deg.
- **Blokk-lesingen er fail-open.** `getDeleteBlockReason` forkaster PostgREST-feil og
  leser en forbigående DB-feil som «ikke blokkert». En 403 er derfor en port, ikke en
  garanti. Oppførselen er webbens egen og uendret her — regelen har ett hjem.
- **`anonymize_user` sletter `push_subscriptions`, men ikke `apns_tokens`** (0166 kom
  etter 0142). Push er parkert til N7, så det er filt som eget issue og ikke fikset her.
- ~~**Konto-skjermen som inngang er et eier-vetopunkt.**~~ Lukket i #1906: inngangen er
  «Profil» i hjem-headeren, og sletting ligger fortsatt to nivåer ned.
- ~~**«Logg ut» står to steder.**~~ Lukket i #1906: hjem-footeren er borte, og
  utloggingen finnes bare i profil-rommet.
- ~~**`backLabel` er «Tilbake», ikke webbens «Tilbake til profil».**~~ Lukket i #1906 —
  rommet finnes, `goBack()` lander i det, og pariteten er gjenopprettet og låst i test.
- **Appen viser aldri `mode`.** Feltet er informasjon til logg og staging-bevis; for
  spilleren er utfallet det samme.
- **Appen oppretter fortsatt ikke kontoer** (`shouldCreateUser: false` i `Login.tsx`), så
  5.1.1(v) binder strengt tatt først når kontoopprettelse kommer til appen. Must-statusen
  er eiervalg — web-veien alene blir uansett en blindvei etter butikk-byttet.
- **Admin-slett av andre spillere forblir web/Sekretariat**, og webbens
  `/profile/slett-konto` er urørt.

## App→server-ruter (#1891, #1889)

Slette-ruta (#1876) var den første. Med purringen ble den et **mønster**, og fra og med
#1891 har det ett hjem: `lib/api/appAuth.ts` på webben, `src/data/webApi.ts` i appen.
`#1918` (lever lagkort) er den tredje brukeren og arvet begge uendret. `#1917` (trekk
deg selv) og `#1919` (inviter) gjør det samme — ingen skal lage en fjerde variant.

### Når trenger noe en rute i det hele tatt?

Bare når handlingen krever Node. Tre ting driver det: `notify()`, Resend-mail og
service-role. Alt annet skal appen gjøre selv, direkte mot PostgREST, med RLS som port.

«Godkjenn på vegne av gruppa» er eksempelet på hvor billig svaret kan bli når man
sjekker: det ser ut som en admin-overstyring, men er ren DB. `guard_game_players_self_update`
(0147) slipper oppretteren gjennom på andres rad, og webbens egen override
(`adminApproveScorecard`) sender ikke varsel. Appen skriver derfor de samme kolonnene
selv — ingen rute, ingen migrasjon. **Sjekk alltid dette først.** Smedens gjetning om at
«trekk deg selv» var like billig var derimot feil: vakt (c) i 0147 nekter egen rad.

### Adgangssjekken

```ts
authenticatedUserId(request)            // string | null — id KUN fra Bearer-tokenet
gameOrganiserAccess(userId, gameId)     // 'organiser' | 'not_organiser' | 'game_not_found'
```

`api/` ligger utenfor proxy-matcheren (`proxy.ts` config.matcher), så en rute her har
hverken sesjons-cookie eller `x-torny-user-id`: **ruta eier sin egen auth.** Tokenet
valideres av GoTrue via `auth.getUser(token)` på admin-klienten — det er ikke vi som
avgjør om det er ekte.

`gameOrganiserAccess` svarer med tre verdier og ikke en boolean, fordi ruta må skille
404 fra 403. Ukjent spill svares som ukjent også for en admin: ellers ville forskjellen
røpet hvem som er admin til en tilfeldig kaller.

⚠️ **Ingen id fra body eller query. Noensinne.** Bruker-id fra tokenet, spill-id fra
stien. Da finnes det ingen id å forveksle med en annens, og ingen rute kan gjøre feilen
ved et uhell. Begge rutene har en test på nettopp det, og det er verifisert live på
staging: en POST med en annen brukers id OG et annet spills id i kroppen purret spillet
i stien, og rørte ikke det i kroppen.

### Wire-kontrakten for purring

```
GET  /api/games/{id}/remind   200 { targets: number, lastRemindedAt: string | null }
POST /api/games/{id}/remind   200 { reminded: number }
     401 unauthorized · 403 forbidden · 404 not_found · 409 not_active · 500 remind_failed
```

Frosset, og speilet i `src/data/remind.ts`. **Endres den ene, endres den andre i samme
PR.** `targets` er de som er FERDIGE uten å ha levert — ikke alle som mangler kort.
`lastRemindedAt` er `max(deliver_reminder_sent_at)` over hele spillet, altså også
auto-purringens stempel: det ER «sist noen fikk purring».

Regelen selv bor i `lib/games/remindUnsubmitted.ts` og speiles ALDRI i appen. Kjernen
kjører på service-role og har **ingen egen authz** — porten ligger hos kalleren. Legger
du til et kallsted, er gaten din del av sikkerheten; det finnes ingen RLS bak den.

### Wire-kontrakten for lagkort-levering (#1918)

```
POST /api/games/{id}/submit-team   200 { submitted: number, alreadySubmitted: boolean }
     401 unauthorized · 403 forbidden · 404 not_found · 409 not_active
     422 withdrawn · 500 submit_failed
```

Frosset, og speilet i `src/data/submitTeam.ts`. **Endres den ene, endres den andre i
samme PR.** `submitted` er rader UPDATE-en traff — 1 for en solo-levering, N for et lag.
`alreadySubmitted` er sant når den traff 0 rader fordi kortet alt var levert; det er et
lovlig utfall (makkeren rakk det først), og styrer ordlyd, ikke suksess. **422 og ikke en
andre 409** for en trukket spiller: appen leser KUN statusen, så to ulike situasjoner må
ha to ulike statuser.

Regelen selv bor i `lib/games/submitScorecardCore.ts` — WD-porten, idempotensen,
lag-deteksjonen, søsken-kaskaden (#1466), varslene og revalideringen — og speiles ALDRI i
appen. Webbens server-action og ruta kaller den samme kjernen; forskjellen er klienten de
sender inn (RLS-bundet cookie-klient fra webben, `getAdminClient()` fra ruta).

⚠️ **Ruta kaller IKKE `gameOrganiserAccess`.** Dette er spillerens egen levering, og en
arrangør-sjekk ville stengt ute nettopp dem ruta er for. Autorisasjonen er at kjernen er
**selv-avgrenset**: den skriver kun raden der `user_id` = id-en fra tokenet, eller radene
der `team_number` = lagnummeret på innsenderens EGEN rad. Er du ikke deltaker, finnes det
ingen rad å utlede et lag fra, og svaret er 403. Service-role betyr at denne porten ER
hele autorisasjonen — det finnes ingen RLS bak den.

### Appen ser aldri innboks-varselet

Kanal-regelen i `notify()` sender in-app alltid, og push + e-post kun når `last_seen_at`
er eldre enn 5 minutter. **Appen skriver aldri `last_seen_at`** (kun `proxy.ts` gjør det)
og **har ingen innboks-skjerm**. En ren app-spiller regnes derfor alltid som «ikke inne»:
hen får e-post i dag, og APNs-push den dagen appen registrerer tokens (N7).

Det er ikke en feil, og det trengs ingen ny regel for det — men det betyr at purring fra
appen i praksis er en e-post til mottakeren. Verdt å vite når N7 lander og den samme
purringen plutselig også blir en push.

### Lenkeknapper: når svaret ikke er en rute

Noen henvisninger til nettsiden blir stående — bevisste grenser (cup-avslutning,
tee-editoren) og midlertidige (#1917, #1919). De skal likevel aldri være blindveier.

`lib/webLink.ts` eier `EXPO_PUBLIC_WEB_BASE_URL`-regelen, og `components/WebLinkButton.tsx`
er knappen, med den faste underteksten «Åpner nettsiden i nettleseren. Der logger du inn
med kode.» Appen og Safari deler ikke pålogging, så det skal stå der — ikke som en
unnskyldning, men fordi en bruker som vet det, ikke tror appen er ødelagt. Proxyen sender
uinnloggede til `/login?next=<sti>`, så dyplenka lander riktig etter kode-innlogging.

⚠️ **Verifiser stien mot `app/[locale]/` før du skriver den.** Kontrakten for #1891 pekte
på `/admin/courses/{id}`, som ikke er en rute — tee-editoren bor på `…/edit`. Og sjekk
hvem sida slipper inn: den samme `…/edit` er `requireAdmin`, så en ikke-admin arrangør
som trykker «Legg inn teer på nettsiden» blir sendt hjem. Knappen står fordi admin er den
eneste som KAN gjøre jobben, men det er et valg, ikke en forglemmelse.

`EXPO_PUBLIC_*` bakes inn ved bundling — samme felle som slette-flyten beskriver over.
Mangler adressen, sier både purringen og lenkeknappene det rett ut. Aldri en stille knapp.

## Profil-rommet (#1906 / #1877)

Appen hadde ingen profil-flate. Det som fantes var en tynn `Account`-skjerm og fire
lenker nederst på hjem (e-post, Konto, Sync-lab, Logg ut) — en restehylle som vokste
hver gang noe ikke passet andre steder. #1906 ga det ett rom, og #1877 ga utloggingen
en opprydding.

**Inngangen er ordet «Profil» oppe til høyre i hjem-headeren** (`testID="open-profile"`,
satt i `navigation.tsx` via `options`-funksjonen, så `Home.tsx` slipper å vite om den).
Hjem-footeren er borte i sin helhet, og `Account.tsx` er slettet.

### Hierarkiet ER endringen

På Konto-skjermen var «Logg ut» en innrammet knapp (`ui.buttonSecondary`) og «Slett
konto» en dempet lenke under den. Den reversible handlingen ropte, den irreversible
hvisket. Rommet snur det:

1. **Identitetskort** — navn (fallback: e-post, så «Profil»), e-post, «hcp 12,4» med
   webbens ferskhetsmerke. Feiler radlesingen, blir feilen inne i kortet: utlogging og
   sletting spør serveren selv og skal virke uansett — særlig sletting, som App Review
   skal finne uten forklaring.
2. **«Utvikler» → «Sync-lab»** — kun i staging-bygg. Står ØVERST av seksjonene, slik at
   sletting forblir siste rad uansett bygg.
3. **«Konto» → «Logg ut»** — en helt vanlig rad. Ingen ramme, ingen chevron (den
   navigerer ikke, den handler).
4. **Ekstra luft, så «Slett konto»** alene i egen liste, i `colors.danger`. Luften er en
   tap-buffer, ikke en marg: en tommel på vei mot «Logg ut» skal ikke treffe sletting.

Radprimitiven er `components/SettingRow.tsx` (+ `SettingList`), portert fra webbens
`components/ui/SettingRow.tsx`. Chevron er en tekst-glyf `›` inntil ikonspråket (#1879)
lander — ikke dra inn et ikonbibliotek for den.

### Staging-gaten: verten, ikke `__DEV__`

`lib/stagingGate.ts` sammenligner verten i `EXPO_PUBLIC_SUPABASE_URL` med
`STAGING_SUPABASE_HOST`. **`__DEV__` duger ikke** — eierens telefonbygg er Release, og
da ville utvikler-raden vært usynlig nettopp der den trengs. Gaten er fail-closed:
manglende, tom eller uparsbar URL gir `false`, og verten sammenlignes som vert (ikke
`includes`, som ville sluppet gjennom `…supabase.co.angriper.no`). I et butikk-bygg
finnes raden ikke i treet i det hele tatt.

### Utloggingsregelen (#1877)

`data/logout.ts` eier den, og rekkefølgen er kontrakten:

```
tell kø (inkl. karantene) → drain best-effort, racet mot 4 s → tell på nytt
  → fortsatt uleverte og ikke keepUnsent? → returner `unsent`, ingenting har skjedd
  → ellers signOut → wipe, men KUN når køen var tom
```

Motsatt av `deleteAccount`, som wiper FØR signOut: der er kontoen borte og wipen er ren
opprydding; her lever kontoen, så sesjonen skal dø først, slik at en drain som fortsatt
puster mister tilgangen i stedet for å skrive nye rader inn etter tømmingen.

**Avviket fra webben:** webben logger deg stille ut (`prepareLogout`, #1404) fordi den
ikke kan spørre midt i en POST. Appen spør — `Alert` med [Avbryt] / [Logg ut likevel].
En teeboks uten dekning er ikke kanten her, det er det normale tilfellet. Regelen om hva
som beholdes og tømmes er fortsatt #1404 sin.

⚠️ **`signOut()` sier IKKE om sesjonen ble borte.** Dette er fella i slicen, funnet i
gransking og verifisert i `@supabase/auth-js` 2.112.4. Klienten resolver med `{ error }`
i to helt ulike tilfeller:

- **Sesjonen ble ryddet, så kom feilen.** Serveren svarte ikke (den vanlige
  offline-utloggingen). `_signOut` kaller `removeCurrentSession()` før den returnerer.
  Spilleren ER logget ut.
- **Sesjonen ble stående.** Er access-tokenet utløpt OG refresh feiler med en
  nettverksfeil, hopper `_callRefreshToken` over `_removeSession` (den grenen kjører kun
  for feil som ikke er retryable), `__loadSession` svarer `{ session: null, error }`, og
  `_signOut` returnerer med en tidlig `return` FØR opprydningen. Sesjonen ligger igjen i
  AsyncStorage. Dette treffer nøyaktig én situasjon: offline i mer enn en time — altså
  en runde uten dekning.

`getSession()` kan ikke skille dem (`session: null` i begge). Det som kan, er
**`SIGNED_OUT`**: `_removeSession()` avslutter med å varsle abonnentene, og `_signOut`
venter på det kallet. `signOutAndConfirm` lytter derfor over kallet og svarer på om
eventet kom. Uten det skillet ville appen tømt hele den lokale basen for en spiller som
fortsatt er innlogget — og meldt at utloggingen gikk bra. Utfallet heter
`signout-failed`, og skjermen sier at nett er kravet i stedet for å låse raden på
«Logger ut …».

**Copyen lover ikke levering.** «Blir liggende på telefonen til du logger inn igjen, med
mindre noen andre logger inn før deg» — ikke «sendes». Karantene-rader (#668) telles
med i antallet og går aldri opp, og logger en annen bruker inn på telefonen, tømmer
eier-vakten (#1942) radene før første drain. Låst i test.

### Bokførte gap

- ~~**Ingen eier-vakt ved innlogging.**~~ Lukket i #1942 (N8 P1a, #1954):
  `data/localOwner.ts` speiler webbens `ensureLocalDataOwner` — eier-id under
  `torny:local-data-owner` i AsyncStorage, og logger en annen bruker inn, kjører
  `App.tsx` `wipeLocalData()` FØR stacken (og dermed `startSyncTriggers`) monteres.
  Første innlogging etter oppdateringen stempler uten å tømme; kaster wipen, står
  stempelet på forrige eier og neste oppstart prøver igjen. Utloggings-advarselen sier
  nå forbeholdet («… med mindre noen andre logger inn før deg»).
- **«Sett handicap» rendres ikke.** Webben har lenka; den hopper til profilskjemaet, som
  først finnes i PR B. En rad som ber deg gjøre noe appen ikke lar deg gjøre er verre
  enn ingen rad. `PROFILE_TEXT.setHandicap` står klar og paritetstestet til PR B.
- **`refreshHomeCards` er vaktet, ikke navnerommet.** `HOME_CACHE_KEY` er fortsatt
  global (`'home'`, uten `userId`); vakten sammenligner eier før skriving. Et
  bruker-prefikset nøkkelrom ville vært den egentlige fiksen.

## Rediger profil i appen (#1906, PR B)

Profil-rommet kunne lese de fem feltene; nå kan det skrive dem. «Rediger profil»
→ `screens/EditProfile.tsx` → `PUT /api/profile`.

### Hvorfor en rute, og ikke `supabase.from('users').update(...)`

Appen HAR lov til å skrive sin egen rad — RLS-policyen `users update own` tillater det.
Det er ikke skrivingen som er problemet, det er **halen**: webbens `updateProfile` kaller
`recomputeCourseHandicapForUser`, som skriver om FROSNE `game_players.course_handicap` i
runder som pågår. Den kjører på service-role, fordi 0107-triggeren
(`guard_game_players_self_update`) med vilje sperrer en spiller fra å endre sitt eget
banehandicap i et aktivt spill.

En app-side-update ville altså lykkes — og stille latt de aktive rundene stå igjen med
det gamle banehandicapet. Det er nøyaktig Ryder Cup 2026-feilen: en spiller rettet et
glemt plusshandicap-fortegn, spillene beholdt gammel CH, og han fikk fem slag for mye i
tre aktive kamper. **Derfor er hele lagringen én rute, ikke en RLS-skriving pluss et
kall.**

### Wire-kontrakten (frosset — appen speiler den)

```
PUT /api/profile
  200 { ok: true }
  400 { error: 'name_required'|'hcp_invalid'|'gender_required'|'level_invalid' }
  401 { error: 'unauthorized' }
  500 { error: 'update_failed' }
```

Kroppen bærer feltverdier og **aldri identitet**. Bruker-id-en kommer utelukkende fra
Bearer-tokenet (`lib/api/appAuth.ts`), og payloaden bygges fra parserens resultat — ikke
fra rå kropp — så det finnes ingen felt en kaller kan smugle inn. En `userId` i kroppen
ignoreres, og det er testet.

### Regelen har ett hjem: `lib/users/profileInput.ts`

Både webbens server-action og ruta kaller `parseProfileInput`. Rekkefølgen på sjekkene
(navn → hcp → gender → level) er en del av kontrakten og er låst i test: samme input skal
gi samme FØRSTE feil på begge flatene.

⚠️ **`gender` og `level` er IKKE symmetriske**, selv om de ser like ut i skjemaet:

| Input | `gender` | `level` |
|---|---|---|
| utelatt (`undefined`/`null`) | utelates fra payloaden — raden beholder verdien (#1064) | default `'normal'` |
| tom streng `''` | samme: utelates | **`level_invalid`** |

Det er dagens web-oppførsel, bevart med vilje. Sender en klient `level: ''` får den en
feil webben ikke ville gitt — send `undefined`.

`app/[locale]/complete-profile/actions.ts` har fortsatt sin EGEN kopi av de samme
reglene. Den er parkert til eget issue, og den avviker allerede litt i dag — diff dem før
de slås sammen, ikke anta at de er like.

### ⚠️ `lib/handicap/sign.ts` er en ren blad-modul, og det er lastbærende

Fila inneholdt både fortegns-konverteringen og visningen, og visningen går veien om
`Intl` (`lib/i18n/format`). Da `EditProfile` trengte `fromSignedHcp` for å vise et lagret
plusshandicap som magnitude + chip, ville hele Intl-grafen fulgt med inn i app-bundelen
for første gang — og Hermes har ikke ICU-dataene.

Visningen bor derfor i `lib/handicap/signFormat.ts`. **Legg aldri noe Intl-avhengig
tilbake i `sign.ts`.** Appen formaterer handicap lokalt (`formatHcpNb` i
`profileCopy.ts`) og låser seg mot webbens `formatHcpDisplay` i TEST, der Intl finnes.

### Bokførte gap

- **Appens cachede spill-bundle viser gammelt banehandicap til neste refetch.** Recompute
  skjer på serveren; GameHome refetcher ved fokus, så det retter seg selv — men i det
  sekundet du går tilbake fra skjemaet, kan tallet være gammelt.
- **Lagring legges aldri i sync-køen.** Skriv krever nett. En profil-endring kan ikke
  ligge lokalt og gå opp senere, for det er serveren som må regne om de aktive rundene.
