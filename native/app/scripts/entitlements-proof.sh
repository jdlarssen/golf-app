# native/app/scripts/entitlements-proof.sh
# Entitlements-reglene for iOS-butikkbygget (#2561). Egen fil så reglene kan
# kjøres på en plist uten arkiv (`entitlements-proof.test.js`). Sources av
# `store-build-proof.sh`; kjøres ikke alene.
#
# Kalleren skal definere `say`, `pass` og `fail` (se `store-build-proof.sh`) og
# kalle `entitlements_rules <plist-fil>` med XML-en fra `codesign --xml`.
#
# Reglene:
#  - `aps-environment` MÅ finnes, med verdien `development` eller `production`,
#    fordi appen har varsler på iOS (`expo-notifications`, #2256 PR 4). Verdien
#    skrives i bevis-fila. Arkivet kreves IKKE å ha `production`: pluginen
#    skriver `development` når `mode` ikke er satt (`app.json` setter den
#    ikke), beviset kjører på `.xcarchive` før eksporten, og et arkiv med
#    automatisk signering er utviklingssignert. Hva eksporten til App Store
#    setter, viser ikke arkivet. Det bevises av et varsel til en
#    TestFlight-installasjon.
#  - `com.apple.developer.associated-domains` MÅ finnes, og være nøyaktig
#    `applinks:tornygolf.no` (#2627). Venne-lenka og QR-koden på bag-taggen
#    åpner appen. Hvilke stier som slipper gjennom, bestemmer AASA-fila på
#    nettet (`app/.well-known/apple-app-site-association/route.ts`, bare
#    `/venner/legg-til/*`): alle andre lenker åpnes fortsatt i Safari, der
#    sesjonen finnes. Et annet domene, et jokertegn eller flere verdier er
#    FAIL, og det er en manglende verdi også: da åpner ikke lenka appen.
#
# Plist-en leses med python3 og `plistlib`, ikke plutil eller PlistBuddy: testen
# kjører i CI på ubuntu-latest, der de ikke finnes. En tom fil er en app uten
# entitlements (`codesign` skriver da ingenting), og den gir FAIL på
# `aps-environment`. En fil som ikke kan leses, gir én FAIL og ingen PASS.

# `bundle-proof.sh` setter `PYTHON3` når den er sourcet først; testen sourcer
# bare denne fila.
ENTITLEMENTS_PYTHON3=${PYTHON3:-/usr/bin/python3}

# Den ene verdien associated domains skal ha (#2627): `applinks:` og
# `STORE_LINK_DOMAIN` i `app.config.ts`. En konstant, som Android-regelens: et
# miljø kan ikke endre hva beviset krever. `entitlements-proof.test.js` holder
# den lik app.config.
ENTITLEMENTS_APPLINKS=applinks:tornygolf.no

# Skriver `aps <missing|ok|other> <verdi>` og `ad <absent|list|other> <verdier>`,
# eller exit 1 med grunnen på stderr. `list` er en liste av strenger (skrevet
# med mellomrom mellom), `other` alt annet. Ingen enkle anførselstegn i koden
# (den står i '…').
ENTITLEMENTS_PY='
import plistlib, sys
try:
    with open(sys.argv[1], "rb") as f:
        raw = f.read()
    ent = plistlib.loads(raw) if raw.strip() else {}
except Exception as e:
    sys.stderr.write(type(e).__name__ + "\n")
    sys.exit(1)
if not isinstance(ent, dict):
    sys.stderr.write("roten er ikke en dict\n")
    sys.exit(1)
aps = ent.get("aps-environment")
if aps is None:
    print("aps missing -")
elif aps in ("development", "production"):
    print("aps ok " + aps)
else:
    print("aps other " + ascii(aps))
ad = ent.get("com.apple.developer.associated-domains")
if ad is None:
    print("ad absent -")
elif isinstance(ad, list) and all(isinstance(d, str) for d in ad):
    print("ad list " + " ".join(ad))
else:
    print("ad other " + ascii(ad))
'

entitlements_rules() {
  local file=$1 facts why aps state value ad ad_state ad_value
  if ! facts=$("$ENTITLEMENTS_PYTHON3" -c "$ENTITLEMENTS_PY" "$file" 2>&1); then
    why=$(printf '%s' "$facts" | tail -1)
    fail "kunne ikke lese entitlements (${file}): ${why}"
    return 0
  fi
  aps=$(printf '%s\n' "$facts" | sed -n 's/^aps //p')
  state=${aps%% *}
  value=${aps#* }
  ad=$(printf '%s\n' "$facts" | sed -n 's/^ad //p')

  case "$state" in
    ok)
      pass "aps-environment = ${value}"
      say "      (arkivet viser ikke hva eksporten til App Store setter; production i det opplastede bygget bevises av et varsel til TestFlight)"
      ;;
    missing) fail "aps-environment mangler. Appen har varsler på iOS (#2561), så arkivet må ha push-entitlementen" ;;
    other) fail "aps-environment = ${value}. Bare development eller production er gyldig" ;;
    *) fail "kunne ikke lese aps-environment (${file}): ${facts}" ;;
  esac

  ad_state=${ad%% *}
  ad_value=${ad#* }
  case "$ad_state" in
    list)
      if [ "$ad_value" = "$ENTITLEMENTS_APPLINKS" ]; then
        pass "com.apple.developer.associated-domains = ${ad_value} (AASA-fila slipper bare venne-lenka gjennom)"
      else
        fail "com.apple.developer.associated-domains = ${ad_value:-<tom liste>}. Bare ${ENTITLEMENTS_APPLINKS} er lov (#2627)"
      fi
      ;;
    absent) fail "com.apple.developer.associated-domains mangler. Butikkappen skal ha ${ENTITLEMENTS_APPLINKS}, ellers åpner ikke venne-lenka appen (#2627)" ;;
    other) fail "com.apple.developer.associated-domains = ${ad_value}. Bare ${ENTITLEMENTS_APPLINKS} er lov (#2627)" ;;
    *) fail "kunne ikke lese com.apple.developer.associated-domains (${file}): ${facts}" ;;
  esac
}
