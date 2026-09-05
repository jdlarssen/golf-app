# App Store-slipp av native-appen (N8, #1954) — runbook

Native-appen i `native/app/` erstatter Capacitor-skallet under samme App Store-oppføring
(«Tørny – golfturneringer», bundle `no.tornygolf.app`, team `8C8WCW67J9`). Denne runboken
dekker veien fra kode til «Ready for Sale»: butikk-varianten, byggeskriptet, bevis-steget,
bump-regelen, TestFlight → App Review → slipp, og hva du gjør når noe går galt.

Kontrakten (spec, eiervalg, paritetsmatrise) ligger som kommentar på
[#1954](https://github.com/jdlarssen/golf-app/issues/1954). Review-kontoen og notatet til
Apple: `app-store-review-konto.md`. Dev-appen og alt under utvikling: `app-spike.md`.

## To varianter, én `app.json`

| | dev (ingen `APP_VARIANT`) | `APP_VARIANT=store` |
|---|---|---|
| Navn | Tørny Dev | Tørny |
| Bundle-id / Android-pakke | `no.tornygolf.dev` / (ikke satt) | `no.tornygolf.app` / `no.tornygolf.app` |
| Versjon (build) | 1.0.0 | 1.1.0 (2) — se bump-regelen |
| Supabase | staging, fra `native/app/.env.local` | prod, fra repo-rotas `.env.local` — kun via skriptet |
| Web | `http://localhost:<port>` under staging-verify | `https://tornygolf.no`, nøyaktig |
| `ITSAppUsesNonExemptEncryption` | — | `false` (som skallet) |
| Associated domains | — | ingen, med vilje: lenker åpnes i Safari, der sesjonen finnes |
| På telefonen | står ved siden av butikk-appen | erstatter skallet (samme id) |

`native/app/app.config.ts` legger varianten over `app.json`; `app.json` er dev-fasiten og
røres ikke. Uten variant er resultatet bit-identisk med `app.json` — det er låst i
`native/app/app.config.test.ts` (snapshot av begge varianter).

**Fail-closed begge veier, før prebuild.** Configen kaster med norsk melding:

- `store` uten prod-verten, en anon-nøkkel og nøyaktig `https://tornygolf.no` → stopp, og
  meldingen lister hver verdi som mangler eller er feil.
- uten `store`, med prod-verten → «Dev-bygg mot prod er ikke lov». Eierens telefonbygg kan
  aldri peke på prod ved et uhell.

**Prod-verdiene ligger aldri i en `.env`-fil under `native/app/`.** `@expo/env` laster
`.env.production.local` for ethvert Release-bygg — også eierens dev-bygg mot staging.
Skriptet eksporterer verdiene i skall-miljøet for akkurat den kjøringen (skall-miljøet
vinner over `.env`-filene), og nekter å kjøre hvis en `.env.production*` finnes.

## Forutsetninger (én gang per Mac)

- Xcode 26.4+ (SDK 57-kravet) med Apple-ID-en innlogget (Settings → Accounts), team
  `8C8WCW67J9`. Signering og opplasting er automatisk (`-allowProvisioningUpdates`).
- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`) og CocoaPods. Skriptet bytter til Node 22
  selv når nvm finnes.
- `~/.torny-native/dist/ExportOptions.plist` — `method: app-store-connect`,
  `destination: upload`, `teamID: 8C8WCW67J9`. Finnes fra skallet (`ios-shell.md`).
- Repo-rotas `.env.local` (gitignorert) med `NEXT_PUBLIC_SUPABASE_URL` (prod) og
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Kjør fra hovedutsjekken — worktrees har ikke fila. Eller
  pek på den: `TORNY_ENV_FILE=/sti/til/.env.local`.
- `npm install` i `native/app/` (egen `package-lock.json`).
- **Skallet på eierens telefon:** åpne det med nett én gang (Dexie-køen tømmes) FØR
  TestFlight-bygget installeres. Samme bundle-id erstatter skallet, og uleverte slag i
  WKWebView-lageret ville gått tapt.

## Bygg og last opp

```bash
cd <repo-rota>
native/app/scripts/store-build-ios.sh              # arkiver → bevis → last opp
native/app/scripts/store-build-ios.sh --no-upload  # kandidat-sjekk: arkiver + bevis, ingen opplasting
native/app/scripts/store-build-ios.sh --upload-only ~/.torny-native/dist/TornyNative-1.1.0-2.xcarchive
                                                   # veien videre etter --no-upload: bevis + opplasting av SAMME arkiv
```

Skriptet stopper ved første feil, og gjør i rekkefølge:

1. **Verktøy:** xcodebuild, pod, Node 22, `ExportOptions.plist`.
2. **Prod-verdiene** fra `.env.local`: verten må være prod-verten (hel vert, ikke delstreng);
   anon-nøkkelen må finnes. Skriver vert og nøkkel-lengde til skjermen — aldri nøkkelen.
3. **Eksporterer** `APP_VARIANT=store` + de tre `EXPO_PUBLIC_*` i skall-miljøet, og løser
   opp configen med `npx expo config --type prebuild` — der kaster `app.config.ts` hvis noe
   er galt. Navn, versjon, build og bundle-id skrives ut.
4. **Duplikat-vakt:** finnes `~/.torny-native/dist/TornyNative-<versjon>-<build>.xcarchive`
   alt, stopper skriptet før kompilering og spør hva du vil: laste opp det arkivet
   (`--upload-only`) eller kompilere på nytt (bump først — App Store Connect avviser samme
   buildnummer to ganger).
5. **`expo prebuild --platform ios --no-install`** — regenererer `ios/` (standard i SDK 57;
   `--no-clean` er unntaket). App-navnet endrer scheme-navnet (`TrnyDev` → `Trny`), så
   dev-`ios/` gjenbrukes aldri. Så `pod install` med `LANG=en_US.UTF-8`.
6. **`xcodebuild archive`** (Release, `generic/platform=iOS`, `DEVELOPMENT_TEAM=8C8WCW67J9`).
   Xcodes «Bundle React Native code and images»-steg kjører Metro med `--reset-cache`, så
   det finnes ingen gammel bundle å arve. Full logg i `…archive.log`; ved feil vises de
   siste 60 linjene.
7. **Bevis-steget** (under) — én FAIL, og ingenting lastes opp.
8. **`xcodebuild -exportArchive`** med `ExportOptions.plist` → laster opp. Skriptet leter
   etter «Upload succeeded» i loggen; mangler frasen etter en grønn eksport, sjekk App Store
   Connect → TestFlight før du kjører igjen (en ny kjøring krever bump).

Alt havner i `~/.torny-native/dist/TornyNative-<versjon>-<build>.*`: `.xcarchive`,
`.archive.log`, `.bevis.txt`, `.export.log`, `.export/`.

**Etter `--no-upload`:** når beviset er lest og kandidaten er god, laster du opp *samme*
arkiv — ingen ny kompilering, så bundelen som havner i App Store Connect er nøyaktig den
bevis-fila beskriver:

```bash
native/app/scripts/store-build-ios.sh --upload-only ~/.torny-native/dist/TornyNative-1.1.0-2.xcarchive
```

Kommandoen kjører beviset på nytt (nøkkel-sjekken inkludert når repo-rotas `.env.local`
finnes), eksporterer og laster opp. Den trenger ikke Node eller CocoaPods.

## Bevis-steget

```bash
native/app/scripts/store-build-proof.sh ~/.torny-native/dist/TornyNative-1.1.0-2.xcarchive
```

Kan kjøres på nytt på et eksisterende arkiv (eller en `.app`) uten å bygge. Skriver
`…bevis.txt` — **lim den inn i issue-kommentaren** (P3 i kontrakten). Exit 0 = alt PASS.

| Kilde | Regel |
|---|---|
| `main.jsbundle` (Hermes → `strings`) | **KREV** `https://glofubopddkjhymcbaph.supabase.co` og `https://tornygolf.no`. |
| | **FORBY** `://snwmueecmfqqdurxedxv` (staging-adressen fra miljøet) og `localhost:3111`. Ett *bart* treff på staging-ref-en er forventet — `src/lib/stagingGate.ts` har verten som literal (gaten for utvikler-raden). |
| | **FORBY** hele adresser `127.0.0.1`, `192.168.x.x`, `10.0.x.x` (fire oktetter med ikke-siffer på begge sider), IPv6-literaler (`://[…]`) og `.local:` som ren tekst. Hermes pakker strengtabellen uten skilletegn («draft-2020-1» + «27.0.0.15…» inneholder 127.0.0.1 uten å være en IP), derfor kreves adresseformen. |
| | Anon-nøkkelen: står `EXPO_PUBLIC_SUPABASE_ANON_KEY` i miljøet (byggeskriptet setter den; `--upload-only` leser den fra `.env.local`), må nøyaktig den verdien finnes i bundelen. Bare lengden skrives ut, aldri nøkkelen. |
| | `http://` og `localhost`: hvert treff må stå på lista over kjente bibliotek-strenger i skriptet (zod sin JSON-Schema-URL, Metros `localhost:8081/assets/`, auth-js sin `localhost:9999`, phoenix sin bare `http://`). Alt annet → FAIL med kontekst. Phoenix-literalen har ingen vert selv, så det som følger i den pakkede tabellen er nabo-strengen; den godtas når halen ikke er en vert (et ord uten punktum, kolon eller skråstrek, eller en annen URL-literal). |
| `Info.plist` | `CFBundleIdentifier = no.tornygolf.app`, versjon og build satt, `ITSAppUsesNonExemptEncryption = false`. |
| Entitlements (`codesign -d --entitlements`) | INGEN `com.apple.developer.associated-domains`, INGEN `aps-environment`. |

Lista over kjente bibliotek-strenger ble seedet fra `expo export` av begge varianter
(2026-09-05, P2) og bekreftes mot det ekte arkivet i P3. Får du «UKJENT» på en `http://`-
eller `localhost`-streng: les konteksten. Er det en ny bibliotek-streng, legg den på lista
i `store-build-proof.sh` med kommentar om hvor den kommer fra. En UKJENT på formen
`http://<ord uten punktum, kolon eller skråstrek>` er phoenix-literalen med en ny nabo, ikke
en lekkasje. Er det en adresse vi eier, er bygget feil — ikke lista.

## Bump-regelen

App Store Connect avviser et duplikat (versjon, build). Før hver ny opplasting:

- `STORE_IOS_BUILD_NUMBER` i `native/app/app.config.ts` +1 (og `STORE_ANDROID_VERSION_CODE`
  i takt — Android-oppfølgeren arver tallet).
- Ny `STORE_VERSION` når appen endrer seg for brukerne; hold den over skallets `1.0`.
- Skriptet nekter å kompilere hvis arkivet for (versjon, build) alt finnes. Skal det
  arkivet lastes opp, er veien `--upload-only <arkiv>` — ikke en bump.

Første kandidat er `1.1.0 (2)`; skallet brukte `1.0 (1)`.

## Etter bygget: tilbake til dev

`native/app/ios/` er nå butikk-varianten (workspace/scheme `Trny`, bundle
`no.tornygolf.app`). Før neste dev-bygg eller simulator-runde:

```bash
cd native/app && npx expo prebuild --platform ios --no-install
```

(uten `APP_VARIANT` i miljøet). `native/app/.env.local` med staging-verdiene er urørt av
butikkbygget — skriptet skriver aldri til den.

## TestFlight → App Review → slipp

1. Bygget dukker opp i App Store Connect → TestFlight etter 5–30 min behandling. Intern
   tester = eieren. Installer over skallet (åpne skallet med nett først, se
   forutsetningene).
2. **Paritetsmatrisen (P4)** og **første ekte prod-avslutning (P5)** — kontrakten §4. Aldri
   demo-runden, aldri en syntetisk runde.
3. **App Review-pakken (P6)** — kontrakten §5: revidert personvern-etikett (ingen posisjon),
   omskrevet beskrivelse (bare det appen kan), skjermbilder fra staging-data, review-notatet
   i `app-store-review-konto.md`. Eieren re-provisjonerer review-kontoen FØR innsending og
   ETTER hver review (`app-store-review-konto.md` §Reset).
4. **Innsending = manuell utgivelse** («Manually release this version»). Eieren trykker
   «Release This Version» når det passer.
5. **Etterkontroll (P7)** — kontrakten §6: installer fra App Store over TestFlight-bygget,
   OTP-innlogging, åpne et ferdig spill, en mail-lenke skal åpne Safari.

## Rollback

| Fase | Hva kan gå galt | Tilbake slik |
|---|---|---|
| Kandidat i TestFlight | Paritetsbrudd, prod-avslutning feiler | Ingen offentlig endring har skjedd. Fiks → bump → nytt bygg. Eierens telefon: installer skallet `1.0 (1)` igjen fra TestFlight (gyldig til 28.11.2026) eller rebuild skallet (`ios-shell.md`). |
| Under review | Avvisning | «Developer Rejected» / fjern fra køen i App Store Connect; fiks; bump; nytt bygg. Ingenting er publisert. |
| Etter slipp | Kritisk feil i appen | (1) App Store Connect → Pricing and Availability → **Remove from Sale** (oppføringen bort, installerte apper virker). (2) Send skallet som ny versjon (`1.2.0`, build høyere enn native) fra `native/ios/` — be om Expedited Review. (3) Alle har hele tiden nettsiden: «bruk tornygolf.no i nettleseren til vi har rettet» er den reelle nød-utgangen. |
| Data | — | Ingen DB-migrasjon i N8, ingen skjema-endring; appen skriver gjennom de samme kontraktene som web. Uleverte slag i appens kø: åpne appen med nett før du bytter tilbake — køen tømmer seg selv. |

Forutsetning for (2): `native/ios/` beholdes buildbar til N8 er lukket + én app-oppdatering.

## Feilsøking

- `pod install` kræsjer → `LANG=en_US.UTF-8` (skriptet setter det; gjør det selv om du
  kjører for hånd).
- Swift-interop-feil i `expo-modules-jsi` → Xcode er for gammel; SDK 57 krever 26.4+.
- Appen krasjer ved oppstart etter nye native moduler → `expo prebuild` + `pod install` på
  nytt; `expo export` fanger ikke dette.
- Beviset feiler på **prod-adressen mangler** eller **`://snwmueecmfqqdurxedxv`** → miljøet
  nådde ikke bundleren. Kjør skriptet igjen fra et rent skall; sjekk at ingen
  `.env.production*` finnes i `native/app/`.
- Beviset feiler på **UKJENT `http://…`** → se «Bevis-steget».
- **Duplikat-vakten stopper deg** → var det `--no-upload`-arkivet du ville laste opp? Da er
  det `--upload-only <arkiv>`, ikke en bump.
- **To feilede byggeforsøk → stopp** og skriv opp hva som skjedde (T8 i
  `docs/agent-discipline/core.md`). Ikke forsøk nummer tre på håp.

## Hva som ikke byttes

Nettsiden `tornygolf.no` består i sin helhet (døråpner: invitasjoner, `/spectate`,
banesider, self-reg, admin, cup, liga). Android/Play er urørt av N8 og får eget issue.
Supabase, Resend og Vercel endres ikke. Dev-appen `no.tornygolf.dev` mot staging er
uendret arbeidsflate. Hele lista: kontrakten §8.
