# Kontrakt: Android-TWA med Bubblewrap → klar for intern testing (#1279)

## Problem

Tørny finnes kun som PWA. Eieren har nå betalt Google Play Console (og Apple Developer);
Play-kontoen venter kun på ID-verifisering. Alt agent-arbeid for Android-pakken kan gjøres
FØR verifiseringen er godkjent — målet er at AAB-en ligger ferdig bygget og signert, med
riktige assetlinks, i det øyeblikket Google godkjenner eieren, slik at vennegjengen kan
installere fra Play samme uke (#1279-målet).

## Drift-tabell (issue-tekst 2026-07-19 vs. HEAD/live 2026-08-29)

| Issue-påstand | Virkelighet nå | Konsekvens |
|---|---|---|
| «bubblewrap init mot **www**, ikke apex — apex 307-er til www» | Primærvert er byttet: apex `tornygolf.no` server alt 200 direkte; www 308-er til apex (Vercel-edge) | TWA-host = **apex** `tornygolf.no`; init mot `https://tornygolf.no/manifest.webmanifest` |
| «Bubblewrap v1.24.1, template targetSdk 35 oppfyller Play-kravet for 2026» | **Play krever API 36 for NYE apper fra 2026-08-31** — om to dager. Bubblewrap **v1.25.0** (juli 2026) bumper templaten til targetSdk/compileSdk 36 (verifisert i template `build.gradle` på main) | Bruk `@bubblewrap/cli@1.25.0`; verifiser `targetSdkVersion 36` i generert prosjekt |
| (implisitt fra #1277-design) www skulle serve `.well-known` direkte | www 308-er ALT på Vercel-edge (respons uten app-CSP-header) — dashboard-flippen fra #1277 ser ikke ut til å være gjort | Ikke blokkerende (Google verifiserer mot apex). Observasjon, out of scope |

## Research-funn

- Bubblewrap 1.25.0 (npm, publisert juli 2026): targetSdk 36-bump for 2026-08-31-fristen
  (GoogleChromeLabs/bubblewrap #1047). Template på main: `compileSdkVersion 36`,
  `targetSdkVersion 36`.
- Første kjøring laster ned egen JDK 17 + Android SDK (~2–3 GB) til `~/.bubblewrap` etter
  to interaktive Y/n + lisensaksept. Disk ledig: 9,9 GB — OK, men ikke dupliser SDK-er.
- `enableNotifications: true` i `twa-manifest.json` = notification delegation (web-push
  vises med appens navn/ikon, ingen FCM-SDK).
- Live manifest på apex er TWA-klart: id `/`, name/short_name «Tørny», standalone,
  portrait, theme `#1b4332`, bg `#f8f6f0`, ikoner 192+512 any + 192+512 maskable.
- `e2e/public/well-known.spec.ts` (@gate) asserter form (200, JSON, `android_app`), IKKE
  fingerprint-verdier — fingerprint-bytte brekker ingen tester.

## Tidligere beslutninger (arves)

- **Pakkenavn `no.tornygolf.app`** — låst i #1277-kontrakten og allerede deployet i
  placeholder-assetlinks. Endres ikke (pakkenavn er permanent i Play).
- **TWA via Bubblewrap, IKKE Capacitor på Android** — epic #1276, ikke re-litiger.
- **Repoet er PUBLIC** — aldri commit keystore, passord eller e-poster.
- **Eier-valg i denne økten:** Play-listing-navn = **«Tørny – golfturneringer»**.
  Launcher-navn (under ikonet) = «Tørny».

## Design

**1. Bubblewrap-prosjekt i `native/android/`** (committes; søster til `native/assets/`):
- `twa-manifest.json` håndskrives/init-es med: host `tornygolf.no`, startUrl `/`,
  packageId `no.tornygolf.app`, name «Tørny», launcherName «Tørny»,
  `enableNotifications: true`, orientation portrait, themeColor `#1B4332`,
  backgroundColor `#F8F6F0`, navigationColor mørk variant etter skjønn, fallbackType
  `customtabs`, appVersionName `1.0.0` / appVersionCode `1`, display `standalone`,
  iconUrl `https://tornygolf.no/icon0` (512 any) og maskableIconUrl
  `https://tornygolf.no/icons/maskable-512.png`. Builder-skjønn: bruk evt.
  `native/assets/android-foreground-432.png`/`-background-432.png` for penere adaptivt
  ikon hvis Bubblewraps maskable-generering blir stygg (sjekk generert res/).
- `.gitignore` i `native/android/`: build-output (`app/build/`, `.gradle/`), `*.keystore`,
  `*.aab`, `*.apk`, `store_icon.png`-o.l. genererte binærer beholdes hvis små/nødvendige —
  builder-skjønn, men ALDRI nøkler.
- Generert prosjekt committes så årlig targetSdk-heving er en diff, ikke en nyskaping.

**2. Upload-keystore** (utenfor repoet): `keytool -genkeypair` (deterministisk, ingen
interaktiv init-avhengighet) → `~/.torny-native/android-upload.keystore`, alias
`torny-upload`, RSA 2048, gyldighet 25+ år. Passord: generer sterkt, lagre i macOS
Keychain (`security add-generic-password -a torny -s torny-android-upload-keystore`).
Play App Signing gjør tapt upload-nøkkel resettbar — lav risiko, men eieren får beskjed
om å ta backup (kopier fil + passord til passordhåndterer/iCloud).

**3. Bygg:** `bubblewrap update` + `bubblewrap build` (via npx `@bubblewrap/cli@1.25.0`,
Node 22 via nvm) → signert `app-release-bundle.aab` + universal APK. Verifiser
signatur-fingerprint mot keystoren og `targetSdkVersion 36` i generert `build.gradle`.
AAB/APK legges i `~/.torny-native/dist/` (ikke repo) + kopi på Skrivebordet til eieren
for enkel opplasting («torny-1.0.0.aab»).

**4. assetlinks-oppdatering** i `app/.well-known/assetlinks.json/route.ts`: bytt
placeholder-fingerprint med upload-nøkkelens SHA-256 (fra `keytool -list`). Googles
app-signing-fingerprint finnes først ETTER at eieren har opprettet appen og lastet opp
første AAB — den legges til som oppfølgingscommit på samme branch når eieren limer den
inn (guiden ber om den). Kommentaren i fila oppdateres til å reflektere tilstanden.

**5. Eier-guide (norsk, kopier-lim-klar)** postes som kommentar på #1279 når bygget er
ferdig: (a) opprett app i Play Console («Tørny – golfturneringer», norsk, app, gratis),
(b) last opp AAB til intern testing, (c) hent app-signing SHA-256 fra Test and release →
App integrity og lim inn her, (d) legg til testere (e-postliste) + del opt-in-lenke.
Kort runbook for gjenbygg/årlig SDK-heving: `docs/native/android-twa.md`.

## Kanttilfeller & vakter

- **Ingen hemmeligheter i repo:** keystore, passord og AAB ligger utenfor; twa-manifest
  inneholder kun offentlig info (fingerprints er offentlige by design).
- **Interaktive prompts:** bubblewrap kan spørre (JDK/SDK-nedlasting, lisens) — driv med
  pipe/expect; aldri la et hengende prompt tolkes som suksess (I3).
- **Gradle/JDK-feil på macOS/ARM:** bruk Bubblewraps egen JDK/SDK (den håndterer aarch64),
  ikke systemets. To feilede byggeforsøk → T8, ikke forsøk #3.
- **Fingerprint-format:** `keytool` gir kolon-separert uppercase hex — eksakt det
  assetlinks krever. Ikke håndrediger utover copy-paste.
- **Commit-typer:** `feat(native): …` med `[no-changelog]` i body (ikke bruker-synlig før
  butikk-lansering i #1280; changeloggen er web-appens). `Refs #1279` i alle.
- **Staging-verifisering:** ikke relevant — ingen bruker-synlig app-flate endres
  (assetlinks er maskinlesbar fil; @gate-testen dekker formen). Ingen `.changes/`-notat.
- **PR-en har ikke produktvalg** (navnet er allerede eier-besluttet her) → auto-merge-
  policyen gjelder når CI er grønn. Draft-først-flyten (#1516) følges.

## Suksesskriterier

- [x] `native/android/` committet med `twa-manifest.json`: host `tornygolf.no`, packageId
      `no.tornygolf.app`, `enableNotifications: true` (fil-refs som bevis)
      — EVIDENS: commit 6193888c, `native/android/twa-manifest.json:2-4,14`
- [x] Generert `build.gradle` viser `targetSdkVersion 36` (grep-output)
      — EVIDENS: `native/android/app/build.gradle:54,59` (compileSdk 36 / targetSdk 36),
      minSdk 21, versionCode 1 / versionName "1.0.0"
- [x] Signert `app-release-bundle.aab` bygget; signatur-SHA-256 matcher upload-keystoren
      (kommando-output fra `keytool`/`apksigner`), kopi lagt på eierens Skrivebord
      — EVIDENS: `keytool -printcert -jarfile` = `keytool -list` på keystoren =
      `CC:57:CB:7B:…:6C:0F`; `~/Desktop/torny-1.0.0.aab` (1,0 MB) + `~/.torny-native/dist/`
- [x] `app/.well-known/assetlinks.json/route.ts` inneholder upload-nøkkelens ekte
      SHA-256 (ikke `00:…`) — EVIDENS: commit 2847042e; `tsc --noEmit` exit 0, lint 0
      errors. `e2e/public/well-known.spec.ts` (@gate, form-assertions uendret) kjøres av
      PR-CI mot staging
- [x] Eier-guide (a–d over) postet som kommentar på #1279, norsk og kopier-lim-klar
      — EVIDENS: issuecomment-5464791645
- [x] `docs/native/android-twa.md` runbook committet — EVIDENS: commit 4ec08891
- [x] VERIFICATION GAP eksplisitt dokumentert i PR: app-signing-fingerprint, faktisk
      opplasting og enhets-installasjon er eier-steg som skjer etter ID-verifisering —
      issuet lukkes IKKE før akseptkriteriene i #1279 er innfridd
      — EVIDENS: PR-body-seksjonen «Verifiseringsgap (eier-steg gjenstår)»

## Gates (per chunk)

- [ ] `npx tsc --noEmit` (via `npm run build` hvis route-fila røres)
- [ ] `npx vitest run` for co-located tester av endrede filer (ingen ventes)
- [ ] `npm run lint`
- [ ] Bubblewrap-bygget selv: exit 0 + AAB-artefakt finnes

## Filer som trolig røres

- `native/android/**` — nytt Bubblewrap-prosjekt (twa-manifest.json + generert prosjekt)
- `app/.well-known/assetlinks.json/route.ts` — ekte fingerprint(s)
- `docs/native/android-twa.md` — ny runbook
- `.gitignore` / `native/android/.gitignore` — nøkkel-/build-ekskludering

## Out of scope

- #1280: lukket test (12 testere/14 dager), Play-listing-tekster/skjermbilder, produksjons-
  lansering, data-safety-skjema (guides der)
- iOS-løpet (#1281–#1284)
- Endringer i `app/manifest.ts`/PWA-manifestet
- www-vertens Vercel-redirect (#1277-eiersteget som ikke ble flippet) — ikke blokkerende;
  nevnes for eieren separat
- Play Console-handlinger (opprette app, laste opp, invitere testere) — eier-steg med guide
