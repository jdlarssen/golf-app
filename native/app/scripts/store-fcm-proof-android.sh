#!/usr/bin/env bash
# native/app/scripts/store-fcm-proof-android.sh
# #2758: et ekte FCM-varsel på selve butikkbygget, vist på emulatoren. Motstykket
# til `store-build-proof-android.sh`, som leser AAB-en: dette kjører den.
#
# Bruk:
#   store-fcm-proof-android.sh --aab <fil.aab> [--key upload|throwaway]
#   store-fcm-proof-android.sh --apk <fil.apk> --package no.tornygolf.dev
#
# `--key upload` (standard) signerer APK-ene med opplastingsnøkkelen, som
# `store-build-android.sh`. `--key throwaway` lager en engangsnøkkel Firebase
# aldri har sett, og etterligner dermed Plays omsignering. `--apk` er dev-bygget med
# debug-nøkkelen. De tre svarene er signeringsmålingen i `play-store-release.md`.
#
# Reglene:
#
#  1. **Bare en emulator.** Bygget peker på prod, så skriptet nekter alt annet, før
#     det gjør noe annet: nøyaktig én enhet, serienummer `emulator-*` og
#     `ro.kernel.qemu` eller `ro.boot.qemu` lik 1. Dette er det eneste unntaket fra
#     «installer aldri butikk-AAB-en» (`play-store-release.md`).
#  2. **Ingen innlogging, ingen skriving til prod.** Appen åpnes og blir stående på
#     innloggingen. Henter den ikke token der, stopper skriptet med exit 3
#     (stoppregelen i kontrakten): da skal ingen logge inn, og målingen tas med
#     dev-pakken mot staging. Den som kjører, teller `fcm_tokens` i prod før og etter.
#  3. **Tokenet skrives aldri ut**, verken i logg eller bevisfil. Det ligger i en
#     variabel og går til senderen i miljøet.
#  4. **Den ekte senderen.** `lib/notifications/push/fcm.ts` og `clampText.ts` oversettes
#     med repoets egen TypeScript, og `server-only` er en tom modul i arbeidsmappa
#     (pakken er ikke installert i repoet).
#
# Miljø (valgfritt): ADB, ANDROID_HOME, TORNY_DIST_DIR (standard
# ~/.torny-native/dist), TORNY_ANDROID_KEYSTORE, TORNY_ANDROID_KEY_ALIAS,
# TORNY_ANDROID_KEYSTORE_PASSWORD (ellers fra nøkkelringen, bare ved `--key upload`).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)
ANDROID_HOME=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}
ADB=${ADB:-"$ANDROID_HOME/platform-tools/adb"}
DIST=${TORNY_DIST_DIR:-"$HOME/.torny-native/dist"}
PYTHON3=${PYTHON3:-/usr/bin/python3}
ANDROID_PROOF_PY="$SCRIPT_DIR/android-proof.py"
SERVICE_ACCOUNT="$HOME/.torny-native/firebase-service-account.json"
BUNDLETOOL_VERSION=1.18.3
BUNDLETOOL_SHA256=a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29
BUNDLETOOL="$HOME/.torny-native/bundletool-all-$BUNDLETOOL_VERSION.jar"
KEYSTORE=${TORNY_ANDROID_KEYSTORE:-"$HOME/.torny-native/android-upload.keystore"}
KEY_ALIAS=${TORNY_ANDROID_KEY_ALIAS:-torny-upload}
KEYCHAIN_SERVICE='torny-android-upload-keystore'
KEYCHAIN_ACCOUNT='torny'
STORE_PACKAGE='no.tornygolf.app'

# Samme låste locale som de andre bevisene (#1983).
export LC_ALL=C

die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }

AAB=''
APK=''
PACKAGE=''
KEY_KIND=upload
while [ $# -gt 0 ]; do
  case "$1" in
    --aab) AAB=${2:-}; shift 2 ;;
    --apk) APK=${2:-}; shift 2 ;;
    --package) PACKAGE=${2:-}; shift 2 ;;
    --key) KEY_KIND=${2:-}; shift 2 ;;
    *) die "Ukjent argument: $1" ;;
  esac
done
case "$KEY_KIND" in
  upload|throwaway) ;;
  *) die "--key må være upload eller throwaway." ;;
esac
if [ -n "$AAB" ] && [ -z "$APK" ]; then
  [ -f "$AAB" ] || die "Fant ikke AAB-en $AAB."
  PACKAGE=$STORE_PACKAGE
  LABEL="butikk-$KEY_KIND"
elif [ -n "$APK" ] && [ -z "$AAB" ] && [ -n "$PACKAGE" ]; then
  [ -f "$APK" ] || die "Fant ikke APK-en $APK."
  LABEL=dev
else
  die "Bruk --aab <fil> [--key upload|throwaway], eller --apk <fil> --package <pakke>."
fi

# ── Regel 1: bare en emulator. Først av alt. ────────────────────────────────
[ -x "$ADB" ] || command -v "$ADB" >/dev/null 2>&1 || die "Fant ikke adb ($ADB)."
DEVICES=$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
[ -n "$DEVICES" ] || die "Ingen enhet er koblet til. Start emulatoren først."
[ "$(printf '%s\n' "$DEVICES" | wc -l | tr -d ' ')" = "1" ] || die "Flere enheter er koblet til. Skriptet kjører bare med én emulator."
SERIAL=$DEVICES
case "$SERIAL" in
  emulator-*) ;;
  *) die "${SERIAL} er ikke en emulator. Bygget peker på prod, så skriptet nekter." ;;
esac
QEMU=$("$ADB" -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r')
BOOT_QEMU=$("$ADB" -s "$SERIAL" shell getprop ro.boot.qemu | tr -d '\r')
[ "$QEMU" = "1" ] || [ "$BOOT_QEMU" = "1" ] || die "${SERIAL} svarer ikke som en emulator (qemu-verdien mangler). Skriptet nekter."
adb_s() { "$ADB" -s "$SERIAL" "$@"; }

[ -f "$SERVICE_ACCOUNT" ] || die "Fant ikke tjenestekontoen $SERVICE_ACCOUNT."
[ -d "$REPO_ROOT/node_modules/typescript" ] || die "Fant ikke TypeScript. Kjør npm install i repo-rota."

STAMP=$(date '+%Y%m%d-%H%M%S')
PROOF_DIR="$DIST/fcm-proof-$LABEL-$STAMP"
mkdir -p "$PROOF_DIR"
OUT="$PROOF_DIR/bevis.txt"
PASS=0
FAIL=0
say()  { printf '%s\n' "$*" | tee -a "$OUT"; }
pass() { PASS=$((PASS + 1)); say "PASS  $*"; }
fail() { FAIL=$((FAIL + 1)); say "FAIL  $*"; }

WORK=$(mktemp -d -t torny-fcm-bevis)
PROOF_FINISHED=0
# Bash 3.2 kan gi EXIT-trapen $?=0 etter en død under `set -u`: bare siste linje
# setter PROOF_FINISHED, så en avbrutt kjøring aldri ser ut som et bevis (#1983).
on_exit() {
  rm -rf "$WORK"
  [ "$PROOF_FINISHED" = "1" ] || { printf 'Beviset ble ikke fullført.\n' >&2; exit 3; }
}
trap on_exit EXIT

say "# FCM-bevis ($LABEL), $(date '+%Y-%m-%d %H:%M %Z')"
say "enhet: $SERIAL · pakke: $PACKAGE · tell fcm_tokens i prod før og etter, skriptet leser ikke prod"
say ""

# ── Installer ───────────────────────────────────────────────────────────────
# Avinstallering nullstiller tokenet, så alle de tre målingene starter likt.
adb_s uninstall "$PACKAGE" >/dev/null 2>&1 || true

if [ -n "$AAB" ]; then
  if [ ! -f "$BUNDLETOOL" ]; then
    curl -fsSL -o "$BUNDLETOOL" "https://github.com/google/bundletool/releases/download/$BUNDLETOOL_VERSION/bundletool-all-$BUNDLETOOL_VERSION.jar" \
      || die "Fikk ikke hentet bundletool $BUNDLETOOL_VERSION."
  fi
  actual=$(/usr/bin/shasum -a 256 "$BUNDLETOOL" | cut -d' ' -f1)
  [ "$actual" = "$BUNDLETOOL_SHA256" ] || die "bundletool har feil sjekksum."
  JAVA="$(/usr/libexec/java_home)/bin/java"
  KEYTOOL="$(/usr/libexec/java_home)/bin/keytool"
  PASSWORD_FILE="$WORK/pass.txt"
  (umask 077; : > "$PASSWORD_FILE")
  if [ "$KEY_KIND" = "throwaway" ]; then
    SIGN_KEYSTORE="$WORK/engang.keystore"
    SIGN_ALIAS=engang
    /usr/bin/openssl rand -hex 24 > "$PASSWORD_FILE"
    "$KEYTOOL" -genkeypair -keystore "$SIGN_KEYSTORE" -storetype PKCS12 -alias "$SIGN_ALIAS" -keyalg RSA -keysize 2048 \
      -validity 2 -dname 'CN=Torny FCM-bevis' -storepass:file "$PASSWORD_FILE" >/dev/null 2>&1
  else
    SIGN_KEYSTORE=$KEYSTORE
    SIGN_ALIAS=$KEY_ALIAS
    [ -f "$SIGN_KEYSTORE" ] || die "Fant ikke opplastingsnøkkelen $SIGN_KEYSTORE."
    if [ -n "${TORNY_ANDROID_KEYSTORE_PASSWORD:-}" ]; then
      printf '%s' "$TORNY_ANDROID_KEYSTORE_PASSWORD" > "$PASSWORD_FILE"
    else
      security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w > "$PASSWORD_FILE" 2>/dev/null \
        || die "Fant ikke passordet i nøkkelringen."
    fi
  fi
  fingerprint=$("$KEYTOOL" -list -v -keystore "$SIGN_KEYSTORE" -alias "$SIGN_ALIAS" -storepass:file "$PASSWORD_FILE" 2>/dev/null \
    | /usr/bin/grep -m1 'SHA1:' | sed 's/.*SHA1: *//' || true)
  say "signering: $KEY_KIND · SHA-1 $fingerprint"
  "$JAVA" -jar "$BUNDLETOOL" build-apks --bundle="$AAB" --output="$WORK/app.apks" --overwrite \
    --connected-device --device-id="$SERIAL" --adb="$ADB" \
    --ks="$SIGN_KEYSTORE" --ks-pass="file:$PASSWORD_FILE" --ks-key-alias="$SIGN_ALIAS" --key-pass="file:$PASSWORD_FILE" \
    > "$WORK/build-apks.log" 2>&1 || { cat "$WORK/build-apks.log" >&2; die "bundletool build-apks feilet."; }
  "$JAVA" -jar "$BUNDLETOOL" install-apks --apks="$WORK/app.apks" --device-id="$SERIAL" --adb="$ADB" \
    > "$WORK/install-apks.log" 2>&1 || { cat "$WORK/install-apks.log" >&2; die "bundletool install-apks feilet."; }
else
  say "signering: debug-nøkkelen (dev-bygget)"
  adb_s install -r "$APK" >/dev/null || die "adb install feilet."
fi
pass "bygget er installert på emulatoren"

# ── Tokenet ─────────────────────────────────────────────────────────────────
adb_s root >/dev/null 2>&1 || true
adb_s wait-for-device
adb_s shell am start -n "$PACKAGE/.MainActivity" >/dev/null 2>&1 || die "Fikk ikke startet appen."
TOKEN=''
for _ in $(seq 1 45); do
  sleep 2
  prefs=$(adb_s shell cat "/data/data/$PACKAGE/shared_prefs/com.google.android.gms.appid.xml" 2>/dev/null || true)
  if TOKEN=$(printf '%s' "$prefs" | "$PYTHON3" "$ANDROID_PROOF_PY" fcm-token 2>/dev/null); then
    [ -n "$TOKEN" ] && break
  fi
done
if [ -z "$TOKEN" ]; then
  fail "appen hentet ikke token på innloggingen. Stoppregelen gjelder: ikke logg inn, mål med dev-pakken mot staging."
  say "## Sum: $PASS PASS, $FAIL FAIL"
  PROOF_FINISHED=1
  exit 3
fi
pass "appen hentet token uten innlogging (verdien vises ikke)"
adb_s shell pm grant "$PACKAGE" android.permission.POST_NOTIFICATIONS

# ── Senderen ────────────────────────────────────────────────────────────────
mkdir -p "$WORK/node_modules/server-only"
: > "$WORK/node_modules/server-only/index.js"
(cd "$REPO_ROOT" && node -e '
  const ts = require("typescript");
  const fs = require("fs");
  const path = require("path");
  for (const name of ["fcm", "clampText"]) {
    const source = fs.readFileSync(path.join("lib/notifications/push", name + ".ts"), "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(process.argv[1], name + ".js"), outputText);
  }
' "$WORK") || die "Fikk ikke oversatt fcm.ts."
cat > "$WORK/send.js" <<'NODE'
const { buildFcmMessage, sendFcmNotification } = require('./fcm.js');
const title = process.env.FCM_PROOF_TITLE;
sendFcmNotification(process.env.FCM_PROOF_TOKEN, buildFcmMessage(title, 'Bevis fra store-fcm-proof-android.sh', '/', 'proof')).then((result) => {
  console.log(`status=${result.status} errorCode=${result.errorCode}`);
  process.exit(result.status >= 200 && result.status < 300 ? 0 : 1);
});
NODE
FCM_B64=$(base64 -i "$SERVICE_ACCOUNT" | tr -d '\n')

send_proof() {
  FCM_SERVICE_ACCOUNT="$FCM_B64" FCM_PROOF_TOKEN="$TOKEN" FCM_PROOF_TITLE="$1" node "$WORK/send.js"
}

# Står varselet med denne tittelen i varsellinja for pakken? Leser fra fil: under
# `pipefail` regnes `printf | grep -q` som feil når grep lukker røret tidlig.
in_tray() {
  local i
  for i in $(seq 1 15); do
    adb_s shell dumpsys notification --noredact > "$WORK/tray-now.txt" 2>/dev/null || true
    if /usr/bin/grep -q "pkg=$PACKAGE" "$WORK/tray-now.txt" \
      && /usr/bin/grep -qF "android.title=String ($1)" "$WORK/tray-now.txt"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

kill_app() {
  adb_s shell input keyevent KEYCODE_HOME
  local i pid
  for i in 1 2 3 4 5 6 7 8; do
    sleep 3
    adb_s shell am kill "$PACKAGE" >/dev/null 2>&1 || true
    sleep 1
    pid=$(adb_s shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)
    [ -z "$pid" ] && return 0
  done
  return 1
}

# ── I bakgrunnen ────────────────────────────────────────────────────────────
TITLE="FCM-bevis bakgrunn $LABEL"
adb_s shell input keyevent KEYCODE_HOME
sleep 3
if answer=$(send_proof "$TITLE"); then
  say "sendt (bakgrunn): $answer"
  if in_tray "$TITLE"; then pass "varselet vises i varsellinja med appen i bakgrunnen"; else fail "varselet kom ikke i varsellinja med appen i bakgrunnen"; fi
else
  fail "FCM avviste sendingen (bakgrunn): $answer"
fi

# ── Lukket, og trykket ──────────────────────────────────────────────────────
TITLE="FCM-bevis lukket $LABEL"
if kill_app; then pass "appen er lukket før sendingen"; else fail "fikk ikke lukket appen"; fi
if answer=$(send_proof "$TITLE"); then
  say "sendt (lukket): $answer"
  if in_tray "$TITLE"; then pass "varselet vises i varsellinja med appen lukket"; else fail "varselet kom ikke i varsellinja med appen lukket"; fi
else
  fail "FCM avviste sendingen (lukket): $answer"
fi
adb_s shell dumpsys notification --noredact > "$WORK/tray.txt" 2>/dev/null || true
if /usr/bin/grep -q "pkg=$PACKAGE" "$WORK/tray.txt" && /usr/bin/grep -q "NotificationChannel{mId='varsler'" "$WORK/tray.txt"; then
  pass "kanalen varsler finnes uten innlogging"
else
  fail "kanalen varsler mangler"
fi

adb_s shell cmd statusbar expand-notifications
sleep 3
adb_s exec-out screencap -p > "$PROOF_DIR/varsellinja.png"
adb_s shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
ui=$(adb_s exec-out cat /sdcard/ui.xml 2>/dev/null || true)
bounds=$(printf '%s' "$ui" | "$PYTHON3" -c '
import re, sys
title = sys.argv[1]
for node in re.findall(r"<node [^>]*>", sys.stdin.read()):
    if f"text=\"{title}\"" in node:
        m = re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", node)
        if m:
            a, b, c, d = map(int, m.groups())
            print((a + c) // 2, (b + d) // 2)
            break
' "$TITLE")
if [ -n "$bounds" ]; then
  # shellcheck disable=SC2086 # to tall, x og y
  adb_s shell input tap $bounds
  sleep 15
  adb_s exec-out screencap -p > "$PROOF_DIR/etter-trykk.png"
  adb_s shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb_s exec-out cat /sdcard/ui.xml > "$WORK/ui-after.xml" 2>/dev/null || true
  if /usr/bin/grep -q 'login-screen' "$WORK/ui-after.xml"; then
    pass "trykket åpner appen på innloggingen"
  else
    fail "trykket åpnet ikke innloggingen"
  fi
else
  fail "fant ikke varselet å trykke på i varsellinja"
fi

say ""
say "## Sum: $PASS PASS, $FAIL FAIL"
say "bevis-mappe: $PROOF_DIR"
PROOF_FINISHED=1
[ "$FAIL" = "0" ]
