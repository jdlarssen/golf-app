# Native app-spike (N1, #1818) — runbook

Frittstående Expo-app i `native/app/` som beviser fundamentet for epic #1816:
delt `lib/scoring`-kilde med webappen og Supabase-OTP-innlogging mot staging.
Dette er IKKE produkt-appen — det er spike-fundamentet senere etapper bygger
videre på.

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
