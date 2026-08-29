# iOS-skall — bygg og push-oppsett

Tørny på iOS er et Capacitor 8-skall (`native/ios/`) som laster
`https://tornygolf.no` (remote-URL, arkitektur besluttet i spike #1281 — funn-notat
på epic #1276). Ingen service worker i skallet; CapacitorCookies skal ALDRI
aktiveres (cookie-sesjonen overlever force-quit og restart uten den).

## Nøkler og hemmeligheter (repoet er PUBLIC)

- **APNs-nøkkel (.p8):** `~/.torny-native/apns/AuthKey_<KEYID>.p8`. ALDRI i repoet.
- **Server-env** (lokalt i `.env.local`-stil / Vercel hos eieren):
  `APNS_KEY_ID` (10 tegn), `APNS_TEAM_ID` (`8C8WCW67J9`), `APNS_BUNDLE_ID`
  (`no.tornygolf.app`), `APNS_PRIVATE_KEY` (base64 av hele .p8-fila:
  `base64 -i AuthKey_<KEYID>.p8 | tr -d '\n'`). Manglende env → APNs-sending
  no-op-er stille (samme mønster som VAPID for web-push).
- **Signering:** Apple-ID i Xcode (Settings → Accounts), team `8C8WCW67J9`,
  automatic signing. Team-ID-en står i utviklersertifikatets OU-felt.

## Bygg til fysisk enhet

Krever Node 22 (`nvm use 22`) og Xcode 26+. Enhets-ID til xcodebuild er
UDID-en fra «Available destinations»-lista (IKKE devicectl-UUID-en); telefonen
må være ulåst første gang (developer disk image monteres da).

```bash
cd native/ios
npx cap sync ios
cd ios/App
xcodebuild -project App.xcodeproj -scheme App \
  -destination 'id=<UDID>' -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=8C8WCW67J9 build
xcrun devicectl device install app --device <DEVICECTL-UUID> \
  ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device <DEVICECTL-UUID> no.tornygolf.app
```

## Push-arkitekturen (#1282)

- **Entitlement:** `App/App.entitlements` (`aps-environment`) er koblet i begge
  build-konfigurasjonene; AppDelegate har de to Capacitor-hookene for
  token-registrering. Dev-bygg gir SANDBOX-tokens, TestFlight/App Store gir
  produksjons-tokens — serveren self-healer miljøet per token
  (`apns_tokens.environment`, se `lib/notifications/push/apns.ts`).
- **Klientsiden bor i webappen** (`lib/pwa/push.ts`, Capacitor-gren bak
  `window.Capacitor`-deteksjon) — deployes via Vercel uten butikk-release.
  Skallet trenger bare pluginen (`@capacitor/push-notifications`) og
  entitlementen.
- **Serversiden:** `notify()` → `sendPushToUser` fan-out til både
  `push_subscriptions` (web-push) og `apns_tokens` (APNs). Døde tokens prunes
  (410/Unregistered; BadDeviceToken i begge miljøer).

## TestFlight — arkiver og last opp (#1283)

Første opplasting skjedde 2026-08-30 (build 1.0 (1)). Gjenta slik ved ny build
(husk å bumpe `CURRENT_PROJECT_VERSION` i `project.pbxproj`, ellers avviser
App Store Connect duplikat-buildnummeret):

```bash
cd native/ios && npx cap sync ios && cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ~/.torny-native/dist/Torny-<versjon>-<build>.xcarchive archive \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=8C8WCW67J9
xcodebuild -exportArchive \
  -archivePath ~/.torny-native/dist/Torny-<versjon>-<build>.xcarchive \
  -exportOptionsPlist ~/.torny-native/dist/ExportOptions.plist \
  -exportPath ~/.torny-native/dist/export -allowProvisioningUpdates
```

`ExportOptions.plist` (ligger i `~/.torny-native/dist/`) bruker
`method: app-store-connect` + `destination: upload` — eksporten LASTER OPP
selv via Apple-ID-en som er innlogget i Xcode. Vellykket kjøring slutter med
«Upload succeeded» + «EXPORT SUCCEEDED». Builden dukker opp i App Store
Connect → TestFlight etter 5–30 min behandling.

- `ITSAppUsesNonExemptEncryption=false` i `Info.plist` — eksport-kontroll-
  dialogen («App Encryption Documentation») stilles aldri igjen; appen bruker
  kun OS-ets HTTPS.
- **Offline-skjermen** er `www/error.html` via `server.errorPath` — norsk,
  auto-probe hvert 5. s. Testes fysisk: flymodus + kald start.
- **TestFlight-builds utløper etter 90 dager** — testerne mister appen uten ny
  build. Re-utgi før utløp til App Store-utgaven (#1284) tar over.
