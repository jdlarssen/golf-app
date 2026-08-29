# Kontrakt: Produksjonsklart iOS-skall + TestFlight (#1283)

## Problem

Skjelettet fra #1282 (`native/ios/`) virker (push, sesjon), men mangler produksjonspolish:
kald start uten nett gir svart skjerm (spike-funn), PWA-«installer som app»-banneret
vises inne i skallet, ikoner/splash er Capacitor-defaults, universal links mangler, og
ingenting er lastet opp til App Store Connect. Målet i natt: skallet polert, arkivert og
opplastet; eieren som intern TestFlight-tester; ekstern «vennegjengen»-lenke sendt til
Beta App Review (~15 t kø — ferdigstilles i morgen).

## Research-funn (verifisert)

- `server.errorPath` (Capacitor-config): lokal HTML-side vises når webview-lasten
  feiler → offline-skjermen kan være ren HTML i `www/` (norsk, Tørny-palett, retry +
  auto-probe) — ingen Swift nødvendig.
- Eksterne verter åpner SYSTEM-browser by default («all external URLs are opened in the
  external browser») → navigasjonsgrense-kravet er default-oppfylt; ingen
  `allowNavigation` trengs (kun tornygolf.no er intern via `server.url`).
- Assets klare fra #1278: `appstore-1024.png` (uten alfa — ASC-krav),
  `ios-splash-logo.png` (512, transparent, komponeres på linen `#F8F6F0`).
- Team `8C8WCW67J9`; AASA-ruta har placeholder `TEAMID.no.tornygolf.app` som må bli
  `8C8WCW67J9.no.tornygolf.app`.

## Tidligere beslutninger (arves)

Remote-URL apex, ingen SW i skallet, aldri CapacitorCookies (#1281); butikknavn
«Tørny – golfturneringer» (eier-valgt for Play, gjenbrukes for App Store); bundle
`no.tornygolf.app`; commits `[no-changelog]` + `Refs #1283`; repo er PUBLIC.

## Design

1. **Web-fix (deployes via Vercel):** `lib/pwa/detect.ts` — Capacitor-native regnes som
   installert (`window.Capacitor?.isNativePlatform?.()` → `isStandalone()` true), som
   fjerner install-banner/nudges i skallet på ALLE flater med én endring. Nettleser-
   oppførsel uendret (dødkode-gren).
2. **AASA:** `app/.well-known/apple-app-site-association/route.ts` → ekte appID
   `8C8WCW67J9.no.tornygolf.app`, `components` beholder `/*` (deeplink-vokabularet er
   bredt: /games, /login, /signup, /cup — smaling er ikke verdt vedlikeholdet).
3. **Skall-polish (`native/ios/`):**
   - `www/error.html` + `server.errorPath` — norsk, forest/linen-palett, «Prøv igjen»-
     knapp + auto-probe (fetch mot apex hvert 5. s → redirect til appen når nettet er
     tilbake). Dekker kald start uten nett OG lastefeil underveis.
   - AppIcon: `appstore-1024.png` inn i `Assets.xcassets` (single-size).
   - Splash: `ios-splash-logo.png` i Splash-imageset, storyboard-bakgrunn `#F8F6F0`.
   - Associated Domains-entitlement: `applinks:tornygolf.no` (ren form — CDN-pickup tar
     timer/døgn; universal-link-verifisering skjer når Apple-CDN-en har hentet AASA).
   - Statusbar/safe-area: visuell sjekk på enhet; webappen håndterer safe-area selv.
   - Haptics: IKKE i natt (out of scope — eget lite issue hvis ønsket).
4. **Arkiv + opplasting:** `xcodebuild archive` (Release) → `-exportArchive` med
   `method: app-store-connect`, `destination: upload`, automatic signing
   (`-allowProvisioningUpdates`, eierens Xcode-sesjon). MARKETING_VERSION 1.0, build 1.
5. **Eier-steg (parallellt):** ASC-app-record (navn, språk nb, bundle-id, SKU), deretter
   TestFlight: seg selv som intern tester; ekstern gruppe «Vennegjengen» med public
   link → submit til Beta App Review (ferdig i morgen).

## Kanttilfeller & vakter

- `errorPath`-siden er lokal → ingen Capacitor-avhengigheter i den (ren HTML/JS).
- Auto-probe må ikke DDoS-e: 5 s-intervall, stopper når siden forlates.
- Ingen hemmeligheter i repo; ingen endring i web-push/APNs-stiene.
- Dev-reinstall på eierens iPhone FØR arkivering: fysisk verifisere offline-skjerm
  (flymodus kald start) + at install-banneret er borte (etter web-deploy).
- Web-endringene er bruker-synlige KUN inne i skallet → staging-klikkrunde ikke
  mulig/relevant; verifiseres fysisk på enheten. `[no-changelog]`.

## Suksesskriterier (i natt)

- [ ] `detect.ts`-fix + AASA-appID merget og deployet; `curl` viser ekte appID
- [ ] Fysisk iPhone: kald start i flymodus viser Tørny-offline-skjermen (aldri
      svart/hvit), og appen laster selv når nettet kommer tilbake
- [ ] Fysisk iPhone: install-banneret er borte i skallet
- [ ] Ikoner + splash: hjemskjerm-ikonet er Tørny-ikonet; splash viser logo på linen
- [ ] Arkiv lastet opp til App Store Connect; build synlig i TestFlight (Processing/klar)
- [ ] Eieren installert via TestFlight (intern) — kjerneflyt-sjekk light
- [ ] Ekstern gruppe m/ public link sendt til Beta App Review
- [ ] VERIFICATION GAP dokumentert: vennegjenge-installasjon (kriterium 1) og
      universal-link-test (kriterium 4) fullføres når Beta-review/CDN er klare —
      issuet lukkes først da

## Filer som trolig røres

- `lib/pwa/detect.ts` (+ evt. test), `app/.well-known/apple-app-site-association/route.ts`
- `native/ios/capacitor.config.json`, `native/ios/www/error.html`,
  `native/ios/ios/App/App/{Assets.xcassets,App.entitlements,Base.lproj}`
- `docs/native/ios-shell.md` — TestFlight-seksjonen fylles

## Out of scope

- App Store-innsendingen (#1284), haptics, smaling av AASA-components,
  Android-løpet, rebuild-kadens-kalenderen (settes når #1284 nærmer seg)
