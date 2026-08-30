# Native app-spike (N1 #1818, N2 #1823, N3 #1825) — runbook

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
`type: "email_otp"` for `E2E_PLAYER_EMAIL`/`E2E_ADMIN_EMAIL`, tast e-post →
«Send meg kode» → minted kode → «Logg inn». Mint koden ETTER at appen har
sendt sin egen (siste OTP vinner). Staging-koder validerer kun mot staging.

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

`src/lib/formatGate.ts`: lag-kollapsede formater (`modeCollapsesToTeamCard`),
segment-spill og deriverte spill henvises til nettsiden. ⚠️ `hole_segment` er
NOT NULL med default `'full'` — gaten tester `!== 'full'`, aldri «er satt»
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
