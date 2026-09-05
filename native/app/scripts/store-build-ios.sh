#!/usr/bin/env bash
# native/app/scripts/store-build-ios.sh
# Native N8 (#1954, P2): bygg butikk-varianten av appen for iOS og last den opp
# til App Store Connect — med bevis FØR opplasting.
#
# Hvorfor et skript og ikke en oppskrift: de tre `EXPO_PUBLIC_*`-verdiene bakes
# inn ved bundling, og ingenting stopper et butikkbygg med feil adresse — appen
# kjører helt normalt til noen trykker «Slett konto». Skriptet gjør derfor tre
# ting en oppskrift ikke kan garantere:
#
#  1. **Prod-verdiene kommer fra skall-miljøet, aldri fra en `.env`-fil.**
#     `@expo/env` laster `.env.production.local` for ETHVERT Release-bygg — også
#     eierens dev-bygg mot staging. Skriptet leser prod-URL + anon-nøkkel fra
#     repo-rotas `.env.local` (gitignorert) og eksporterer dem for akkurat denne
#     kjøringen. `app.config.ts` kaster hvis noe mangler (fail-closed, før prebuild).
#  2. **Bevis før opplasting.** `store-build-proof.sh` leser bundelen, Info.plist
#     og entitlements i arkivet og stopper alt ved én FAIL.
#  3. **Ingen duplikat-kompilering.** Finnes arkivet for (versjon, build) alt,
#     stopper skriptet: skal det arkivet lastes opp, bruk `--upload-only`; skal
#     det kompileres på nytt, bump `STORE_IOS_BUILD_NUMBER` i `app.config.ts`
#     først (App Store Connect avviser samme buildnummer to ganger).
#
# Bruk:  native/app/scripts/store-build-ios.sh [--no-upload]
#        native/app/scripts/store-build-ios.sh --upload-only <sti.xcarchive>
#   --no-upload            arkiver + bevis, men ikke last opp (kandidat-sjekk)
#   --upload-only <arkiv>  kjør beviset på et eksisterende arkiv og last det opp —
#                          veien videre etter --no-upload, uten ny kompilering
#
# Miljø (valgfritt): TORNY_ENV_FILE (sti til .env.local), TORNY_DIST_DIR
# (standard ~/.torny-native/dist). Runbook: docs/native/app-store-release.md.
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd "$APP_DIR/../.." && pwd)
DIST=${TORNY_DIST_DIR:-"$HOME/.torny-native/dist"}
ENV_FILE=${TORNY_ENV_FILE:-"$REPO_ROOT/.env.local"}
EXPORT_OPTIONS="$DIST/ExportOptions.plist"
PROOF="$APP_DIR/scripts/store-build-proof.sh"

TEAM_ID='8C8WCW67J9'
PROD_SUPABASE_HOST='glofubopddkjhymcbaph.supabase.co'
STORE_WEB_BASE_URL='https://tornygolf.no'
STORE_BUNDLE_ID='no.tornygolf.app'

GREP=/usr/bin/grep

step() { printf '\n▶ %s\n' "$*"; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# Hjelpeteksten er header-kommentaren over: alt fra linje 2 til første linje
# som ikke er en kommentar. Ingen linjetall å holde i takt med fila.
print_help() { awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; }

UPLOAD=1
UPLOAD_ONLY=''
while [ $# -gt 0 ]; do
  case "$1" in
    --no-upload) UPLOAD=0 ;;
    --upload-only)
      shift
      UPLOAD_ONLY=${1:-}
      [ -n "$UPLOAD_ONLY" ] || die "--upload-only trenger stien til et .xcarchive."
      UPLOAD_ONLY=${UPLOAD_ONLY%/}   # tab-fullføring gir «…xcarchive/»
      ;;
    -h|--help) print_help; exit 0 ;;
    *) die "Ukjent argument: $1 (prøv --help)" ;;
  esac
  shift
done
if [ "$UPLOAD" = "0" ] && [ -n "$UPLOAD_ONLY" ]; then
  die "--no-upload og --upload-only kan ikke kombineres."
fi

# ── Felles: verktøy, bevis, eksport ──────────────────────────────────────────
require_export_tools() {
  command -v xcodebuild >/dev/null || die "xcodebuild mangler — installer Xcode (26.4+ for SDK 57)."
  [ -f "$EXPORT_OPTIONS" ] || die "Fant ikke $EXPORT_OPTIONS (method app-store-connect, destination upload — se docs/native/ios-shell.md §TestFlight)."
  [ -x "$PROOF" ] || die "Fant ikke bevis-skriptet $PROOF"
}

# Siste linje i .env-fila som setter nøkkelen; `export KEY=` og innrykk godtas.
# Samme regler som dotenv for verdien: « # kommentar» på slutten og etterfølgende
# mellomrom strippes FØR anførselstegnene, CR fra en Windows-redigert fil fjernes.
env_value() {
  local line
  line=$("$GREP" -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$ENV_FILE" | tail -1 || true)
  [ -n "$line" ] || return 0
  local value=${line#*=}
  value=${value%$'\r'}
  # Anførselstegn først: innholdet mellom dem er verdien, også når det har « #».
  # Ellers gjelder dotenv-regelen for uanførte verdier: « # kommentar» og
  # etterfølgende mellomrom strippes.
  case "$value" in
    \"*) value=$(printf '%s' "$value" | sed -E 's/^"([^"]*)".*$/\1/') ;;
    \'*) value=$(printf '%s' "$value" | sed -E "s/^'([^']*)'.*$/\\1/") ;;
    *)   value=$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//') ;;
  esac
  printf '%s' "$value"
}

run_proof() {
  local archive=$1 proof_file=$2
  step "Bevis-steg: $PROOF"
  "$PROOF" "$archive" "$proof_file" || die "Beviset feilet — ingenting lastes opp. Les $proof_file. Arkivet ligger igjen som $archive: slett det (rm -rf) før du kompilerer på nytt, ellers stopper duplikat-vakten deg."
}

run_export() {
  local archive=$1 stem=$2
  step "xcodebuild -exportArchive (laster opp via $EXPORT_OPTIONS; logg: $stem.export.log)"
  if ! xcodebuild -exportArchive -archivePath "$archive" \
      -exportOptionsPlist "$EXPORT_OPTIONS" -exportPath "$stem.export" \
      -allowProvisioningUpdates > "$stem.export.log" 2>&1; then
    tail -60 "$stem.export.log" >&2
    die "exportArchive feilet — se $stem.export.log"
  fi
  if "$GREP" -q 'Upload succeeded' "$stem.export.log"; then
    printf 'Upload succeeded — bygget dukker opp i App Store Connect → TestFlight om 5–30 min.\n'
  else
    printf '⚠ EXPORT SUCCEEDED, men fant ikke «Upload succeeded» i loggen. Sjekk App Store Connect → TestFlight før du kjører igjen (en ny kompilering krever bump).\n'
  fi
}

# ── --upload-only: bevis + opplasting av et arkiv som alt finnes ─────────────
if [ -n "$UPLOAD_ONLY" ]; then
  step "Opplasting av eksisterende arkiv"
  case "$UPLOAD_ONLY" in
    *.xcarchive) ;;
    *) die "--upload-only vil ha et .xcarchive, fikk «$UPLOAD_ONLY»." ;;
  esac
  [ -d "$UPLOAD_ONLY" ] || die "Fant ikke arkivet $UPLOAD_ONLY"
  ARCHIVE=$(cd "$(dirname "$UPLOAD_ONLY")" && pwd)/$(basename "$UPLOAD_ONLY")
  STEM=${ARCHIVE%.xcarchive}
  require_export_tools
  # Nøkkel-sjekken i beviset trenger nøkkelen i miljøet; les den hvis fila finnes.
  if [ -f "$ENV_FILE" ]; then
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$(env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)
    export EXPO_PUBLIC_SUPABASE_ANON_KEY
  fi
  if [ -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
    printf '⚠ Fant ingen NEXT_PUBLIC_SUPABASE_ANON_KEY i %s — beviset kan ikke sjekke nøkkelen i bundelen (de andre reglene gjelder). Kjør fra hovedutsjekken, eller TORNY_ENV_FILE=…, for full sjekk.\n' "$ENV_FILE"
  fi
  run_proof "$ARCHIVE" "$STEM.bevis.txt"
  run_export "$ARCHIVE" "$STEM"
  step "Ferdig"
  printf 'Arkiv:   %s\nBevis:   %s.bevis.txt   ← lim inn i issue-/PR-kommentaren\n' "$ARCHIVE" "$STEM"
  exit 0
fi

# ── 0. Verktøy ───────────────────────────────────────────────────────────────
step "Sjekker verktøy"
require_export_tools
command -v pod >/dev/null || die "CocoaPods (pod) mangler."
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
printf 'node %s · %s · pod %s\n' "$(node -v)" "$(xcodebuild -version | head -1)" "$(pod --version)"

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
  *) die "NEXT_PUBLIC_SUPABASE_URL i $ENV_FILE må starte med https:// (fikk «$SUPABASE_URL»)." ;;
esac
# Hel vert, ikke delstreng — samme regel som app.config.ts og stagingGate.ts.
host=$(printf '%s' "$SUPABASE_URL" | sed -E 's#^[Hh][Tt][Tt][Pp][Ss]?://([^/?#]+).*#\1#; s/^.*@//; s/:[0-9]+$//' | tr '[:upper:]' '[:lower:]')
[ "$host" = "$PROD_SUPABASE_HOST" ] || die "NEXT_PUBLIC_SUPABASE_URL i $ENV_FILE peker på «$host», ikke prod-verten $PROD_SUPABASE_HOST. Er dette staging-fila?"

# Aldri en .env.production* i appen: den ville lekket inn i eierens Release-dev-bygg.
shopt -s nullglob
for f in "$APP_DIR"/.env.production*; do
  die "Fant $f — prod-verdier skal aldri ligge i en .env-fil i native/app/ (de lekker inn i dev-bygget). Slett fila og kjør igjen."
done
shopt -u nullglob

export APP_VARIANT=store
export EXPO_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export EXPO_PUBLIC_WEB_BASE_URL="$STORE_WEB_BASE_URL"
printf 'APP_VARIANT=%s\nEXPO_PUBLIC_SUPABASE_URL → vert %s\nEXPO_PUBLIC_SUPABASE_ANON_KEY → satt (%d tegn, skrives ikke ut)\nEXPO_PUBLIC_WEB_BASE_URL=%s\n' \
  "$APP_VARIANT" "$host" "${#ANON_KEY}" "$EXPO_PUBLIC_WEB_BASE_URL"

# ── 2. Oppløst config (kjører fail-closed-sjekkene i app.config.ts) ─────────
step "Løser opp app.config.ts for butikk-varianten"
CONFIG_JSON=$(cd "$APP_DIR" && npx expo config --type prebuild --json)
# Ett felt per linje, så et navn med mellomrom aldri skyver de andre feltene.
CONFIG_FIELDS=$(printf '%s' "$CONFIG_JSON" | node -e '
  let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => {
    const c = JSON.parse(s);
    for (const v of [c.name, c.version, c.ios?.buildNumber, c.ios?.bundleIdentifier]) console.log(v ?? "");
  });')
APP_NAME=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '1p')
VERSION=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '2p')
BUILD=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '3p')
BUNDLE_ID=$(printf '%s\n' "$CONFIG_FIELDS" | sed -n '4p')
printf 'navn «%s» · versjon %s · build %s · bundle-id %s\n' "$APP_NAME" "$VERSION" "$BUILD" "$BUNDLE_ID"
[ "$BUNDLE_ID" = "$STORE_BUNDLE_ID" ] || die "Oppløst bundle-id er «$BUNDLE_ID», ikke $STORE_BUNDLE_ID — er APP_VARIANT=store i miljøet?"
[ -n "$VERSION" ] || die "version mangler i oppløst config."
[ -n "$BUILD" ] || die "ios.buildNumber mangler i oppløst config."

mkdir -p "$DIST"
STEM="$DIST/TornyNative-$VERSION-$BUILD"
ARCHIVE="$STEM.xcarchive"
if [ -e "$ARCHIVE" ]; then
  die "Arkivet $ARCHIVE finnes alt. Skal det lastes opp: $0 --upload-only $ARCHIVE. Feilet beviset sist: rm -rf $ARCHIVE og kjør igjen. Skal en ny versjon kompileres: bump STORE_IOS_BUILD_NUMBER i native/app/app.config.ts først (App Store Connect avviser samme buildnummer to ganger)."
fi

# ── 3. Prebuild + pods ───────────────────────────────────────────────────────
# Prebuild regenererer ios/ (standard i SDK 57; --no-clean er unntaket). Aldri
# gjenbruk dev-ios/: app-navnet endrer scheme-navnet (TrnyDev → Trny).
step "expo prebuild (ios, regenererer ios/)"
(cd "$APP_DIR" && CI=1 npx expo prebuild --platform ios --no-install)
step "pod install"
(cd "$APP_DIR/ios" && LANG=en_US.UTF-8 pod install)

WORKSPACE=$( (ls -d "$APP_DIR"/ios/*.xcworkspace 2>/dev/null || true) | head -1)
[ -n "$WORKSPACE" ] || die "Fant ingen .xcworkspace under $APP_DIR/ios"
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
printf 'workspace %s · scheme %s\n' "$WORKSPACE" "$SCHEME"

# ── 4. Arkiv ─────────────────────────────────────────────────────────────────
step "xcodebuild archive → $ARCHIVE (logg: $STEM.archive.log)"
if ! xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
    -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM_ID" > "$STEM.archive.log" 2>&1; then
  tail -60 "$STEM.archive.log" >&2
  die "xcodebuild archive feilet — se $STEM.archive.log (kjente feller: Xcode-versjon, LANG, native moduler etter prebuild)."
fi
printf 'ARCHIVE SUCCEEDED\n'

# ── 5. Bevis (stopper før opplasting) ────────────────────────────────────────
run_proof "$ARCHIVE" "$STEM.bevis.txt"

# ── 6. Opplasting ────────────────────────────────────────────────────────────
if [ "$UPLOAD" = "0" ]; then
  step "--no-upload: hopper over eksport/opplasting"
  printf 'Last opp dette arkivet senere med: %s --upload-only %s\n' "$0" "$ARCHIVE"
else
  run_export "$ARCHIVE" "$STEM"
fi

step "Ferdig"
cat <<EOF
Arkiv:   $ARCHIVE
Bevis:   $STEM.bevis.txt   ← lim inn i issue-/PR-kommentaren
Neste:
  • Neste kompilering: bump STORE_IOS_BUILD_NUMBER i native/app/app.config.ts først.
  • ios/ er nå butikk-varianten. Før neste dev-bygg: (cd native/app && npx expo prebuild --platform ios --no-install)
EOF
