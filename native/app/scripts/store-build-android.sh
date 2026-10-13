#!/usr/bin/env bash
# native/app/scripts/store-build-android.sh
# #2560: bygg butikk-varianten av appen for Android som et signert release-AAB,
# med bevis. Motstykket til `store-build-ios.sh`, uten opplasting: AAB-en
# lastes opp i Play Console for hånd (#2561).
#
# Skriptet gjør fem ting en oppskrift ikke kan garantere:
#
#  1. **Prod-verdiene kommer fra skall-miljøet, og ingen `.env`-fil i
#     `native/app/` leses.** Samme regel som iOS (#2208): prod-URL og
#     anon-nøkkel leses fra repo-rotas `.env.local`, eksporteres for akkurat
#     denne kjøringen, og `EXPO_NO_DOTENV=1` er satt. `app.config.ts` kaster
#     hvis noe mangler (fail-closed, før prebuild).
#  2. **Signering med opplastingsnøkkelen, aldri debug-nøkkelen.** `/android`
#     lages på nytt av prebuild, og config-pluginen `withUploadSigning.js` legger
#     inn en release-signering som leser `TORNY_ANDROID_*` ved byggetid.
#     Passordet hentes fra nøkkelringen inn i miljøet til Gradle-kjøringen, og
#     står aldri i argv, i en fil eller i loggen.
#  3. **Bevis før opplasting.** `store-build-proof-android.sh` leser bundelen,
#     manifestet, `.so`-filene og signaturen i AAB-en, og stopper ved én FAIL.
#  4. **Ingen duplikat.** Finnes AAB-en for (versjon, versionCode) alt, stopper
#     skriptet: bump `STORE_ANDROID_VERSION_CODE` i `app.config.ts` først (Play
#     Console avviser en versionCode den har sett).
#  5. **Ingen stille nedlasting av SDK-pakker.** Android Gradle-pluginen henter
#     en manglende NDK eller build-tools uten å spørre. Skriptet sjekker
#     pakkene før Gradle og sier hvordan de installeres. `withNoSdkDownload.js`
#     (i `app.json`, begge variantene) skriver `android.builder.sdkDownload=false`
#     i `android/gradle.properties` under prebuild, og skriptet stopper hvis
#     linja mangler. Da stopper Gradle i stedet for å laste ned det som mangler.
#
# Bruk:  native/app/scripts/store-build-android.sh
#
# Miljø (valgfritt): TORNY_ENV_FILE (sti til .env.local), TORNY_DIST_DIR
# (standard ~/.torny-native/dist), TORNY_ANDROID_KEYSTORE (standard
# ~/.torny-native/android-upload.keystore), TORNY_ANDROID_KEY_ALIAS (standard
# torny-upload), TORNY_ANDROID_KEYSTORE_PASSWORD (bare for en testnøkkel; ellers
# hentes passordet fra nøkkelringen), ANDROID_HOME (standard
# ~/Library/Android/sdk). Runbook: docs/native/play-store-release.md.
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd "$APP_DIR/../.." && pwd)
DIST=${TORNY_DIST_DIR:-"$HOME/.torny-native/dist"}
ENV_FILE=${TORNY_ENV_FILE:-"$REPO_ROOT/.env.local"}
PROOF="$APP_DIR/scripts/store-build-proof-android.sh"
ENV_LIB="$APP_DIR/scripts/env-file.sh"
SIGNING_PLUGIN="$APP_DIR/scripts/withUploadSigning.js"
RN_VERSION_CATALOG="$APP_DIR/node_modules/react-native/gradle/libs.versions.toml"
ANDROID_HOME=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}
export ANDROID_HOME
KEYSTORE=${TORNY_ANDROID_KEYSTORE:-"$HOME/.torny-native/android-upload.keystore"}
KEY_ALIAS=${TORNY_ANDROID_KEY_ALIAS:-torny-upload}
KEYCHAIN_SERVICE='torny-android-upload-keystore'
KEYCHAIN_ACCOUNT='torny'

PROD_SUPABASE_HOST='glofubopddkjhymcbaph.supabase.co'
STORE_WEB_BASE_URL='https://tornygolf.no'
STORE_PACKAGE='no.tornygolf.app'
SIGNING_MARKER='@torny-upload-signing (#2560)'

GREP=/usr/bin/grep

step() { printf '\n▶ %s\n' "$*"; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# Hjelpeteksten er header-kommentaren over: alt fra linje 2 til første linje
# som ikke er en kommentar.
print_help() { awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) print_help; exit 0 ;;
    *) die "Ukjent argument: $1 (prøv --help)" ;;
  esac
done

[ -f "$ENV_LIB" ] || die "Fant ikke $ENV_LIB (dotenv-leseren skriptet deler med beviset)."
# shellcheck source=env-file.sh
. "$ENV_LIB"

# Verdien til en nøkkel i $ENV_FILE. Reglene står i env-file.sh.
env_value() { env_file_value "$ENV_FILE" "$1"; }

# AAB-en skal være commiten i `.android.commit`. Endrede sporede filer betyr at
# bygget ikke er commiten, så skriptet stopper. Usporede filer teller ikke
# (native/app/android er gitignorert).
require_clean_tree() {
  local dirty
  dirty=$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)
  [ -z "$dirty" ] || die "Sporede filer har lokale endringer, så AAB-en ville ikke vært commiten den sier den er. Commit eller forkast dem, og kjør igjen:
$dirty"
}

# ── 0. Verktøy ───────────────────────────────────────────────────────────────
step "Sjekker verktøy"
require_clean_tree   # tidlig, før minutter med prebuild; sjekkes igjen rett før Gradle
[ -x "$PROOF" ] || die "Fant ikke bevis-skriptet $PROOF"
[ -f "$SIGNING_PLUGIN" ] || die "Fant ikke signeringspluginen $SIGNING_PLUGIN"
[ -d "$ANDROID_HOME" ] || die "Fant ikke Android SDK-en i $ANDROID_HOME. Installer Android Studio, eller sett ANDROID_HOME."

# Gradle-versjonen i prebuild-malen kjører på JDK 17–25, og React Native
# anbefaler 17 («You may encounter problems using higher JDK versions»).
# Skriptet tar 17 hvis den finnes, ellers 21. `java_home -v 17` svarer med
# standard-JDK-en (og exit 0) når 17 mangler, så versjonen sjekkes etterpå.
JAVA_HOME=''
for jdk in 17 21; do
  candidate=$(/usr/libexec/java_home -v "$jdk" 2>/dev/null || true)
  [ -n "$candidate" ] && [ -x "$candidate/bin/java" ] || continue
  java_version=$("$candidate/bin/java" -version 2>&1 || true)
  case "$java_version" in
    *"version \"$jdk."*|*"version \"$jdk\""*) JAVA_HOME=$candidate; break ;;
  esac
done
[ -n "$JAVA_HOME" ] || die "Fant ingen JDK 17 eller 21 (/usr/libexec/java_home -V viser hva som finnes). React Native anbefaler JDK 17."
export JAVA_HOME

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]; then
  # Node 22 kreves (native/app/AGENTS + app-spike). Prøv nvm før vi gir opp.
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use 22 --silent || die "Node 22 finnes ikke i nvm: nvm install 22"
  else
    die "Node 22 kreves (fant $(node -v 2>/dev/null || echo 'ingen node'))."
  fi
fi

# SDK-pakkene Gradle trenger. Android Gradle-pluginen laster ned en pakke som
# mangler uten å spørre når lisensen er godtatt, så skriptet sjekker dem før
# Gradle. `android.builder.sdkDownload=false` (fra prebuild, sjekket under)
# gjør at alt annet som mangler, stopper bygget i stedet for å lastes ned.
#  - NDK og build-tools: versjonene React Native låser i versjonskatalogen.
#  - build-tools 35.0.0: Android Gradle-pluginens standard for biblioteker som
#    ikke setter sin egen (`ToolsRevisionUtils.DEFAULT_BUILD_TOOLS_REVISION` i
#    AGP 8.12.0, lest 2026-10-13, #2560). Bumpes AGP, stopper Gradle med navnet
#    på pakken som mangler.
AGP_DEFAULT_BUILD_TOOLS='35.0.0'
[ -f "$RN_VERSION_CATALOG" ] || die "Fant ikke $RN_VERSION_CATALOG. Kjør npm install i native/app/ først."
catalog_version() { ( ("$GREP" -E "^$1[[:space:]]*=" "$RN_VERSION_CATALOG" || true) | head -1 | sed -E 's/^[^"]*"([^"]+)".*$/\1/'); }
NDK_VERSION=$(catalog_version ndkVersion)
BUILD_TOOLS_VERSION=$(catalog_version buildTools)
[ -n "$NDK_VERSION" ] || die "Fant ikke ndkVersion i $RN_VERSION_CATALOG."
[ -n "$BUILD_TOOLS_VERSION" ] || die "Fant ikke buildTools i $RN_VERSION_CATALOG."
missing_sdk=''
[ -d "$ANDROID_HOME/ndk/$NDK_VERSION" ] || missing_sdk="$missing_sdk \"ndk;$NDK_VERSION\""
for bt in "$BUILD_TOOLS_VERSION" "$AGP_DEFAULT_BUILD_TOOLS"; do
  [ -x "$ANDROID_HOME/build-tools/$bt/aapt2" ] || missing_sdk="$missing_sdk \"build-tools;$bt\""
done
[ -z "$missing_sdk" ] || die "SDK-pakker mangler i $ANDROID_HOME:$missing_sdk. Gradle ville lastet dem ned uten å spørre (NDK-en alene er om lag 1 GB). Installer dem selv først:
  $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager$missing_sdk"
printf 'node %s · java %s · NDK %s · build-tools %s og %s · ANDROID_HOME %s\n' "$(node -v)" \
  "$(printf '%s' "$java_version" | sed -nE '1s/^[^"]*"([^"]+)".*$/\1/p')" "$NDK_VERSION" \
  "$BUILD_TOOLS_VERSION" "$AGP_DEFAULT_BUILD_TOOLS" "$ANDROID_HOME"

# ── 1. Prod-verdiene fra repo-rotas .env.local ───────────────────────────────
step "Leser prod-verdiene fra $ENV_FILE"
[ -f "$ENV_FILE" ] || die "Fant ikke $ENV_FILE. Kjør skriptet fra hovedutsjekken (worktrees har ingen .env.local), eller pek på fila med TORNY_ENV_FILE=/sti/til/.env.local."

SUPABASE_URL=$(env_value NEXT_PUBLIC_SUPABASE_URL)
ANON_KEY=$(env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)
[ -n "$SUPABASE_URL" ] || die "NEXT_PUBLIC_SUPABASE_URL mangler i $ENV_FILE"
[ -n "$ANON_KEY" ] || die "NEXT_PUBLIC_SUPABASE_ANON_KEY mangler i $ENV_FILE"

# Skjema kreves, så denne sjekken og app.config.ts leser samme vert.
scheme=$(printf '%s' "$SUPABASE_URL" | cut -c1-8 | tr '[:upper:]' '[:lower:]')
case "$scheme" in
  https://*|http://*) ;;
  *) die "NEXT_PUBLIC_SUPABASE_URL i $ENV_FILE må starte med https:// (fikk «${SUPABASE_URL}»)." ;;
esac
# Hel vert, ikke delstreng — samme regel som app.config.ts og stagingGate.ts.
host=$(printf '%s' "$SUPABASE_URL" | sed -E 's#^[Hh][Tt][Tt][Pp][Ss]?://([^/?#]+).*#\1#; s/^.*@//; s/:[0-9]+$//' | tr '[:upper:]' '[:lower:]')
[ "$host" = "$PROD_SUPABASE_HOST" ] || die "NEXT_PUBLIC_SUPABASE_URL i $ENV_FILE peker på «${host}», ikke prod-verten $PROD_SUPABASE_HOST. Er dette staging-fila?"

# Aldri en .env.production* i appen: den ville lekket inn i eierens dev-bygg.
shopt -s nullglob
for f in "$APP_DIR"/.env.production*; do
  die "Fant $f. Prod-verdier skal aldri ligge i en .env-fil i native/app/ (de lekker inn i dev-bygget). Slett fila og kjør igjen."
done
shopt -u nullglob

# Ingen .env-fil under butikkbygget (#2208): prod-verdiene kommer fra skallet.
# CI fjernes som i iOS-skriptet; prebuild får CI=1 for seg selv under.
export EXPO_NO_DOTENV=1
unset CI
export APP_VARIANT=store
export EXPO_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export EXPO_PUBLIC_WEB_BASE_URL="$STORE_WEB_BASE_URL"
printf 'APP_VARIANT=%s\nEXPO_NO_DOTENV=%s (native/app/.env*-filene leses ikke)\nEXPO_PUBLIC_SUPABASE_URL → vert %s\nEXPO_PUBLIC_SUPABASE_ANON_KEY → satt (%d tegn, skrives ikke ut)\nEXPO_PUBLIC_WEB_BASE_URL=%s\n' \
  "$APP_VARIANT" "$EXPO_NO_DOTENV" "$host" "${#ANON_KEY}" "$EXPO_PUBLIC_WEB_BASE_URL"

# ── 2. Oppløst config (kjører fail-closed-sjekkene i app.config.ts) ─────────
step "Løser opp app.config.ts for butikk-varianten"
CONFIG_JSON=$(cd "$APP_DIR" && npx expo config --type prebuild --json)
# Ett felt per linje, så et navn med mellomrom aldri skyver de andre feltene.
# `String(…)`: versionCode er et tall, og `console.log` fargelegger tall når
# FORCE_COLOR er satt — da ville fargekodene havnet i filnavnet.
CONFIG_FIELDS=$(printf '%s' "$CONFIG_JSON" | node -e '
  let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => {
    const c = JSON.parse(s);
    for (const v of [c.name, c.version, c.android?.versionCode, c.android?.package]) console.log(String(v ?? ""));
  });')
APP_NAME=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '1p')
VERSION=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '2p')
VERSION_CODE=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '3p')
PACKAGE=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '4p')
printf 'navn «%s» · versjon %s · versionCode %s · pakke %s\n' "$APP_NAME" "$VERSION" "$VERSION_CODE" "$PACKAGE"
[ "$PACKAGE" = "$STORE_PACKAGE" ] || die "Oppløst Android-pakke er «${PACKAGE}», ikke $STORE_PACKAGE. Er APP_VARIANT=store i miljøet?"
[ -n "$VERSION" ] || die "version mangler i oppløst config."
[ -n "$VERSION_CODE" ] || die "android.versionCode mangler i oppløst config."

mkdir -p "$DIST"
# Sidefilene har `.android.` i navnet: iOS-arkivet med samme versjon og build
# bruker `TornyNative-<versjon>-<build>.commit` og `.bevis.txt`, og
# `.commit`-fila er det git-merket for iOS-opplastingen leses fra (#2019).
STEM="$DIST/TornyNative-$VERSION-$VERSION_CODE"
AAB="$STEM.aab"
SIDE="$STEM.android"
if [ -e "$AAB" ]; then
  die "AAB-en $AAB finnes alt. Skal en ny AAB bygges: bump STORE_ANDROID_VERSION_CODE i native/app/app.config.ts først (Play Console avviser en versionCode den har sett). Feilet beviset sist: slett $AAB og kjør igjen."
fi

# ── 3. Nøkkelen ──────────────────────────────────────────────────────────────
step "Opplastingsnøkkelen"
[ -f "$KEYSTORE" ] || die "Fant ikke keystore-fila $KEYSTORE (se docs/native/android-twa.md §«Nøkler og hemmeligheter»), eller sett TORNY_ANDROID_KEYSTORE."
# Absolutt sti: Gradle kjører fra android/ og ville lett etter en relativ sti der.
KEYSTORE="$(cd "$(dirname "$KEYSTORE")" && pwd)/$(basename "$KEYSTORE")"
if [ -n "${TORNY_ANDROID_KEYSTORE_PASSWORD:-}" ]; then
  KEYSTORE_PASSWORD=$TORNY_ANDROID_KEYSTORE_PASSWORD
  PASSWORD_SOURCE='TORNY_ANDROID_KEYSTORE_PASSWORD fra miljøet'
else
  # Command substitution: passordet går fra nøkkelringen rett inn i en
  # variabel, aldri gjennom argv eller en fil.
  KEYSTORE_PASSWORD=$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null) \
    || die "Fant ikke passordet i nøkkelringen (tjenesten $KEYCHAIN_SERVICE, konto $KEYCHAIN_ACCOUNT). Se docs/native/android-twa.md §«Nøkler og hemmeligheter»."
  PASSWORD_SOURCE="nøkkelringen ($KEYCHAIN_SERVICE)"
fi
[ -n "$KEYSTORE_PASSWORD" ] || die "Passordet til opplastingsnøkkelen er tomt."
printf 'keystore %s · alias %s · passord fra %s (skrives ikke ut)\n' "$KEYSTORE" "$KEY_ALIAS" "$PASSWORD_SOURCE"

# ── 4. Prebuild ──────────────────────────────────────────────────────────────
# Prebuild regenererer android/ (standard i SDK 57; --no-clean er unntaket), og
# signeringspluginen legges inn av app.config.ts for butikk-varianten.
step "expo prebuild (android, regenererer android/)"
(cd "$APP_DIR" && CI=1 npx expo prebuild --platform android --no-install)
"$GREP" -qF "$SIGNING_MARKER" "$APP_DIR/android/app/build.gradle" \
  || die "Signeringspluginen er ikke i android/app/build.gradle etter prebuild. Release-bygget ville ikke vært signert med opplastingsnøkkelen. Står ./scripts/withUploadSigning.js i plugins for butikk-varianten?"
"$GREP" -qxF 'android.builder.sdkDownload=false' "$APP_DIR/android/gradle.properties" \
  || die "android/gradle.properties har ikke android.builder.sdkDownload=false etter prebuild, så Gradle kunne lastet ned SDK-pakker uten å spørre. Står ./scripts/withNoSdkDownload.js i plugins i app.json?"

# ── 5. Gradle ────────────────────────────────────────────────────────────────
require_clean_tree
step "./gradlew :app:bundleRelease (logg: $SIDE.gradle.log)"
# Nøkkelvariablene settes bare for Gradle-prosessen. --no-daemon: ingen Gradle-
# prosess blir liggende igjen med passordet i miljøet sitt etter bygget.
if ! (cd "$APP_DIR/android" && \
    TORNY_ANDROID_KEYSTORE="$KEYSTORE" \
    TORNY_ANDROID_KEY_ALIAS="$KEY_ALIAS" \
    TORNY_ANDROID_KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD" \
    ./gradlew :app:bundleRelease --no-daemon) > "$SIDE.gradle.log" 2>&1; then
  tail -60 "$SIDE.gradle.log" >&2
  die "Gradle bundleRelease feilet. Se $SIDE.gradle.log. Mangler en SDK-pakke, står navnet der; installer den med sdkmanager og kjør igjen."
fi
unset KEYSTORE_PASSWORD
BUILT="$APP_DIR/android/app/build/outputs/bundle/release/app-release.aab"
[ -f "$BUILT" ] || die "Gradle var grønn, men $BUILT finnes ikke."
cp "$BUILT" "$AAB"
# Byggecommiten, som iOS-skriptet (#2019): AAB-en kan lastes opp dager senere.
git -C "$REPO_ROOT" rev-parse HEAD > "$SIDE.commit"
printf 'AAB: %s\n' "$AAB"

# ── 6. Bevis ─────────────────────────────────────────────────────────────────
step "Bevis-steg: $PROOF"
"$PROOF" "$AAB" "$SIDE.bevis.txt" || die "Beviset feilet. Les $SIDE.bevis.txt. AAB-en ligger igjen som $AAB: slett den før du bygger på nytt, ellers stopper duplikat-vakten deg."

step "Ferdig"
cat <<EOF
AAB:     $AAB
Bevis:   $SIDE.bevis.txt   ← lim inn i issue-/PR-kommentaren
Commit:  $(cat "$SIDE.commit")
Neste:
  • Last opp AAB-en i Play Console (#2561).
  • Neste bygg: bump STORE_ANDROID_VERSION_CODE i native/app/app.config.ts først.
  • android/ er nå butikk-varianten. Kjør prebuild uten APP_VARIANT før neste dev-bygg:
    (cd native/app && npx expo prebuild --platform android --no-install)
EOF
