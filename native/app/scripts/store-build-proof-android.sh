#!/usr/bin/env bash
# native/app/scripts/store-build-proof-android.sh
# #2560: bevis-steget for Android-butikkbygget, motstykket til
# `store-build-proof.sh` (iOS). Leser en ferdig AAB og BEVISER hva som ble bakt
# inn, i stedet for å anta at «vi satte variabelen».
#
# Fem kilder, hver med egne regler:
#  1. `base/assets/index.android.bundle` (Hermes-bytekode): ALLE bundel-reglene
#     fra iOS-beviset, lest fra `bundle-proof.sh` (ett hjem for reglene). Prod-
#     adressen og web-adressen kreves; staging, Mac-en, LAN og loopback er
#     forbudt; anon-nøkkelen fra miljøet må finnes; ingen verdi fra appens
#     `.env`-filer. Begrunnelsen for hver regel står øverst i
#     `store-build-proof.sh`.
#  2. Manifestet (`base/manifest/AndroidManifest.xml`, protobuf). `aapt2` fra
#     Android SDK-ens build-tools leser det når skriptet har pakket manifestet og
#     `resources.pb` om til en proto-APK. Ingen bundletool. KREV pakke
#     `no.tornygolf.app`, en versionCode og targetSdk ≥ 36. FORBY
#     `android:debuggable="true"` og et `autoVerify`-intent-filter for
#     tornygolf.no (motstykket til iOS-regelen om associated domains: appen
#     claimer ikke lenker). En vert som er en ressursreferanse (`@string/…`)
#     kan ikke leses her, og regnes som tornygolf.no. Fail-closed: en
#     debuggable-verdi leseren ikke kjenner, er FAIL.
#  3. Tillatelsene: hele `uses-permission`-lista skrives ut som informasjon.
#     Regelen: ingen tillatelse fra `expo.android.blockedPermissions` i
#     `native/app/app.json` står i manifestet. Lista har ett hjem, app.json, og
#     kopieres aldri inn her. Fail-closed: en app.json uten lista, eller et
#     manifest som ikke ble lest, er FAIL, aldri «ingen blokkert tillatelse».
#  4. 16 KB-sider: hver `.so` under `base/lib/arm64-v8a/` og `base/lib/x86_64/`
#     har LOAD-justering ≥ 16384. En av de to mappene uten `.so` er FAIL, ikke
#     en stille PASS. 32-bit-filene (`armeabi-v7a`, `x86`) skrives ut som
#     informasjon: 16 KB-kravet gjelder bare 64-bit (O8).
#  5. Signaturen: AAB-en er signert, og sertifikatets SHA-256 er opplastings-
#     nøkkelens avtrykk. Avtrykket leses fra `app/.well-known/assetlinks.json/
#     route.ts` (linja etter `// Upload key`), ikke kopiert inn her. Ikke
#     nøyaktig ett avtrykk der er FAIL. Debug-nøkkelen eller en annen nøkkel er
#     FAIL.
#
# Exit 0 = alle regler PASS. Exit 1 = minst én FAIL (byggeskriptet stopper).
# Exit 2 = feil bruk / mangler verktøy. Exit 3 = skriptet stoppet før slutten,
# så bevis-fila er ufullstendig og ingenting er bevist. Bevis-fila skrives
# uansett, så en FAIL kan limes inn og diskuteres.
#
# Bruk: store-build-proof-android.sh <sti.aab> [bevis-fil]
# Miljø (valgfritt): ANDROID_HOME (standard ~/Library/Android/sdk),
# TORNY_APP_ENV_DIR (se bundle-proof.sh).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)

# Bundel-reglene og verktøyene deres (`GREP`, `STRINGS`, `PYTHON3`, Hermes-
# leseren, dotenv-leseren) står i `bundle-proof.sh`, som iOS-beviset også leser.
BUNDLE_PROOF_LIB="$SCRIPT_DIR/bundle-proof.sh"
[ -f "$BUNDLE_PROOF_LIB" ] || { printf '✗ Mangler %s (bundel-reglene)\n' "$BUNDLE_PROOF_LIB" >&2; exit 2; }
# shellcheck source=bundle-proof.sh
. "$BUNDLE_PROOF_LIB"
UNZIP=/usr/bin/unzip
ZIP=/usr/bin/zip
SHASUM=/usr/bin/shasum
KEYTOOL=/usr/bin/keytool
JARSIGNER=/usr/bin/jarsigner
ANDROID_PROOF_PY="$SCRIPT_DIR/android-proof.py"
ANDROID_HOME=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}

# Samme låste locale som iOS-beviset (#1983): reglene sammenligner byte.
export LC_ALL=C

STORE_PACKAGE='no.tornygolf.app'
MIN_TARGET_SDK=36
PAGE_16K=16384
ASSETLINKS_ROUTE="$REPO_ROOT/app/.well-known/assetlinks.json/route.ts"
APP_JSON="$REPO_ROOT/native/app/app.json"

usage() {
  printf 'Bruk: %s <sti.aab> [bevis-fil]\n' "$(basename "$0")" >&2
  exit 2
}

[ $# -ge 1 ] || usage
AAB=$1
case "$AAB" in
  *.aab) ;;
  *) usage ;;
esac
[ -f "$AAB" ] || { printf '✗ Fant ikke %s\n' "$AAB" >&2; exit 2; }
bundle_proof_require
for tool in "$UNZIP" "$ZIP" "$SHASUM" "$KEYTOOL" "$JARSIGNER"; do
  [ -x "$tool" ] || { printf '✗ Mangler verktøy: %s\n' "$tool" >&2; exit 2; }
done
[ -f "$ANDROID_PROOF_PY" ] || { printf '✗ Mangler %s (leser manifestet og .so-filene)\n' "$ANDROID_PROOF_PY" >&2; exit 2; }
# Nyeste build-tools med aapt2. Versjonsnumrene sorteres felt for felt.
BUILD_TOOLS=$( (ls -1 "$ANDROID_HOME/build-tools" 2>/dev/null || true) | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)
AAPT2="$ANDROID_HOME/build-tools/$BUILD_TOOLS/aapt2"
[ -n "$BUILD_TOOLS" ] && [ -x "$AAPT2" ] || { printf '✗ Fant ingen aapt2 under %s/build-tools (sett ANDROID_HOME)\n' "$ANDROID_HOME" >&2; exit 2; }

# `.android.bevis.txt`: iOS-arkivet med samme versjon og build har alt
# `TornyNative-<versjon>-<build>.bevis.txt` i samme mappe.
OUT=${2:-"${AAB%.aab}.android.bevis.txt"}

PASS=0
FAIL=0
# Temp-filene ryddes av ÉN trap (se iOS-beviset).
STR=''
U16=''
WORK=''
# Fail closed if the script stops early (#1983): only the last lines set
# PROOF_FINISHED, so a `set -u` death halfway through exits 3, never 0.
PROOF_FINISHED=0
trap 'rm -f "$STR" "$U16" 2>/dev/null || true
[ -n "$WORK" ] && rm -rf "$WORK" 2>/dev/null || true
if [ "$PROOF_FINISHED" != 1 ]; then
  printf "FAIL  beviset stoppet før slutten — bevis-fila er ufullstendig, ingenting er bevist\n" | tee -a "$OUT" >&2
  exit 3
fi' EXIT
: > "$OUT"

say()  { printf '%s\n' "$*" | tee -a "$OUT"; }
pass() { PASS=$((PASS + 1)); say "PASS  $*"; }
fail() { FAIL=$((FAIL + 1)); say "FAIL  $*"; }

say "# Bevis for Android-butikkbygget, $(date '+%Y-%m-%d %H:%M %Z')"
say "aab: $AAB"
say "størrelse: $(wc -c < "$AAB" | tr -d ' ') byte · sha256: $("$SHASUM" -a 256 "$AAB" | cut -c1-16)…"
say "aapt2: build-tools $BUILD_TOOLS"
say ""

WORK=$(mktemp -d -t torny-bevis-aab)
"$UNZIP" -q "$AAB" -d "$WORK/aab"
BASE="$WORK/aab/base"

# ── 1. Bundelen ──────────────────────────────────────────────────────────────
say "## base/assets/index.android.bundle"
BUNDLE="$BASE/assets/index.android.bundle"
if [ ! -f "$BUNDLE" ]; then
  fail "base/assets/index.android.bundle mangler i AAB-en. Er dette et React Native-release-bygg?"
else
  bundle_proof "$BUNDLE"
fi
say ""

# ── 2. Manifestet ────────────────────────────────────────────────────────────
say "## Manifest (base/manifest/AndroidManifest.xml)"
FACTS="$WORK/manifest.facts"
: > "$FACTS"
if [ ! -f "$BASE/manifest/AndroidManifest.xml" ] || [ ! -f "$BASE/resources.pb" ]; then
  fail "manifestet eller resources.pb mangler i base/. Er dette en AAB fra bundleRelease?"
else
  # Proto-APK: manifestet på rota + ressurstabellen. Mer trenger ikke aapt2.
  mkdir -p "$WORK/proto"
  cp "$BASE/manifest/AndroidManifest.xml" "$BASE/resources.pb" "$WORK/proto/"
  (cd "$WORK/proto" && "$ZIP" -q "$WORK/proto.apk" AndroidManifest.xml resources.pb)
  if ! "$AAPT2" dump xmltree --file AndroidManifest.xml "$WORK/proto.apk" > "$WORK/manifest.xmltree" 2> "$WORK/aapt2.err"; then
    fail "aapt2 kunne ikke lese manifestet: $(head -c 200 "$WORK/aapt2.err" | tr '\n' ' ')"
    # En halv dump skal aldri gi PASS i tillatelsesregelen under.
    : > "$WORK/manifest.xmltree"
  elif ! "$PYTHON3" "$ANDROID_PROOF_PY" manifest < "$WORK/manifest.xmltree" > "$FACTS"; then
    fail "fant ikke <manifest> i aapt2-utdataene"
    : > "$FACTS"
  fi
fi
fact() { ("$GREP" -m1 "^$1=" "$FACTS" || true) | cut -d= -f2-; }
facts() { ("$GREP" "^$1=" "$FACTS" || true) | cut -d= -f2-; }
package=$(fact package)
version_code=$(fact versionCode)
version_name=$(fact versionName)
min_sdk=$(fact minSdk)
target_sdk=$(fact targetSdk)
debuggable=$(fact debuggable)
say "package     = ${package:-<mangler>}"
say "versionCode = ${version_code:-<mangler>} · versionName = ${version_name:-<mangler>}"
say "minSdk      = ${min_sdk:-<mangler>} · targetSdk = ${target_sdk:-<mangler>}"
say "debuggable  = ${debuggable:-<mangler>}"
if [ "$package" = "$STORE_PACKAGE" ]; then pass "pakke er $STORE_PACKAGE"; else fail "pakke er «${package}», ikke $STORE_PACKAGE"; fi
case "$version_code" in
  ''|*[!0-9]*) fail "versionCode mangler eller er ikke et tall («${version_code}»)" ;;
  *) pass "versionCode satt ($version_code)" ;;
esac
case "$target_sdk" in
  ''|*[!0-9]*) fail "targetSdkVersion mangler eller er ikke et tall («${target_sdk}»)" ;;
  *)
    if [ "$target_sdk" -ge "$MIN_TARGET_SDK" ]; then
      pass "targetSdkVersion $target_sdk ≥ $MIN_TARGET_SDK"
    else
      fail "targetSdkVersion $target_sdk er under $MIN_TARGET_SDK, og Play Console avviser bygget"
    fi
    ;;
esac
# Fail-closed: bare en tydelig usann eller manglende verdi er PASS. En verdi
# leseren ikke kjenner (eller et manifest som ikke ble lest) er FAIL.
case "$debuggable" in
  false|ikke-satt) pass "ikke debuggable (android:debuggable = $debuggable)" ;;
  true) fail "android:debuggable=\"true\": et debug-bygg skal aldri til Play" ;;
  *) fail "android:debuggable kunne ikke leses («${debuggable:-<mangler>}»), og regnes som debuggable" ;;
esac
claimed=0
while read -r host; do
  [ -n "$host" ] || continue
  # Vertsnavn skiller ikke store og små bokstaver.
  host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
  case "$host" in
    tornygolf.no|*.tornygolf.no)
      claimed=$((claimed + 1)); say "      autoVerify-vert: $host" ;;
    @*)
      claimed=$((claimed + 1)); say "      autoVerify-vert: $host (ressursreferanse som ikke kan leses her, regnes som tornygolf.no)" ;;
    *)
      say "      autoVerify-vert: $host (ikke tornygolf.no)" ;;
  esac
done < <(facts autoverify-host)
if [ "$claimed" = "0" ]; then
  pass "ingen autoVerify-intent-filter for tornygolf.no, appen claimer ikke lenker"
else
  fail "$claimed autoVerify-vert(er) for tornygolf.no. Appen skal ikke claime lenker (motstykket til iOS-regelen om associated domains)"
fi
say ""

# ── 3. Tillatelsene ──────────────────────────────────────────────────────────
say "## Tillatelser (uses-permission)"
permissions=$(facts permission)
if [ -z "$permissions" ]; then
  say "      (ingen uses-permission i manifestet)"
else
  printf '%s\n' "$permissions" | sed 's/^/      /' | tee -a "$OUT"
fi
# Ble manifestet aldri dumpet, får leseren tom stdin og svarer exit 1.
[ -f "$WORK/manifest.xmltree" ] || : > "$WORK/manifest.xmltree"
if blocked_out=$("$PYTHON3" "$ANDROID_PROOF_PY" blocked "$APP_JSON" < "$WORK/manifest.xmltree" 2> "$WORK/blocked.err"); then
  blocked_count=$( (printf '%s\n' "$blocked_out" | "$GREP" -m1 '^blocked-count=' || true) | cut -d= -f2-)
  blocked_present=$( (printf '%s\n' "$blocked_out" | "$GREP" '^blocked-present=' || true) | cut -d= -f2- | tr '\n' ' ' | sed 's/ $//')
  if [ -z "$blocked_present" ]; then
    pass "ingen blokkert tillatelse i manifestet ($blocked_count blokkert i app.json)"
  else
    fail "blokkert i app.json, men står i manifestet: $blocked_present"
  fi
else
  fail "kunne ikke sjekke de blokkerte tillatelsene: $(head -c 300 "$WORK/blocked.err" | tr '\n' ' ')"
fi
say ""

# ── 4. 16 KB-sider ───────────────────────────────────────────────────────────
say "## 16 KB-sider (base/lib/*/*.so, LOAD-justering)"
for abi in arm64-v8a x86_64; do
  total=0
  bad=0
  bad_list=''
  for so in "$BASE/lib/$abi"/*.so; do
    [ -f "$so" ] || continue
    total=$((total + 1))
    align=$("$PYTHON3" "$ANDROID_PROOF_PY" elf-align "$so" 2>/dev/null || echo 0)
    if [ "$align" -lt "$PAGE_16K" ]; then
      bad=$((bad + 1))
      bad_list="${bad_list}      ${abi}/$(basename "$so"): ${align}
"
    fi
  done
  if [ "$total" = "0" ]; then
    fail "${abi}: ingen .so under base/lib/${abi}/. En AAB uten 64-bit-biblioteker for ${abi} er ikke bevist, bare tom"
  elif [ "$bad" = "0" ]; then
    pass "${abi}: alle $total .so har LOAD-justering ≥ $PAGE_16K"
  else
    fail "${abi}: $bad av $total .so har LOAD-justering under $PAGE_16K:"
    printf '%s' "$bad_list" | tee -a "$OUT"
  fi
done
for abi in armeabi-v7a x86; do
  found=0
  for so in "$BASE/lib/$abi"/*.so; do
    [ -f "$so" ] || continue
    found=1
    align=$("$PYTHON3" "$ANDROID_PROOF_PY" elf-align "$so" 2>/dev/null || echo '?')
    say "      info ${abi}/$(basename "$so"): $align"
  done
  [ "$found" = "1" ] || say "      info ${abi}: ingen .so"
done
say ""

# ── 5. Signaturen ────────────────────────────────────────────────────────────
say "## Signatur (opplastingsnøkkelen)"
expected=''
if [ ! -f "$ASSETLINKS_ROUTE" ]; then
  fail "fant ikke $ASSETLINKS_ROUTE, der opplastingsnøkkelens avtrykk står"
else
  fingerprints=$( ("$GREP" -A1 -F '// Upload key' "$ASSETLINKS_ROUTE" || true) | ("$GREP" -oE '([0-9A-F]{2}:){31}[0-9A-F]{2}' || true))
  count=$(printf '%s' "$fingerprints" | "$GREP" -c . || true)
  if [ "${count:-0}" = "1" ]; then
    expected=$fingerprints
    say "opplastingsnøkkelen (route.ts) = $expected"
  else
    fail "fant ${count:-0} avtrykk etter «// Upload key» i route.ts, ventet nøyaktig 1"
  fi
fi
"$JARSIGNER" -verify "$AAB" > "$WORK/jarsigner.txt" 2>&1 || true
if "$GREP" -q '^jar verified\.' "$WORK/jarsigner.txt"; then
  pass "AAB-en er signert, og jarsigner godtar signaturen"
else
  fail "AAB-en er ikke signert, eller signaturen holder ikke: $(head -1 "$WORK/jarsigner.txt")"
fi
"$KEYTOOL" -printcert -jarfile "$AAB" > "$WORK/printcert.txt" 2>&1 || true
signers=$( ("$GREP" -c '^Signer #' "$WORK/printcert.txt") || true)
owner=$( ("$GREP" -m1 '^Owner:' "$WORK/printcert.txt" || true) | sed 's/^Owner: //')
actual=$( ("$GREP" -m1 -E '^[[:space:]]*SHA256:' "$WORK/printcert.txt" || true) | sed -E 's/^[[:space:]]*SHA256:[[:space:]]*//')
say "signerere: ${signers:-0} · eier: ${owner:-<ingen>}"
say "sertifikatets SHA-256        = ${actual:-<ingen>}"
if [ -z "$expected" ]; then
  fail "signaturen kan ikke sammenlignes uten opplastingsnøkkelens avtrykk (se over)"
elif [ "${signers:-0}" != "1" ]; then
  fail "AAB-en har ${signers:-0} signerere, ventet nøyaktig 1 (opplastingsnøkkelen)"
elif [ "$actual" = "$expected" ]; then
  pass "signert med opplastingsnøkkelen (SHA-256 er lik route.ts)"
else
  case "$owner" in
    *"Android Debug"*) fail "signert med Android-debug-nøkkelen, ikke opplastingsnøkkelen" ;;
    *) fail "signert med en annen nøkkel enn opplastingsnøkkelen (SHA-256 er ulik route.ts)" ;;
  esac
fi
say ""

say "## Sum: $PASS PASS, $FAIL FAIL"
say "bevis-fil: $OUT"
PROOF_FINISHED=1
[ "$FAIL" = "0" ]
