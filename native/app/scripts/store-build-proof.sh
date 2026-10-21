#!/usr/bin/env bash
# native/app/scripts/store-build-proof.sh
# Native N8 (#1954, P2): bevis-steget for butikkbygget — FØR opplasting.
#
# Leser et ferdig arkiv (eller en .app) og BEVISER hva som faktisk ble bakt inn,
# i stedet for å anta at «vi satte variabelen». Alle tre `EXPO_PUBLIC_*`-verdiene
# blir strenger i bundelen ved bundling; denne fila leser dem tilbake derfra.
#
# Tre kilder, hver med egne regler:
#  1. `main.jsbundle` (Hermes-bytekode, aldri `grep` rett på fila). Hermes har
#     TO strengtabeller (#1983): ren ASCII, og UTF-16LE for alle strenger med
#     minst ett tegn utenfor ASCII (`ø`, `·`, emoji). `strings` på macOS leser
#     bare 1-byte-tegn og har ingen `-e`, så UTF-16-tabellen leses av
#     `hermes-strings.py` ved siden av denne fila. Begge dumpene havner i samme
#     fil, én streng per linje, og alle reglene under leser begge tabellene.
#     KREV prod-adressen og `https://tornygolf.no`. FORBY staging-adressen,
#     Mac-ens adresse og alt som lukter LAN/dev. To Hermes-egenskaper former
#     reglene:
#       - Strengtabellen pakkes uten skilletegn, og strenger som overlapper
#         deler lagring («Height» + «http://» → «Heighttp://»). Derfor
#         grensetegn på IP-mønstrene. Loopback-literalene i supabase-js
#         («127.0.0.1», «[::1]», «localhost») er lov bare, så mange ganger som
#         pakken som er installert forklarer: i 1.1.0 (3) sto «127.0.0.1» inne
#         i «draft-2020-127.0.0.15.2.0.0», i 1.2.0 (4) alene (#2561). Som
#         adresse (skjema, bruker@, URL-koding, port, og for «localhost» også
#         underdomene) er de forbudt.
#       - En delstreng deler lagring med den lengre strengen den er en del av.
#         `src/lib/stagingGate.ts` har staging-verten som literal (gaten for
#         utvikler-raden), så ETT bart treff på staging-ref-en er forventet i
#         alle bygg. Et bygg mot staging baker derimot inn `https://<staging>`
#         fra miljøet — og DET er treffet vi forbyr: staging-ref-en rett etter
#         `://`.
#     `http://` og `localhost` finnes i bibliotekene våre (zod, Metro-asset-URL,
#     auth-js, phoenix); de kjente strengene står på en eksplisitt liste i
#     `bundle-proof.sh` (#2560),
#     alt annet feiler med kontekst, så en ny hit må vurderes med øynene før den
#     eventuelt legges til. Står `EXPO_PUBLIC_SUPABASE_ANON_KEY` i miljøet, må
#     nøyaktig den verdien finnes i bundelen (bare lengden skrives ut).
#     Ingen `EXPO_PUBLIC_*`-verdi fra appens egne `.env`-filer
#     (`native/app/.env*`) skal finnes i bundelen (#2208). Butikkbygget leser
#     dem ikke, og regelen beviser det. Verdier beviset krever (prod-adressen,
#     web-adressen, anon-nøkkelen fra miljøet) og verdier under 12 tegn hoppes
#     over. Bare fil, nøkkel, lengde og antall treff skrives ut, aldri verdien.
#     `TORNY_APP_ENV_DIR` peker regelen på en annen mappe (test og manuelle
#     kjøringer); standard er appmappa skriptet ligger i.
#  2. `Info.plist`: bundle-id, versjon, build, ITSAppUsesNonExemptEncryption.
#  3. Entitlements (`codesign`): `aps-environment` må være `development` eller
#     `production` (appen har varsler på iOS, #2561), og verdien skrives ut.
#     Arkivet kreves ikke å ha `production`. INGEN associated domains. Reglene
#     og hvorfor står i `entitlements-proof.sh`.
#  4. Personvern (#2561): `NSPhotoLibraryAddUsageDescription` i Info.plist, og
#     `NSPrivacyAccessedAPICategoryDiskSpace` i app-manifestet når binærene
#     importerer `statfs`/`fstatfs`/`NSFileSystem*`. Reglene står i
#     `privacy-proof.sh`.
#  5. App-ikonet (#1975). To regler, fordi `Assets.car` er KOMPILERT: kildens
#     byte finnes ikke igjen i arkivet, så den eksakte regelen må stå på kilden
#     i repoet (sha256 mot merkevare-masteren, og et eksplisitt avslag på
#     Expo-malens hash). Arkiv-regelen beviser bare at et ikon i det hele tatt
#     ble kompilert inn. Merk at `--upload-only` på et eldre arkiv leser DAGENS
#     kilde — i den vanlige kjeden (prebuild → archive → bevis) henger de sammen.
#
# Exit 0 = alle regler PASS. Exit 1 = minst én FAIL (byggeskriptet stopper før
# opplasting). Exit 2 = feil bruk / mangler verktøy. Exit 3 = skriptet stoppet
# før slutten, så bevis-fila er ufullstendig og ingenting er bevist. Bevis-fila
# skrives uansett, så en FAIL kan limes inn og diskuteres.
#
# Bruk: store-build-proof.sh <sti.xcarchive | sti.app> [bevis-fil]
set -euo pipefail

# Absolutte stier: `grep` kan være ugrep på maskinen, og `strings` finnes i flere
# varianter. Beviset skal være det samme uansett hva som ligger først i PATH.
# Bundel-reglene og verktøyene deres (`GREP`, `STRINGS`, `PYTHON3`, Hermes-
# leseren, dotenv-leseren) står i `bundle-proof.sh`, som Android-beviset også
# leser (#2560).
BUNDLE_PROOF_LIB="$(dirname "${BASH_SOURCE[0]}")/bundle-proof.sh"
[ -f "$BUNDLE_PROOF_LIB" ] || { printf '✗ Mangler %s (bundel-reglene)\n' "$BUNDLE_PROOF_LIB" >&2; exit 2; }
# shellcheck source=bundle-proof.sh
. "$BUNDLE_PROOF_LIB"
# Entitlements-reglene (#2561) står i egen fil, så de kan testes uten arkiv.
ENTITLEMENTS_PROOF_LIB="$(dirname "${BASH_SOURCE[0]}")/entitlements-proof.sh"
[ -f "$ENTITLEMENTS_PROOF_LIB" ] || { printf '✗ Mangler %s (entitlements-reglene)\n' "$ENTITLEMENTS_PROOF_LIB" >&2; exit 2; }
# shellcheck source=entitlements-proof.sh
. "$ENTITLEMENTS_PROOF_LIB"
# Personvern-reglene (#2561): tillatelsestekst og DiskSpace.
PRIVACY_PROOF_LIB="$(dirname "${BASH_SOURCE[0]}")/privacy-proof.sh"
[ -f "$PRIVACY_PROOF_LIB" ] || { printf '✗ Mangler %s (personvern-reglene)\n' "$PRIVACY_PROOF_LIB" >&2; exit 2; }
# shellcheck source=privacy-proof.sh
. "$PRIVACY_PROOF_LIB"
PLUTIL=/usr/bin/plutil
CODESIGN=/usr/bin/codesign
SHASUM=/usr/bin/shasum
ASSETUTIL=/usr/bin/assetutil
NM=/usr/bin/nm

# The locale is pinned the same way (#1983). macOS /bin/bash 3.2 in any UTF-8
# locale reads the first byte of `»` as part of a variable name, so an
# unbraced `$pattern` right before `»` died on `set -u` halfway through the
# bundle rules (the messages also brace their variables, `${name}`). Every rule
# here compares bytes (`grep -b` offsets, `head -c`), so C is also the honest
# locale for the checks themselves.
export LC_ALL=C

STORE_BUNDLE_ID='no.tornygolf.app'

# Ikonet (#1975). Kilden ligger i repoet, ikke i arkivet — se punkt 4 øverst.
PROOF_APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ICON_SRC="$PROOF_APP_DIR/assets/icon.png"
ICON_MASTER="$PROOF_APP_DIR/../assets/appstore-1024.png"
# Expo SDK 57-malens ikon (den blå vinkelen). Sto i `native/app/assets/icon.png`
# fra N1 til #1975 og ville fulgt med inn i App Store under samme bundle-id som
# TestFlight-skallet — som HAR riktig ikon. Nevnes ved navn så en FAIL sier hva
# som skjedde, ikke bare at to hasher er ulike.
EXPO_TEMPLATE_ICON_SHA256='119462bb78eb240a65c869fc067ee599639b3cb5a41953f25c07b17d2a8c7e0f'
ICON_RENDITION='"RenditionName" : "App-Icon-1024x1024@1x.png"'

usage() {
  printf 'Bruk: %s <sti.xcarchive | sti.app> [bevis-fil]\n' "$(basename "$0")" >&2
  exit 2
}

[ $# -ge 1 ] || usage
TARGET=$1
bundle_proof_require
for tool in "$PLUTIL" "$CODESIGN" "$SHASUM" "$ASSETUTIL" "$NM"; do
  [ -x "$tool" ] || { printf '✗ Mangler verktøy: %s\n' "$tool" >&2; exit 2; }
done

case "$TARGET" in
  *.xcarchive)
    # `ls` svarer 1 på et tomt glob; under pipefail ville det avsluttet stille.
    APP=$( (ls -d "$TARGET"/Products/Applications/*.app 2>/dev/null || true) | head -1)
    [ -n "$APP" ] || { printf '✗ Fant ingen .app under %s/Products/Applications/\n' "$TARGET" >&2; exit 2; }
    ;;
  *.app) APP=$TARGET ;;
  *) usage ;;
esac

OUT=${2:-"$(dirname "$TARGET")/$(basename "$TARGET" | sed -E 's/\.(xcarchive|app)$//').bevis.txt"}
BUNDLE="$APP/main.jsbundle"
PLIST="$APP/Info.plist"

PASS=0
FAIL=0
# Temp-filene ryddes av ÉN trap: en `trap ... EXIT` satt lenger nede ville
# erstattet den forrige, ikke lagt seg ved siden av.
STR=''
U16=''
CAR=''
ENT=''
DISK=''
# Fail closed if the script stops early (#1983). After a `set -u` death, bash
# 3.2 hands the EXIT trap `$?` = 0 and exits with the trap's status, so a crash
# halfway through the rules exited 0 and the build script would have uploaded.
# Only the last lines of the script set PROOF_FINISHED.
PROOF_FINISHED=0
trap 'rm -f "$STR" "$U16" "$CAR" "$ENT" "$DISK" 2>/dev/null || true
if [ "$PROOF_FINISHED" != 1 ]; then
  printf "FAIL  beviset stoppet før slutten — bevis-fila er ufullstendig, ingenting er bevist\n" | tee -a "$OUT" >&2
  exit 3
fi' EXIT
: > "$OUT"

say()  { printf '%s\n' "$*" | tee -a "$OUT"; }
pass() { PASS=$((PASS + 1)); say "PASS  $*"; }
fail() { FAIL=$((FAIL + 1)); say "FAIL  $*"; }

say "# Bevis for butikkbygget — $(date '+%Y-%m-%d %H:%M %Z')"
say "arkiv/app: $APP"
say ""

# ── 1. Bundelen ──────────────────────────────────────────────────────────────
say "## main.jsbundle"
if [ ! -f "$BUNDLE" ]; then
  fail "main.jsbundle mangler i $APP — er dette et React Native-bygg?"
else
  bundle_proof "$BUNDLE"
fi
say ""

# ── 2. Info.plist ────────────────────────────────────────────────────────────
say "## Info.plist"
if [ ! -f "$PLIST" ]; then
  fail "Info.plist mangler i $APP"
else
  plist_value() { "$PLUTIL" -extract "$1" raw -o - "$PLIST" 2>/dev/null || printf '<mangler>'; }
  bundle_id=$(plist_value CFBundleIdentifier)
  short_version=$(plist_value CFBundleShortVersionString)
  build=$(plist_value CFBundleVersion)
  non_exempt=$(plist_value ITSAppUsesNonExemptEncryption)
  say "CFBundleIdentifier            = $bundle_id"
  say "CFBundleShortVersionString    = $short_version"
  say "CFBundleVersion               = $build"
  say "ITSAppUsesNonExemptEncryption = $non_exempt"
  if [ "$bundle_id" = "$STORE_BUNDLE_ID" ]; then pass "bundle-id er $STORE_BUNDLE_ID"; else fail "bundle-id er «${bundle_id}», ikke $STORE_BUNDLE_ID"; fi
  if [ "$short_version" != '<mangler>' ] && [ -n "$short_version" ]; then pass "versjon satt ($short_version)"; else fail "CFBundleShortVersionString mangler"; fi
  if [ "$build" != '<mangler>' ] && [ -n "$build" ]; then pass "build satt ($build)"; else fail "CFBundleVersion mangler"; fi
  if [ "$non_exempt" = "false" ]; then pass "ITSAppUsesNonExemptEncryption = false"; else fail "ITSAppUsesNonExemptEncryption er «${non_exempt}», skal være false"; fi
fi
say ""

# ── 3. Entitlements ──────────────────────────────────────────────────────────
say "## Entitlements (codesign)"
if ent=$("$CODESIGN" -d --entitlements - --xml "$APP" 2>/dev/null); then
  if [ -z "$ent" ]; then
    say "(ingen entitlements)"
  else
    printf '%s\n' "$ent" | sed 's/^/    /' | tee -a "$OUT"
  fi
  ENT=$(mktemp -t torny-bevis-ent)
  printf '%s\n' "$ent" > "$ENT"
  entitlements_rules "$ENT"
else
  fail "kunne ikke lese entitlements — er appen signert?"
fi
say ""

# ── 4. Personvern ────────────────────────────────────────────────────────────
# Binærene: hovedfila og rammeverkene. `nm -u` lister importerte symboler
# (`_statfs`, `_fstatfs`); `NSFileSystem*`/`NSURLVolume*Capacity` er
# nøkkel-strenger som ligger i binæren, så de leses med `strings`. Utdraget
# skrives til fil før det grepes (SIGPIPE under pipefail, som over).
say "## Personvern (#2561)"
if [ ! -f "$PLIST" ]; then
  fail "Info.plist mangler i $APP"
elif [ ! -f "$APP/PrivacyInfo.xcprivacy" ]; then
  fail "PrivacyInfo.xcprivacy mangler i $APP. Appen har ikke noe app-manifest"
else
  exe=$(plist_value CFBundleExecutable)
  DISK=$(mktemp -t torny-bevis-disk)
  disk_imports=no
  binaries=("$APP/$exe")
  for fw in "$APP"/Frameworks/*.framework; do
    if [ -d "$fw" ]; then binaries+=("$fw/$(basename "$fw" .framework)"); fi
  done
  for bin in "${binaries[@]}"; do
    [ -f "$bin" ] || continue
    ("$NM" -u "$bin" 2>/dev/null || true) > "$DISK"
    ("$STRINGS" -a "$bin" 2>/dev/null || true) >> "$DISK"
    n=$(("$GREP" -cE -- '(^|[ _])(f?statfs|f?statvfs|f?getattrlist|getattrlistat)$|NSFileSystemFreeSize|NSFileSystemSize|NSURLVolume[A-Za-z]*Capacity' "$DISK") || true)
    if [ "${n:-0}" -ge 1 ]; then
      say "disk-API i $(basename "$bin") ($n treff)"
      disk_imports=yes
    fi
  done
  [ -f "$APP/$exe" ] || fail "hovedbinæren $exe mangler i $APP"
  privacy_rules "$PLIST" "$APP/PrivacyInfo.xcprivacy" "$disk_imports"
fi
say ""

# ── 5. App-ikonet ────────────────────────────────────────────────────────────
say "## App-ikon"
if [ ! -f "$ICON_SRC" ]; then
  fail "$ICON_SRC mangler — app.json peker på ./assets/icon.png"
elif [ ! -f "$ICON_MASTER" ]; then
  fail "$ICON_MASTER mangler — merkevare-masteren fra native/assets/generate-icons.mjs"
else
  icon_sha=$("$SHASUM" -a 256 "$ICON_SRC" | cut -d' ' -f1)
  master_sha=$("$SHASUM" -a 256 "$ICON_MASTER" | cut -d' ' -f1)
  say "assets/icon.png sha256   = $icon_sha"
  say "appstore-1024.png sha256 = $master_sha"
  if [ "$icon_sha" = "$EXPO_TEMPLATE_ICON_SHA256" ]; then
    fail "assets/icon.png ER Expo-malens ikon (#1975) — kopier native/assets/appstore-1024.png over den"
  elif [ "$icon_sha" = "$master_sha" ]; then
    pass "assets/icon.png er merkevare-masteren native/assets/appstore-1024.png"
  else
    fail "assets/icon.png er hverken Expo-malen eller masteren — kjør native/assets/generate-icons.mjs, eller kopier native/assets/appstore-1024.png over den"
  fi
fi

# Arkiv-siden. `assetutil`-utdraget skrives til fil før det grepes: `grep -q`
# lukker røret på første treff, og SIGPIPE-en tilbake ville under pipefail gjort
# en GRØNN sjekk rød — samme grunn som `strings`-dumpen over skrives til fil.
if [ ! -f "$APP/Assets.car" ]; then
  fail "Assets.car mangler i $APP — ingen kompilert ikon-katalog"
else
  CAR=$(mktemp -t torny-bevis-car)
  ("$ASSETUTIL" --info "$APP/Assets.car" 2>/dev/null || true) > "$CAR"
  n=$(("$GREP" -cF -- "$ICON_RENDITION" "$CAR") || true)
  if [ "${n:-0}" -ge 1 ]; then
    pass "Assets.car har App-Icon-1024x1024@1x.png ($n rendition(er))"
  else
    fail "Assets.car har ingen App-Icon-1024x1024@1x.png — ikonet ble ikke kompilert inn"
  fi
fi
if [ -f "$APP/AppIcon60x60@2x.png" ]; then
  pass "AppIcon60x60@2x.png ligger i .app-en"
else
  fail "AppIcon60x60@2x.png mangler i .app-en"
fi
say ""

say "## Sum: $PASS PASS, $FAIL FAIL"
say "bevis-fil: $OUT"
PROOF_FINISHED=1
[ "$FAIL" = "0" ]
