#!/usr/bin/env bash
# native/app/scripts/store-build-dsyms.sh
# Symbolfiler for butikkarkivet (#1974): legger dSYM-ene for de ferdigbygde
# React Native-rammeverkene inn i <arkiv>/dSYMs/, så krasj inne i Hermes og
# React kan oversettes til lesbare linjer i Xcode Organizer og App Store Connect.
#
# Hvorfor: `hermesvm`, `React` og `ReactNativeDependencies` kommer ferdigbygget
# fra Maven (Expo-Podfilen setter RCT_USE_PREBUILT_RNCORE og RCT_USE_RN_DEP),
# og tarballene har ikke med dSYM. Uten dem melder `xcodebuild -exportArchive`
# «Upload Symbols Failed» for alle tre. Maven publiserer dSYM-ene som egne
# artefakter ved siden av rammeverkene; dette skriptet henter dem. Fiksen bor
# her og ikke i `ios/`, fordi `expo prebuild` regenererer `ios/` ved hvert bygg.
#
# Regler:
#  - UUID-en avgjør, ikke stien. Blant alle `<navn>.framework.dSYM` i tarballen
#    velges den der `dwarfdump --uuid` er lik binæren i arkivet. Passer ingen,
#    er `node_modules` ikke det arkivet ble bygget fra, og da legges ingenting inn.
#  - Idempotent: finnes en dSYM med samme UUID i arkivet alt, gjøres ingenting.
#  - Tarballen kommer inn i mellomlagringen først når SHA-1 stemmer med Mavens
#    `.sha1`, så et avbrutt nedlastingsforsøk blir aldri liggende som en ødelagt fil.
#  - Blokkerer aldri: exit 0 også når en symbolfil mangler (issuet: «blokkerer
#    ingenting»). Exit 2 = feil bruk (argument, arkivet finnes ikke). Exit 3 =
#    skriptet stoppet før slutten.
#
# store-build-ios.sh kaller skriptet mellom arkivering og bevis. Det kan også
# kjøres for hånd mot et arkiv, f.eks. et eldre et.
#
# Bruk:   native/app/scripts/store-build-dsyms.sh <sti.xcarchive>
# Utdata: meldinger på stderr; til slutt én linje på stdout:
#         «Symbolfiler: <n>/<alle> (mangler: …)» — binærene i appen med dSYM.
# Miljø (valgfritt): TORNY_DSYM_CACHE (standard ~/.torny-native/cache/dsyms).
#   Første kjøring henter ~570 MB dit; mappa kan slettes når som helst.
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RN_DIR="$APP_DIR/node_modules/react-native"
CACHE=${TORNY_DSYM_CACHE:-"$HOME/.torny-native/cache/dsyms"}
MAVEN='https://repo1.maven.org/maven2/com/facebook'

# Absolutte stier: `grep` kan være ugrep på maskinen (samme grunn som i beviset).
GREP=/usr/bin/grep
DWARFDUMP=/usr/bin/dwarfdump
PLUTIL=/usr/bin/plutil
CURL=/usr/bin/curl
SHASUM=/usr/bin/shasum
TAR=/usr/bin/tar
DITTO=/usr/bin/ditto

say() { printf '%s\n' "$*" >&2; }
die() { printf '✗ %s\n' "$*" >&2; exit 2; }

# Hjelpeteksten er header-kommentaren over (samme grep som store-build-ios.sh).
print_help() { awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; }

case "${1:-}" in -h|--help) print_help; exit 0 ;; esac
[ $# -eq 1 ] || die "Bruk: $0 <sti.xcarchive>"
ARCHIVE=${1%/}
case "$ARCHIVE" in
  *.xcarchive) ;;
  *) die "Vil ha et .xcarchive, fikk «${ARCHIVE}»." ;;
esac
[ -d "$ARCHIVE" ] || die "Fant ikke arkivet ${ARCHIVE}"
APP=$( (ls -d "$ARCHIVE"/Products/Applications/*.app 2>/dev/null || true) | head -1)
[ -n "$APP" ] || die "Fant ingen .app under ${ARCHIVE}/Products/Applications — er dette et xcodebuild-arkiv?"
DSYM_DIR="$ARCHIVE/dSYMs"
mkdir -p "$DSYM_DIR" 2>/dev/null || die "Kan ikke skrive til ${DSYM_DIR}"

# bash 3.2 gir en EXIT-trap $?=0 når `set -u` dreper skriptet (#1983). Uten
# vakten ville et halvkjørt symbolsteg sett ut som et ferdig et.
FINISHED=0
WORK=''
# shellcheck disable=SC2154  # rc settes i selve trap-strengen
trap 'rc=$?; [ -z "$WORK" ] || rm -rf "$WORK"; if [ "$FINISHED" != 1 ] && [ "$rc" = 0 ]; then exit 3; fi' EXIT

# UUID-ene i en binær eller dSYM, én per linje (én per arkitektur). Tom utdata
# når dwarfdump ikke kan lese fila; det teller som «mangler», ikke som krasj.
uuids() { "$DWARFDUMP" --uuid "$1" 2>/dev/null | awk '$1 == "UUID:" { print $2 }' || true; }

# Alle UUID-er i <arkiv>/dSYMs, én per linje.
archive_dsym_uuids() {
  local d
  for d in "$DSYM_DIR"/*.dSYM; do
    [ -d "$d" ] && uuids "$d"
  done
  return 0
}

# covered <binærens UUID-er> <UUID-liste>: finnes hver av binærens UUID-er i lista?
covered() {
  local u
  [ -n "$1" ] || return 1
  # UUID-er har verken mellomrom eller glob-tegn, så ordsplittingen er trygg.
  # shellcheck disable=SC2086
  for u in $1; do
    printf '%s\n' "$2" | "$GREP" -qx "$u" || return 1
  done
}

# Binærens navn fra Info.plist (CFBundleExecutable), ellers mappenavnet.
executable() {
  local bundle=$1 name
  name=$("$PLUTIL" -extract CFBundleExecutable raw -o - "$bundle/Info.plist" 2>/dev/null || true)
  [ -n "$name" ] || name=$(basename "$bundle" | sed 's/\.[^.]*$//')
  printf '%s' "$name"
}

# fetch <url> <mål>: laster ned til <mål>.part og flytter på plass når SHA-1
# stemmer. Ved feil står grunnen i FETCH_ERROR.
FETCH_ERROR=''
fetch() {
  local url=$1 dest=$2 want got
  if ! want=$("$CURL" -fsSL --connect-timeout 30 --max-time 60 "$url.sha1"); then
    FETCH_ERROR="fikk ikke hentet ${url}.sha1"
    return 1
  fi
  # .sha1-fila har bare hashen, uten filnavn, så `shasum -c` virker ikke på den.
  want=$(printf '%s' "$want" | tr -d '[:space:]' | tr 'A-F' 'a-f')
  if ! printf '%s' "$want" | "$GREP" -Eqx '[0-9a-f]{40}'; then
    FETCH_ERROR="${url}.sha1 inneholdt ingen SHA-1"
    return 1
  fi
  say "  henter ${url}"
  # Stopper en nedlasting som står stille (under 10 kB/s i ett minutt), så et
  # hengende Maven aldri holder igjen bygget; da blir det en advarsel.
  if ! "$CURL" -fL --progress-bar --connect-timeout 30 --speed-limit 10240 --speed-time 60 \
      -o "$dest.part" "$url"; then
    rm -f "$dest.part"
    FETCH_ERROR="nedlastingen feilet eller sto stille"
    return 1
  fi
  got=$("$SHASUM" -a 1 "$dest.part" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    rm -f "$dest.part"
    FETCH_ERROR="SHA-1 stemmer ikke (fikk ${got}, Maven sier ${want})"
    return 1
  fi
  mv "$dest.part" "$dest"
}

ADDED=0

# add_one <rammeverk> <Maven-URL>
add_one() {
  local name=$1 url=$2 bin want shown tarball unpack candidate match=''
  bin="$APP/Frameworks/$name.framework/$name"
  [ -f "$bin" ] || return 0   # rammeverket er ikke i appen: ingenting å symbolisere
  want=$(uuids "$bin")
  if [ -z "$want" ]; then
    say "⚠ ${name}: fant ingen UUID i ${bin}"
    return 0
  fi
  shown=$(printf '%s\n' "$want" | paste -sd' ' -)
  if covered "$want" "$(archive_dsym_uuids)"; then
    say "✓ ${name}: symbolfil med UUID ${shown} finnes alt"
    return 0
  fi

  if ! mkdir -p "$CACHE" 2>/dev/null; then
    say "⚠ ${name}: ingen symbolfil lagt til (forventet UUID ${shown}): kan ikke lage mellomlagringen ${CACHE}."
    return 0
  fi
  tarball="$CACHE/$(basename "$url")"
  if [ -f "$tarball" ]; then
    say "  ${name}: bruker ${tarball} fra mellomlagringen"
  elif ! fetch "$url" "$tarball"; then
    say "⚠ ${name}: ingen symbolfil lagt til (forventet UUID ${shown}): ${FETCH_ERROR}."
    return 0
  fi

  [ -n "$WORK" ] || WORK=$(mktemp -d 2>/dev/null) || true
  unpack="$WORK/$name"
  if [ -z "$WORK" ] || ! mkdir -p "$unpack" 2>/dev/null; then
    say "⚠ ${name}: fikk ikke laget en midlertidig mappe å pakke ut i."
    return 0
  fi
  if ! "$TAR" -xzf "$tarball" -C "$unpack"; then
    say "⚠ ${name}: klarte ikke pakke ut ${tarball}. Slett fila og kjør igjen."
    return 0
  fi
  while IFS= read -r candidate; do
    if covered "$want" "$(uuids "$candidate")"; then
      match=$candidate
      break
    fi
  done < <(find "$unpack" -type d -name "$name.framework.dSYM" -prune)
  if [ -z "$match" ]; then
    say "⚠ ${name}: fant ingen dSYM med UUID ${shown} i $(basename "$tarball"). Er node_modules det arkivet ble bygget fra?"
    return 0
  fi

  # ditto fletter inn i en mappe som finnes, så en gammel dSYM med feil UUID må bort først.
  rm -rf "$DSYM_DIR/$name.framework.dSYM"
  if ! "$DITTO" "$match" "$DSYM_DIR/$name.framework.dSYM"; then
    rm -rf "$DSYM_DIR/$name.framework.dSYM"
    say "⚠ ${name}: klarte ikke kopiere symbolfila inn i ${DSYM_DIR} (se ditto-meldingen over)."
    return 0
  fi
  ADDED=$((ADDED + 1))
  say "+ ${name}: la til symbolfil med UUID ${shown} (fra ${match#"$unpack"/})"
}

say "Symbolfiler for ${ARCHIVE}"
RN_VERSION=''
HERMES_VERSION=''
[ -f "$RN_DIR/package.json" ] \
  && RN_VERSION=$("$PLUTIL" -extract version raw -o - "$RN_DIR/package.json" 2>/dev/null || true)
[ -f "$RN_DIR/sdks/hermes-engine/version.properties" ] \
  && HERMES_VERSION=$(sed -n 's/^HERMES_V1_VERSION_NAME=//p' "$RN_DIR/sdks/hermes-engine/version.properties" | tr -d '[:space:]')

if [ -z "$RN_VERSION" ] || [ -z "$HERMES_VERSION" ]; then
  [ -n "$RN_VERSION" ] || say "⚠ Fant ikke React Native-versjonen i ${RN_DIR}/package.json (kjør npm install i native/app)."
  [ -n "$HERMES_VERSION" ] || say "⚠ Fant ikke HERMES_V1_VERSION_NAME i ${RN_DIR}/sdks/hermes-engine/version.properties."
  say "⚠ Henter ingen symbolfiler; tellingen under viser hva arkivet har."
else
  say "React Native ${RN_VERSION} · Hermes ${HERMES_VERSION} · mellomlagring ${CACHE}"
  RN_ARTIFACTS="$MAVEN/react/react-native-artifacts/$RN_VERSION/react-native-artifacts-$RN_VERSION"
  add_one hermesvm "$MAVEN/hermes/hermes-ios/$HERMES_VERSION/hermes-ios-$HERMES_VERSION-hermes-framework-dSYM-release.tar.gz"
  add_one React "$RN_ARTIFACTS-reactnative-core-dSYM-release.tar.gz"
  add_one ReactNativeDependencies "$RN_ARTIFACTS-reactnative-dependencies-dSYM-release.tar.gz"
  say "Lagt til: ${ADDED}"
fi

# Tellingen: appen selv og hvert rammeverk i den — har binæren en dSYM med samme UUID?
HAVE_UUIDS=$(archive_dsym_uuids)
TOTAL=0
HAVE=0
MISSING=''
for bundle in "$APP" "$APP"/Frameworks/*.framework; do
  [ -d "$bundle" ] || continue
  TOTAL=$((TOTAL + 1))
  if covered "$(uuids "$bundle/$(executable "$bundle")")" "$HAVE_UUIDS"; then
    HAVE=$((HAVE + 1))
  else
    MISSING="${MISSING:+$MISSING, }$(basename "$bundle")"
  fi
done

FINISHED=1
printf 'Symbolfiler: %s/%s%s\n' "$HAVE" "$TOTAL" "${MISSING:+ (mangler: $MISSING)}"
