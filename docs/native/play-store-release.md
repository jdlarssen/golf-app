# Runbook: Play-slipp av native-appen (#2560)

Native-appen i `native/app/` skal inn i Google Play under pakken `no.tornygolf.app`, den samme
pakken TWA-en (`native/android/`) bruker i dag. Denne runboken dekker veien fra kode til en
signert AAB: forutsetningene, byggeskriptet, bevis-steget og tilbake til dev. Den slutter med
spike-funnene fra første Android-bygg. Opplasting, lukket test og Play-oppføringen hører til
#2561. Teksten, Data safety og erklæringene eieren limer inn i Play Console, står i
[`play-store-metadata.md`](play-store-metadata.md).

Kontrakten ligger som kommentar på [#2560](https://github.com/jdlarssen/golf-app/issues/2560).
iOS-motstykket er `app-store-release.md`. Variantene (dev og butikk) er de samme der, og
tabellen «To varianter, én `app.json`» gjelder også Android.

## Forutsetninger (én gang per Mac)

- **Android SDK** i `~/Library/Android/sdk` (eller `ANDROID_HOME`), med `cmdline-tools/latest`
  og `build-tools` som har `aapt2`. Skriptet trenger disse SDK-pakkene, og stopper før Gradle
  hvis en mangler:
  - `ndk;27.1.12297006`: React Native låser akkurat denne versjonen i
    `native/app/node_modules/react-native/gradle/libs.versions.toml` (`ndkVersion`). 2,4 GB på
    disk.
  - `build-tools;36.0.0`: samme katalog (`buildTools`).
  - `build-tools;35.0.0`: Android Gradle-pluginens standard for biblioteker som ikke setter sin
    egen versjon (AGP 8.12.0). 186 MB.

  Installer det som mangler med `sdkmanager`. Skriptet skriver ut hele kommandoen.
  **Gradle laster ikke ned noe selv, verken i dev- eller butikkbygget.** Config-pluginen
  `withNoSdkDownload.js` står i `app.json` og skriver `android.builder.sdkDownload=false` i
  `android/gradle.properties` ved hver prebuild. Mangler en pakke, stopper bygget og loggen sier
  hvilken. Butikkskriptet stopper før Gradle hvis linja mangler. Uten den henter Android
  Gradle-pluginen pakken uten å spørre så lenge lisensen er godtatt. Det skjedde med
  `build-tools;35.0.0` i første debug-bygg 13.10.
- **JDK 17 eller 21.** React Native anbefaler 17 («You may encounter problems using higher JDK
  versions»), og Gradle 9.3 fra prebuild-malen kjører på 17–25. Skriptet tar 17 hvis den finnes,
  ellers 21, og bryr seg ikke om hvilken JDK som er standard på Mac-en (her 25). Merk at
  `/usr/libexec/java_home -v 17` svarer med standard-JDK-en når 17 mangler. Derfor sjekker
  skriptet versjonen den får.
- **Node 22.** Skriptet bytter selv når nvm finnes.
- **Opplastingsnøkkelen** `~/.torny-native/android-upload.keystore` (alias `torny-upload`) og
  passordet i nøkkelringen. Se `android-twa.md` §«Nøkler og hemmeligheter»: samme nøkkel som
  TWA-en, og keystore-passordet er også nøkkelpassordet (PKCS12).
- **Repo-rotas `.env.local`** med `NEXT_PUBLIC_SUPABASE_URL` (prod) og
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Kjør fra hovedutsjekken, eller pek på fila med
  `TORNY_ENV_FILE=/sti/til/.env.local`.
- `npm install` i `native/app/` (egen `package-lock.json`).

## Bygg

```bash
cd <repo-rota>
native/app/scripts/store-build-android.sh
```

Skriptet stopper ved første feil, og gjør dette i rekkefølge:

1. **Verktøy og rent tre:** ingen lokale endringer i sporede filer, JDK 17 eller 21, Node 22,
   og SDK-pakkene over.
2. **Prod-verdiene** fra `.env.local`, med samme regler som iOS-skriptet: hel prod-vert,
   anon-nøkkelen må finnes, ingen `.env.production*` i `native/app/`, `EXPO_NO_DOTENV=1`.
   Skriptet skriver vert og nøkkel-lengde, aldri nøkkelen.
3. **Oppløst config** (`npx expo config --type prebuild`): pakken må være `no.tornygolf.app`.
   Navn, versjon og versionCode skrives ut.
4. **Duplikat-vakt:** finnes `~/.torny-native/dist/TornyNative-<versjon>-<versionCode>.aab`
   alt, stopper skriptet. Bump `STORE_ANDROID_VERSION_CODE` i `native/app/app.config.ts`
   først, for Play Console avviser en versionCode den har sett.
5. **Nøkkelen:** keystore-fila må finnes. Passordet hentes med
   `security find-generic-password -a torny -s torny-android-upload-keystore -w` rett inn i en
   variabel. Det står aldri i argv, i en fil eller i loggen.
6. **`expo prebuild --platform android`** regenererer `android/`. Config-pluginen
   `withUploadSigning.js` (bare i butikk-varianten) legger inn en `release`-signering som leser
   `TORNY_ANDROID_KEYSTORE`, `TORNY_ANDROID_KEY_ALIAS` og `TORNY_ANDROID_KEYSTORE_PASSWORD` fra
   miljøet når Gradle kjører. Malens `signingConfig signingConfigs.debug` i `release` byttes
   ut. Mangler en av variablene når release bygges, stopper Gradle og navngir den. Skriptet
   sjekker at pluginen er med i `android/app/build.gradle` før det går videre.
7. **`./gradlew :app:bundleRelease`** med nøkkelvariablene satt bare for Gradle-prosessen, og
   `--no-daemon`, så ingen Gradle-prosess blir liggende igjen med passordet. Alle fire ABI-ene
   (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) bygges. Hele loggen går til
   `….android.gradle.log`, og ved feil vises de siste 60 linjene.
8. **Bevis-steget** (under). Én FAIL stopper skriptet.

Alt havner i `~/.torny-native/dist/`: `TornyNative-<versjon>-<versionCode>.aab` og sidefilene
`….android.gradle.log`, `….android.commit` (byggecommiten) og `….android.bevis.txt`.
Sidefilene har `.android.` i navnet fordi iOS-arkivet med samme versjon og build bruker
`TornyNative-<versjon>-<build>.commit` og `.bevis.txt`. Uten det ville et Android-bygg
overskrevet `.commit`-fila git-merket for iOS-opplastingen leses fra.

## Bevis-steget

```bash
native/app/scripts/store-build-proof-android.sh ~/.torny-native/dist/TornyNative-1.1.0-3.aab
```

Kan kjøres på nytt på en AAB uten å bygge. Uten bevis-fil som andre argument skriver det til
`TornyNative-<versjon>-<versionCode>.android.bevis.txt` ved siden av AAB-en. Exit-kodene er de
samme som i iOS-beviset: 0 betyr alt PASS, 1 minst én FAIL, 2 feil bruk eller et verktøy som mangler, og 3 at skriptet stoppet før
slutten, så bevis-fila er ufullstendig.

| Kilde | Regel |
|---|---|
| `base/assets/index.android.bundle` (Hermes) | Alle bundel-reglene fra iOS-beviset, fra samme fil (`bundle-proof.sh`): begge strengtabellene og æ/ø/å-vakta, prod-adressen og `https://tornygolf.no` kreves, staging-adressen, `localhost:3111` og LAN er forbudt, loopback (`127.0.0.1`, `[::1]`, `localhost`) er bare lov som supabase-js sin bare literal (høyst så mange som pakken forklarer, uten skjema eller port), anon-nøkkelen fra miljøet må finnes, ingen verdi fra appens `.env`-filer, og `http://` må stå på lista over kjente bibliotek-strenger (`localhost` har loopback-regelen). Begrunnelsen står i tabellen i `app-store-release.md`. |
| Manifestet (`base/manifest/AndroidManifest.xml`, protobuf) | `aapt2` fra build-tools leser det etter at skriptet har pakket manifestet og `resources.pb` om til en proto-APK. Ingen bundletool. **KREV** pakke `no.tornygolf.app`, en versionCode (tallet skrives ut) og `targetSdkVersion` ≥ 36. **FORBY** `android:debuggable="true"` og et `autoVerify`-intent-filter for `tornygolf.no`. Fail-closed: bare en debuggable-verdi som er tydelig usann eller ikke satt, gir PASS, og et `autoVerify` som ikke er tydelig `false`, regnes som på. Det er motstykket til iOS-regelen om associated domains: appen claimer ikke lenker. En vert som er en ressursreferanse (`@string/…`) kan ikke leses her, og regnes som `tornygolf.no`. |
| Tillatelsene | Hele `uses-permission`-lista skrives ut som informasjon. **FAIL** når en tillatelse fra `expo.android.blockedPermissions` i `native/app/app.json` står i manifestet (lista leses derfra, den kopieres ikke inn i skriptet). En `app.json` uten lista, eller et manifest som ikke ble lest, gir også FAIL. |
| `.so`-filene (16 KB-sider) | Hver `.so` under `base/lib/arm64-v8a/` og `base/lib/x86_64/` må ha LOAD-justering ≥ 16384. FAIL lister filene som ikke har det. En av de to mappene uten `.so` er FAIL. 32-bit (`armeabi-v7a`, `x86`) skrives ut som informasjon, for 16 KB-kravet gjelder bare 64-bit. |
| Signaturen | AAB-en er signert, og `jarsigner -verify` godtar den. Nøyaktig én signerer, med samme SHA-256 som opplastingsnøkkelen. Avtrykket leses fra `app/.well-known/assetlinks.json/route.ts` (linja etter `// Upload key`), ikke kopiert inn i skriptet. Ikke nøyaktig ett avtrykk der gir FAIL. Debug-nøkkelen eller en annen nøkkel gir også FAIL. |

`android-proof.py` ved siden av skriptet leser manifest-utdataene fra `aapt2` og LOAD-
justeringen i ELF-filene. Selve reglene står i skallskriptet.

## Etter bygget: tilbake til dev

`android/` er nå butikk-varianten, med pakken `no.tornygolf.app` og signeringspluginen. Før
neste dev-bygg:

```bash
cd native/app
npx expo prebuild --platform android --no-install
npx expo run:android
```

Dev-varianten har pakken `no.tornygolf.dev`, så den står ved siden av butikk-appen på
telefonen, og den signeres med debug-nøkkelen som før. Den får også
`android.builder.sdkDownload=false`, så `expo run:android` stopper og navngir en SDK-pakke som
mangler i stedet for å laste den ned.

## Nettsiden samme dag

Bryteren for lanseringsdagen (#2562) står i `app-store-release.md` §«Nettsiden samme dag». Med
`on` er appen i begge butikkene. Da viser «Hent appen» Google Play-merket på Android og begge
merkene på PC. Demoknappene heter «Hent appen» og går rett til butikken på telefon (til
`/demo` på PC), og `/demo` peker til appen i stedet for å kjøre demorunden.

1. Åpne `https://play.google.com/store/apps/details?id=no.tornygolf.app` (står i
   `lib/app/storeLinks.ts`) i en nettleser. Viser den ikke Tørny, venter du.
2. Eieren setter `NEXT_PUBLIC_APP_LAUNCH` til `on` i Vercel (Production), og prod deployes på
   nytt.
3. Sjekk i prod, på Android og på PC: de samme stedene som for `ios` (også hjem-banneret,
   «Hvorfor Tørny» og guiden), og i tillegg:
   - demoknappen på forsiden og på «Hvorfor Tørny»: heter «Hent appen» og går til Google
     Play på Android, til `/demo` på PC;
   - `/demo`: begge merkene, ingen demorunde;
   - «Hvorfor Tørny»: lenka under «Hent appen» heter «Eller kom i gang her på nettet».
4. Tilbake: sett `ios` igjen (eller `off`) og deploy på nytt.

## Paritet

Matrisen bor i én kommentar på #1954:
[Paritetsmatrisen N8 v2](https://github.com/jdlarssen/golf-app/issues/1954#issuecomment-6254489176).
Android-kolonnen (Del B, emulatoren `torny_api36` mot staging) prøver det som er
plattformavhengig: tilbaketasten, kant-til-kant, tastaturet, dialogene, ekte flymodus,
forgrunn og bakgrunn, utlogging med tom cache og slett konto. Tallene for stableford og
greensome skal stemme med både nettsiden og iOS-kolonnen.

Android-kolonnen ble kjørt 19.10.2026. Appen var dev-varianten (Debug-APK-en fra 14.10, som har
de samme native-modulene som `main`). JS-en var fra `origin/main` aea0f30c5, altså etter #2609
med A1–A4, pluss rettingen B1 under. Tallene var like med nettsiden og iOS-kolonnen. Én feil
ble funnet, og den er rettet med tester som var røde først:

- **B1 — tastaturet dekket feltet.** Appen tegner kant til kant på alle Android-versjoner
  (Expo SDK 57), og da krymper ikke vinduet når tastaturet kommer opp. E-postfeltet for
  invitasjoner på startbilletten lå under tastaturet. `KeyboardInset` i `App.tsx` krymper
  roten med det tastaturet faktisk dekker, og det gjelder alle skjermene. Arkene i en
  `Modal` hadde allerede `KeyboardAvoidingView`. Samme feil fantes på iOS (startbilletten og
  veiviseren). Den er rettet i samme PR, med RNs egen måling på rullefeltet.

Butikk-AAB-en som prøves på eierens
Android-telefon (Del C), står med versjon og build i matrisen. Ekte avslutning fra en
Android-telefon tas i den lukkede testen i januar (eierens svar 18.10).

## Feilsøking

- **«SDK-pakker mangler»:** kjør `sdkmanager`-kommandoen skriptet skriver ut. Nye versjoner
  kommer når React Native eller Android Gradle-pluginen bumpes.
- **Gradle stopper med «Failed to find …» eller «not installed»:** en SDK-pakke skriptet ikke
  kjenner, mangler. Installer den med `sdkmanager` og kjør igjen. Det er
  `android.builder.sdkDownload=false` som gjør at bygget stopper i stedet for å laste ned.
- **«Release-bygget stoppet: TORNY_ANDROID_… mangler i miljøet»:** Gradle ble kjørt uten
  skriptet. Bygg med skriptet.
- **«android/gradle.properties har ikke android.builder.sdkDownload=false»:** prebuild la ikke
  inn linja. Står `./scripts/withNoSdkDownload.js` i `plugins` i `app.json`?
- **«Signeringspluginen er ikke i android/app/build.gradle»:** `app.config.ts` la ikke til
  pluginen. Er `APP_VARIANT=store` satt? Står `./scripts/withUploadSigning.js` i `plugins` for
  butikk-varianten?
- **«withUploadSigning (#2560): fant ikke …» under prebuild:** Expo har endret malen for
  `android/app/build.gradle`. Les den nye malen og rett ankrene i pluginen.
- **Emulatoren vil ikke starte («Not enough space to create userdata partition»):** sett
  `disk.dataPartition.size=3G` i `~/.android/avd/<navn>.avd/config.ini`.
- **Installer aldri butikk-AAB-en på en emulator eller telefon.** Den peker på prod. Bruk
  dev-bygget mot staging til alt som skal prøves.

## Spike-funn (13.10.2026)

Første Android-bygg, kjørt 13.10.2026. Dev-varianten (debug) kjørte på en emulator (Pixel 7-profil,
API 36, arm64, Google APIs) logget inn som testbrukeren Ola Kompis mot staging. Butikk-varianten
ble bygget som release-AAB med en kast-nøkkel og målt med beviset. Referansen er dev-appen i
iOS-simulatoren (iPhone 16e, iOS 26.5) med samme bruker og samme staging-data. Skjermbildene og
sammenligningen ligger på bevissiden i PR-en. Rettingene hører til oppfølgeren på #2560.

| # | Punkt | Hvordan målt | Resultat | Forslag til oppfølgeren |
|---|---|---|---|---|
| 1 | Kant-til-kant (targetSdk 36) | Skjermbilder av Login, Home, Hole og Resultater i lys og mørk, sammenlignet med iOS. Innfelt fra `adb shell dumpsys window`: navigasjonslinja er 63 px (24 dp). | **OK.** Statuslinja er gjennomsiktig, og innholdet starter under den på alle fire skjermene. Navigasjonslinja dekker ingen knapper. To ting er felles med iOS, ikke Android-feil: på Home ruller innholdet inn under klokka, og «Opprett spill» slutter 20 dp/pt fra bunnen, inne i navigasjonslinja (Android) og hjemindikatoren (iOS). På Login står innholdet 8–17 dp lavere enn på iOS: innfeltet øverst er høyere på Pixel 7-profilen enn på iPhone 16e, og linjeboksene i punkt 3 kommer i tillegg. Innfeltet er forventet plattformoppførsel. | Vurder én felles retting for begge plattformene: bunnmarg med `insets.bottom` på Home, og en bakgrunn bak statuslinja når innholdet ruller under. |
| 2 | Tilbaketasten og prediktiv tilbake | `adb shell input keyevent KEYCODE_BACK` og kant-sveip, med `dumpsys activity` etter hvert steg. Manifestet har `android:enableOnBackInvokedCallback="false"`. Dialogen fra `AccountSettings.tsx`: emulatoren i flymodus, ett slag tastet på Hole, så «Logg ut». Appdataene ble tømt (`pm clear`) før nettet kom tilbake, og staging har fortsatt ingen rad for slaget. | **OK.** Resultater → Hole → Home → hjemskjermen. Arket «Annet» på Hole lukkes og blir stående på Hole. Kant-sveip fra Hole lander på Home. Dialogen «Slag som ikke er sendt» blir stående etter tilbaketasten, kant-sveip og trykk utenfor (`cancelable: false` virker). «Avbryt» lukker den, og «Logg ut» kan trykkes igjen. | Ingen. Dialogen har Androids systemstil (se under). |
| 3 | Fraunces-snittene | Glyfbånd målt i skjermbildene, omregnet til dp/pt: «8» på Hole, «Par 4», «God kveld, Ola» og etiketten over. | **RETTET** (PR #2581): `frauncesLine`/`interLine` har en Android-gren målt på emulatoren, og `includeFontPadding` er av, også i de delte `ui`-stilene. «HULL» → «8» og datoen → hilsenen står innenfor 1 dp av artboardet. Før: **BREKKER (designavvik, 1,3–2,4 dp).** Ingen klipping, og glyfene er like store på begge plattformene («8»: 69,3 dp mot 69,3 pt). Avstanden mellom linjene er større på Android: «HULL» → «8» er 13,0 dp mot 11,7 pt, datoen → «God kveld» 9,9 mot 8,6, og «Par 4» → «Indeks» 14,1 mot 11,7. Det passer med at Android legger til `includeFontPadding` og bruker win-målet (1,47), mens `frauncesLine` er målt for iOS. | Android-gren i `frauncesLine`/`interLine` (`includeFontPadding: false` og Androids egne mål), målt mot artboardet som i #2385. |
| 4 | Deling med view-shot | «Del bag-taggen» i profilen. Logcat viser `act=android.intent.action.CHOOSER`. | **OK for bag-taggen**: Androids delingsark åpner med bildet av taggen. **UKJENT for «Del kortet» i Kavalkaden**: Kavalkaden trenger web-adressen, og dev-miljøet har ingen `EXPO_PUBLIC_WEB_BASE_URL` (LogBox: «[kavalkade] status feilet no-web-base-url»). Begge bruker `shareImage`. | Prøv «Del kortet» med en web-adresse satt, f.eks. mot webben lokalt på staging. |
| 5 | Kalender | «Legg til i kalender» på startbilletten til et planlagt spill. Logcat og `dumpsys package`. | **OK.** Appen sender `ACTION_INSERT` (`content://com.android.calendar/…`), og Google Kalender tar den. Ingen tillatelsesdialog, og pakken har ingen kalendertillatelser (`blockedPermissions` virker). Selve hendelsen vises ikke på emulatoren, for Google Kalender krever en Google-konto først. | Se hendelsesvinduet på en ekte telefon med Google-konto. |
| 6 | Datovelger | Opprett spill → «Bane og tid» → «Tee-off». | **RETTET** (PR #2581): «Tee-off» er to rader på Android, «Dato» og «Klokkeslett» (eierens valg 14.10), hver med sin dialog. Klokkeslettet er i 24 t. Den andre delen av tidspunktet står, og Avbryt endrer ingenting. Før: **BREKKER.** Android viser bare en datodialog, så klokkeslett kan ikke velges. Etter OK kommer «Render Error: Cannot read property 'dismiss' of undefined» (`DateTimePickerAndroid.android.js:149`), og etter «Dismiss» er hele appen hvit. `CourseStep.tsx` bruker `mode="datetime"` og `display="inline"`, og biblioteket støtter dem bare på iOS. | Android-gren: `DateTimePickerAndroid.open` med `mode: 'date'` og så `mode: 'time'`, eller to felt. |
| 7 | 16 KB-sider | Beviset (`store-build-proof-android.sh`) mot butikk-AAB-en. | **OK.** `arm64-v8a`: 21 av 21 `.so` har LOAD-justering ≥ 16384. `x86_64`: 21 av 21. 32-bit (informasjon): 12 av 21 `.so` i både `armeabi-v7a` og `x86` er 4096-justert. Det er ventet, for kravet gjelder bare 64-bit. | Ingen. |
| 8 | HTTP-diskcache | Innlogget, spill åpnet, så utlogget. `adb shell run-as no.tornygolf.dev ls` på `cache/`. Bare mapper og antall, og URL-ene telt per sti-prefiks. | **RETTET** (PR #2581): `no-url-cache` har en Android-del som setter en `OkHttpClientProvider`-fabrikk uten cache og sletter `cache/http-cache` fra eldre bygg ved oppstart. Etter utlogging finnes ingen `http-cache`. Før: **BREKKER.** `cache/http-cache` er OkHttp-cachen til React Native. Innlogget hadde den 26 svar, 25 av dem fra staging `/rest/v1` og 1 fra `/storage/v1`. Etter utlogging lå 27 svar (55 filer) der fortsatt. Det er samme funn som #1973 på iOS. `no-url-cache` finnes bare for iOS. | Android-delen av `no-url-cache`: slå av OkHttp-cachen (egen `OkHttpClientFactory` uten `Cache`), eller tøm `cache/http-cache` ved utlogging. |
| 9 | Varseltillatelsene | Beviset skriver hele `uses-permission`-lista fra butikk-AAB-en. Kildene er lest i bibliotekenes egne manifest. | **RETTET** (PR #2581): `blockedPermissions` blokkerer varsel-, merke-, FCM-, `SYSTEM_ALERT_WINDOW`- og lagringstillatelsene, og beviset har en FAIL-regel. Butikk-AAB-en ber om 7 tillatelser. Før: **BREKKER (butikk-klarhet).** `expo-notifications` legger til `POST_NOTIFICATIONS` og `RECEIVE_BOOT_COMPLETED`. Via sine avhengigheter kommer Firebase Messaging 25.0.1 (`com.google.android.c2dm.permission.RECEIVE`, `WAKE_LOCK`) og ShortcutBadger 1.1.22 (16 badge-tillatelser for Samsung, HTC, Sony, Apex, Solid, Huawei, OPPO, Everything Me og `READ_APP_BADGE`). Malen legger i tillegg inn `SYSTEM_ALERT_WINDOW`, `VIBRATE` og `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32). `expo-network` gir `ACCESS_NETWORK_STATE` og `ACCESS_WIFI_STATE`, og `expo-application` gir `BIND_GET_INSTALL_REFERRER_SERVICE`. Varsler er av på Android ved lansering, men Play viser tillatelsene i oppføringen. | `blockedPermissions` for varsel- og badge-tillatelsene og `SYSTEM_ALERT_WINDOW`, og en FAIL-regel i beviset (kontrakten, O5). |
| 10 | Varselbryteren skjult | Skjermbilde av «Varsler og tema» i lys og mørk. | **OK.** Bare «Tema» (Lys, Mørk, Følg telefonen) vises, ingen varsel-del. Overskriften heter fortsatt «Varsler». | Vurder overskriften «Tema» på Android. |

Andre funn under spiken:

- **Build-tools 35.0.0 ble lastet ned av Gradle** i første debug-bygg, uten å spørre (186 MB, fra
  Googles SDK). Byggeskriptet sjekker nå pakkene, og prebuild skriver
  `android.builder.sdkDownload=false` for begge variantene (se «Forutsetninger»).
- **Resultater-headeren følger plattformen.** Android viser venstrejustert tittel med «←» og
  skyggelinje, iOS sentrert tittel med rund tilbakeknapp. Det er react-native-screens sin standard.
  Skal Android se ut som iOS, trengs `headerTitleAlign: 'center'` og egen tilbakeknapp.
- **Dialogene har Androids systemstil.** «Slag som ikke er sendt» viser knappene «AVBRYT» og
  «LOGG UT LIKEVEL» i store bokstaver og plattformens farge, ikke Tørnys. iOS viser sin egen
  systemdialog. Det er `Alert.alert` på begge.
- **«→» i knappene** faller tilbake til systemskriften på begge plattformene, men ser ulik ut:
  tynn Roboto-pil på Android og SF-pil på iOS («Fortsett på hull 1 →»).
- **Mørk modus** følger telefonen på Android, selv om prebuild advarer om at
  `userInterfaceStyle` trenger `expo-system-ui`. Alle fire skjermene skifter tema med
  `adb shell cmd uimode night yes`.
