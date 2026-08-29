# Android-TWA — bygg og utgivelse

Tørny på Google Play er en Trusted Web Activity (TWA) generert med Bubblewrap
(epic #1276, bygget i #1279). Appen er et tynt Android-skall som åpner
`https://tornygolf.no/` i Chrome — service worker, offline-sync og web-push
virker uendret. Ingen app-oppdatering trengs når webappen endres; skallet
re-utgis bare når Play krever ny targetSdk (årlig, se «Årlig vedlikehold»).

## Nøkler og hemmeligheter (repoet er PUBLIC)

- **Upload-keystore:** `~/.torny-native/android-upload.keystore`, alias
  `torny-upload`. ALDRI inn i repoet (`native/android/.gitignore` vokter mot
  kopier, men stien over er den kanoniske).
- **Passord:** macOS-nøkkelringen — hent med
  `security find-generic-password -a torny -s torny-android-upload-keystore -w`.
  Keystore- og nøkkelpassord er identiske (PKCS12).
- **Backup:** eieren holder kopi av keystore-fila + passordet i sin
  passordhåndterer. Mistes upload-nøkkelen kan den resettes i Play Console
  (Play App Signing eier release-nøkkelen), så dette er belte-og-bukser.
- Googles **app-signing-nøkkel** (den butikk-installasjoner faktisk er signert
  med) bor hos Google: Play Console → Test and release → App integrity.

## Bygg en ny AAB

Krever Node 22 (`nvm use 22`). Bubblewrap holder egen JDK + Android SDK i
`~/.bubblewrap/` (lastes ned automatisk ved første kjøring).

```bash
cd native/android
BUBBLEWRAP_KEYSTORE_PASSWORD="$(security find-generic-password -a torny -s torny-android-upload-keystore -w)" \
BUBBLEWRAP_KEY_PASSWORD="$(security find-generic-password -a torny -s torny-android-upload-keystore -w)" \
npx @bubblewrap/cli@1.25.0 build \
  --signingKeyPath ~/.torny-native/android-upload.keystore \
  --signingKeyAlias torny-upload \
  --skipPwaValidation
```

Artefakter havner i `native/android/`: `app-release-bundle.aab` (til Play) og
`app-release-signed.apk` (til lokal enhetstest via `adb install`). Begge er
gitignorert — flytt dem til `~/.torny-native/dist/` ved behov.

Ved endring i `twa-manifest.json` (farger, versjon, ikoner): kjør
`npx @bubblewrap/cli@1.25.0 update --skipVersionUpgrade` først, så build.
Versjonsbump: `update --appVersionName <x.y.z>` bumper også versionCode.

## assetlinks.json (Digital Asset Links)

`app/.well-known/assetlinks.json/route.ts` MÅ inneholde SHA-256 fra **både**
upload-nøkkelen og Googles app-signing-nøkkel — mangler app-signing-avtrykket,
får butikk-installasjoner Chrome-URL-bar (verifiseringen feiler stille).

- Upload-nøkkelens avtrykk: `keytool -list -keystore
  ~/.torny-native/android-upload.keystore -alias torny-upload -v` → SHA256-linja.
- App-signing-avtrykket: Play Console → Test and release → App integrity →
  «App signing key certificate» → SHA-256.
- Verifiser live etter deploy:
  `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://tornygolf.no&relation=delegate_permission/common.handle_all_urls`

## Årlig vedlikehold (Play targetSdk-krav)

Google hever kravet til targetSdk hvert år (31. aug 2026: API 36 for nye
apper). Når Play Console varsler:

1. Bump `@bubblewrap/cli` til nyeste i kommandoene over (templaten eier
   targetSdk — v1.25.0 = API 36).
2. `npx @bubblewrap/cli@<ny> update --appVersionName <x.y.z>` + build.
3. Last opp ny AAB i Play Console (intern testing → promoter til produksjon).
