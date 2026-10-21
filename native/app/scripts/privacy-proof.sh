# native/app/scripts/privacy-proof.sh
# Personvern-reglene for iOS-butikkbygget (#2561). Egen fil så reglene kan
# kjøres på plist-filer uten arkiv (`privacy-proof.test.js`). Sources av
# `store-build-proof.sh`; kjøres ikke alene.
#
# Kalleren skal definere `say`, `pass` og `fail` (se `store-build-proof.sh`) og
# kalle `privacy_rules <Info.plist> <PrivacyInfo.xcprivacy> <yes|no>`. Siste
# argument sier om binærene importerer disk-API-er (`statfs`/`fstatfs`,
# `NSFileSystem*`, `NSURLVolume*Capacity`); det leser kalleren fra binærene.
#
# Reglene:
#  - `NSPhotoLibraryAddUsageDescription` MÅ stå i Info.plist, med tekst.
#    Delearket (`shareImage.ts`) viser «Lagre bilde», og uten teksten stopper
#    iOS appen når bildet skrives til Bilder.
#  - Importerer binærene disk-API-er, MÅ app-manifestet (`PrivacyInfo.xcprivacy`
#    i .app-roten) oppgi `NSPrivacyAccessedAPICategoryDiskSpace` med minst én
#    grunnkode. Apple leser alle manifestene i appen, men ingen av bibliotekenes
#    manifester oppga DiskSpace i 1.2.0 (5). Importerer de ikke API-ene, er
#    DiskSpace ikke påkrevd.
#
# Plist-ene leses med python3 og `plistlib` (leser både XML og binær), ikke
# plutil: testen kjører i CI på ubuntu-latest, der plutil ikke finnes. En fil
# som ikke kan leses, gir én FAIL per regel og ingen PASS.

PRIVACY_PYTHON3=${PYTHON3:-/usr/bin/python3}

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
  local info=$1 manifest=$2 imports=$3 photo disk why

  if ! photo=$("$PRIVACY_PYTHON3" -c "$PRIVACY_PY" "$info" photo 2>&1); then
    why=$(printf '%s' "$photo" | tail -1)
    fail "kunne ikke lese Info.plist (${info}): ${why}"
  elif [ "$photo" = ok ]; then
    pass "NSPhotoLibraryAddUsageDescription står i Info.plist"
  else
    fail "NSPhotoLibraryAddUsageDescription mangler i Info.plist. «Lagre bilde» i delearket stopper appen uten den (#2561)"
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
    ok*) pass "PrivacyInfo oppgir NSPrivacyAccessedAPICategoryDiskSpace (${disk#ok })" ;;
    empty)
      fail "PrivacyInfo har DiskSpace uten grunnkode"
      ;;
    missing)
      if [ "$imports" = yes ]; then
        fail "PrivacyInfo mangler NSPrivacyAccessedAPICategoryDiskSpace, men binærene importerer statfs/fstatfs/NSFileSystem*. Apple avviser opplastingen (#2561)"
      else
        pass "binærene importerer ingen disk-API-er, så DiskSpace er ikke påkrevd"
      fi
      ;;
    *) fail "kunne ikke lese DiskSpace i PrivacyInfo (${manifest}): ${disk}" ;;
  esac
}
