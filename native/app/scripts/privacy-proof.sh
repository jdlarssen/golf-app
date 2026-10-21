# native/app/scripts/privacy-proof.sh
# Personvern-reglene for iOS-butikkbygget (#2561). Egen fil så reglene kan
# kjøres på plist-filer og symbollister uten arkiv (`privacy-proof.test.js`).
# Sources av `store-build-proof.sh`; kjøres ikke alene.
#
# Kalleren skal definere `say`, `pass` og `fail` (se `store-build-proof.sh`).
# `privacy_rules <Info.plist> <PrivacyInfo.xcprivacy> <yes|no> <antall>`: tredje
# argument sier om binærene importerer disk-API-er, fjerde hvor mange binærer
# som ble skannet. Kalleren leser symbolene med `nm -u` og teller treffene med
# `disk_api_hits`.
#
# Reglene:
#  - `NSPhotoLibraryAddUsageDescription` MÅ stå i Info.plist, med tekst.
#    Delearket (`shareImage.ts`) kan lagre bildet i Bilder. Uten teksten
#    skjuler iOS lagre-handlingen (Save Image) i arket: observert i
#    simulatoren på iOS 26.5, ingen krasj (#2561).
#  - Importerer binærene disk-API-er (`statfs`/`fstatfs`, `statvfs`,
#    `getattrlist`-familien, `NSFileSystemFreeSize`/`NSFileSystemSize`,
#    `NSURLVolume*Capacity*`), MÅ app-manifestet (`PrivacyInfo.xcprivacy` i
#    .app-roten) oppgi `NSPrivacyAccessedAPICategoryDiskSpace` med minst én
#    grunnkode. Apple leser alle manifestene i appen, men ingen av
#    bibliotekenes manifester oppga DiskSpace i 1.2.0 (5). Apples
#    required-reason-krav gjelder (https://developer.apple.com/documentation/
#    bundleresources/describing-use-of-required-reason-api), og ITMS-91053 kan
#    komme som e-post etter opplasting. Tidligere bygg kom gjennom uten
#    (1.1.0 (3) ble godkjent, 1.2.0 (5) ble lastet opp), så regelen er
#    forebygging, ikke gjentakelse av et avslag. Importerer de ikke API-ene, er
#    DiskSpace ikke påkrevd.
#
# Plist-ene leses med python3 og `plistlib` (leser både XML og binær), ikke
# plutil: testen kjører i CI på ubuntu-latest, der plutil ikke finnes. En fil
# som ikke kan leses, gir én FAIL per regel og ingen PASS.

PRIVACY_PYTHON3=${PYTHON3:-/usr/bin/python3}

# Antall disk-API-symboler i en `nm -u`-dump (fil som argument). Siste felt på
# linja er symbolet; hele navnet må treffe, så `_statfs_foo` og
# `_NSFileSystemNumber` gir 0.
disk_api_hits() {
  /usr/bin/awk '$NF ~ /^_(f?statfs|f?statvfs|f?getattrlist|getattrlistat|NSFileSystemFreeSize|NSFileSystemSize|NSURLVolume[A-Za-z]*Capacity[A-Za-z]*)$/ { n++ } END { print n + 0 }' "$1"
}

# Skriver `<verdi>` på én linje, eller exit 1 med grunnen på stderr.
# argv: fil, modus (`photo` | `disk`). Ingen enkle anførselstegn i koden.
PRIVACY_PY='
import plistlib, sys
try:
    with open(sys.argv[1], "rb") as f:
        data = plistlib.load(f)
except Exception as e:
    sys.stderr.write(type(e).__name__ + "\n")
    sys.exit(1)
if not isinstance(data, dict):
    sys.stderr.write("roten er ikke en dict\n")
    sys.exit(1)
if sys.argv[2] == "photo":
    text = data.get("NSPhotoLibraryAddUsageDescription")
    print("ok" if isinstance(text, str) and text.strip() else "missing")
else:
    reasons = None
    for entry in data.get("NSPrivacyAccessedAPITypes", []):
        if entry.get("NSPrivacyAccessedAPIType") == "NSPrivacyAccessedAPICategoryDiskSpace":
            reasons = entry.get("NSPrivacyAccessedAPITypeReasons", [])
    if reasons is None:
        print("missing")
    elif not reasons:
        print("empty")
    else:
        print("ok " + ",".join(reasons))
'

privacy_rules() {
  local info=$1 manifest=$2 imports=$3 scanned=${4:-0} photo disk why

  if ! photo=$("$PRIVACY_PYTHON3" -c "$PRIVACY_PY" "$info" photo 2>&1); then
    why=$(printf '%s' "$photo" | tail -1)
    fail "kunne ikke lese Info.plist (${info}): ${why}"
  elif [ "$photo" = ok ]; then
    pass "NSPhotoLibraryAddUsageDescription står i Info.plist"
  else
    fail "NSPhotoLibraryAddUsageDescription mangler i Info.plist. Uten den skjuler iOS lagre-handlingen i delearket (#2561)"
  fi

  if [ "$imports" != yes ] && [ "$imports" != no ]; then
    fail "ukjent verdi for disk-API-importer («${imports}»). Forventet yes eller no"
    return 0
  fi
  if ! disk=$("$PRIVACY_PYTHON3" -c "$PRIVACY_PY" "$manifest" disk 2>&1); then
    why=$(printf '%s' "$disk" | tail -1)
    fail "kunne ikke lese PrivacyInfo.xcprivacy (${manifest}): ${why}"
    return 0
  fi
  case "$disk" in
    ok*) pass "PrivacyInfo oppgir NSPrivacyAccessedAPICategoryDiskSpace (${disk#ok }); ${scanned} binærer skannet" ;;
    empty)
      fail "PrivacyInfo har DiskSpace uten grunnkode"
      ;;
    missing)
      if [ "$imports" = yes ]; then
        fail "PrivacyInfo mangler NSPrivacyAccessedAPICategoryDiskSpace, men binærene importerer disk-API-er (statfs/statvfs/getattrlist, NSFileSystem*, NSURLVolume*Capacity). Apples required-reason-krav gjelder, og ITMS-91053 kan komme etter opplasting (#2561)"
      else
        pass "binærene importerer ingen disk-API-er (${scanned} skannet), så DiskSpace er ikke påkrevd"
      fi
      ;;
    *) fail "kunne ikke lese DiskSpace i PrivacyInfo (${manifest}): ${disk}" ;;
  esac
}
