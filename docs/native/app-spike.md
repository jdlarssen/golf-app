# Native app-spike (N1 #1818, N2 #1823, N3 #1825, N4 #1828) — runbook

Frittstående Expo-app i `native/app/` som beviser fundamentet for epic #1816:
delt `lib/scoring`-kilde med webappen, Supabase-OTP-innlogging mot staging
(N1), et lokal-først datalag med sync-kø og realtime (N2) og spillerflatene
hjem → game-home → hull-føring → scorekort → lever/godkjenn (N3). Dette er
IKKE produkt-appen ennå — men fra N3 er det flatene spillerne skal arve.

## Arkitektur-beslutninger (kontrakt `.forge/contracts/1818-native-n1-fundament-spike.md`)

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
Sync-laben lever videre som dev-verktøy, lenket nederst på Hjem.

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

Lever er GATET for kollapsede formater («Levering av lagkort gjøres på
nettsiden ennå»): webbens team-submit skriver hele lagets rader med
service-role; appen kan bare egen rad under RLS, og et halv-levert lag ville
blokkert avslutning. Restanse: `submit_team_scorecard`-RPC som egen
DB-kontrakt.

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
Picker, lagret verdi og `formatTeeOff` er da alle enhetens lokaltid. Regresjonsvakten
prøver begge sider av sommertid-skiftet.

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
