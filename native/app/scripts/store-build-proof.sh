#!/usr/bin/env bash
# native/app/scripts/store-build-proof.sh
# Native N8 (#1954, P2): bevis-steget for butikkbygget — FØR opplasting.
#
# Leser et ferdig arkiv (eller en .app) og BEVISER hva som faktisk ble bakt inn,
# i stedet for å anta at «vi satte variabelen». Alle tre `EXPO_PUBLIC_*`-verdiene
# blir strenger i bundelen ved bundling; denne fila leser dem tilbake derfra.
#
# Tre kilder, hver med egne regler:
#  1. `main.jsbundle` (Hermes-bytekode → `strings`, aldri `grep` rett på fila).
#     KREV prod-adressen og `https://tornygolf.no`. FORBY staging-adressen,
#     Mac-ens adresse og alt som lukter LAN/dev. To Hermes-egenskaper former
#     reglene:
#       - Strengtabellen pakkes uten skilletegn, og strenger som overlapper
#         deler lagring («Height» + «http://» → «Heighttp://»; «draft-2020-12» +
#         «7.0.0.1…» ser ut som 127.0.0.1). Derfor grensetegn på IP-mønstrene.
#       - En delstreng deler lagring med den lengre strengen den er en del av.
#         `src/lib/stagingGate.ts` har staging-verten som literal (gaten for
#         utvikler-raden), så ETT bart treff på staging-ref-en er forventet i
#         alle bygg. Et bygg mot staging baker derimot inn `https://<staging>`
#         fra miljøet — og DET er treffet vi forbyr: staging-ref-en rett etter
#         `://`.
#     `http://` og `localhost` finnes i bibliotekene våre (zod, Metro-asset-URL,
#     auth-js, phoenix); de kjente strengene står på en eksplisitt liste under,
#     alt annet feiler med kontekst, så en ny hit må vurderes med øynene før den
#     eventuelt legges til. Står `EXPO_PUBLIC_SUPABASE_ANON_KEY` i miljøet, må
#     nøyaktig den verdien finnes i bundelen (bare lengden skrives ut).
#  2. `Info.plist`: bundle-id, versjon, build, ITSAppUsesNonExemptEncryption.
#  3. Entitlements (`codesign`): INGEN associated domains, INGEN push.
#
# Exit 0 = alle regler PASS. Exit 1 = minst én FAIL (byggeskriptet stopper før
# opplasting). Exit 2 = feil bruk / mangler verktøy. Bevis-fila skrives uansett,
# så en FAIL kan limes inn og diskuteres.
#
# Bruk: store-build-proof.sh <sti.xcarchive | sti.app> [bevis-fil]
set -euo pipefail

# Absolutte stier: `grep` kan være ugrep på maskinen, og `strings` finnes i flere
# varianter. Beviset skal være det samme uansett hva som ligger først i PATH.
GREP=/usr/bin/grep
STRINGS=/usr/bin/strings
PLUTIL=/usr/bin/plutil
CODESIGN=/usr/bin/codesign

PROD_SUPABASE_HOST='glofubopddkjhymcbaph.supabase.co'
STORE_WEB_BASE_URL='https://tornygolf.no'
STAGING_REF='snwmueecmfqqdurxedxv'
STORE_BUNDLE_ID='no.tornygolf.app'

# Kjente, ufarlige `http://`-strenger fra bibliotekene (seedet fra eksportene
# 2026-09-05, P2 — bekreftes mot det ekte arkivet i P3). Hver rad: regex som må
# matche fra og med `http://`.
ALLOW_HTTP=(
  '^http://json-schema\.org/draft-0[47]/schema#'   # zod (JSON Schema-$schema)
  '^http://localhost:8081/assets/'                   # Metro sin asset-URL (expo-asset/google-fonts), brukes ikke i Release
  '^http://localhost:9999'                           # @supabase/auth-js: standardverdi for GoTrue-URL
  # @supabase/phoenix (longpoll) har en bar «http://»-literal. Den har ingen
  # vert selv, så det som følger i den pakkede tabellen er NABO-strengen.
  # Kjent igjen på at halen ikke er en vert: et ord uten punktum, kolon eller
  # skråstrek (eller ingenting), eller en annen URL-literal rett etter.
  '^http://[A-Za-z0-9_-]{0,64}([^A-Za-z0-9._:/-]|$)'
  '^http://https?://'
)
# Samme for `localhost` uten skjema foran.
ALLOW_LOCALHOST=(
  '^localhost:8081/assets/'
  '^localhost:9999'
)

usage() {
  printf 'Bruk: %s <sti.xcarchive | sti.app> [bevis-fil]\n' "$(basename "$0")" >&2
  exit 2
}

[ $# -ge 1 ] || usage
TARGET=$1
for tool in "$GREP" "$STRINGS" "$PLUTIL" "$CODESIGN"; do
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
  STR=$(mktemp -t torny-bevis)
  trap 'rm -f "$STR"' EXIT
  "$STRINGS" "$BUNDLE" > "$STR"
  say "størrelse: $(wc -c < "$BUNDLE" | tr -d ' ') byte · sha256: $(shasum -a 256 "$BUNDLE" | cut -c1-16)…"

  # `grep` svarer 1 på null treff; det er et tall her, ikke en feil.
  count_fixed() { ("$GREP" -oF -- "$1" "$STR" || true) | wc -l | tr -d ' '; }
  count_regex() { ("$GREP" -oE -- "$1" "$STR" || true) | wc -l | tr -d ' '; }
  offsets_of()  { ("$GREP" -obF -- "$1" "$STR" || true) | cut -d: -f1; }

  # Tekst fra byte-offset: `head` leser fila og `tail` spiser alt head gir, så
  # ingen SIGPIPE (det motsatte, `tail | head`, dør med 141 under pipefail).
  slice() {
    local start=$1 length=$2
    [ "$start" -lt 0 ] && { length=$((length + start)); start=0; }
    head -c "$((start + length))" "$STR" | tail -c "+$((start + 1))" | tr '\n' ' '
  }

  # Kontekst rundt hvert treff, ett per linje — via byte-offset, så to treff tett
  # i tett (3111 og 9999 i samme pakkede streng) ikke sluker hverandre.
  contexts() {
    local token=$1 before=$2 after=$3 off
    while read -r off; do
      [ -n "$off" ] || continue
      printf '      %s\n' "$(slice "$((off - before))" "$((before + ${#token} + after))")"
    done < <(offsets_of "$token")
  }

  # Hvert treff på `token` må matche én av regexene i lista (målt fra tokenet).
  check_allowlisted() {
    local token=$1; shift
    local allow=("$@")
    local hits unknown=0 off tail_text ok re
    hits=$(count_fixed "$token")
    if [ "$hits" = "0" ]; then pass "«$token»: 0 treff"; return; fi
    while read -r off; do
      [ -n "$off" ] || continue
      tail_text=$(slice "$off" 120)
      ok=0
      for re in "${allow[@]}"; do
        if printf '%s' "$tail_text" | "$GREP" -qE -- "$re"; then ok=1; break; fi
      done
      if [ "$ok" = "1" ]; then
        say "      kjent  «${tail_text:0:70}»"
      else
        unknown=$((unknown + 1))
        say "      UKJENT «${tail_text:0:90}»"
      fi
    done < <(offsets_of "$token")
    if [ "$unknown" = "0" ]; then
      pass "«$token»: $hits treff, alle på lista over kjente bibliotek-strenger"
    else
      fail "«$token»: $unknown av $hits treff står IKKE på lista (se UKJENT over)"
    fi
  }

  # Påkrevd — med skjema, slik miljøverdien bakes inn (en bar literal holder ikke).
  n=$(count_fixed "https://$PROD_SUPABASE_HOST")
  if [ "$n" -ge 1 ]; then pass "prod-adressen https://$PROD_SUPABASE_HOST finnes ($n)"; else fail "prod-adressen https://$PROD_SUPABASE_HOST finnes IKKE — bygget peker ikke på prod"; fi
  n=$(count_fixed "$STORE_WEB_BASE_URL")
  if [ "$n" -ge 1 ]; then pass "web-adressen $STORE_WEB_BASE_URL finnes ($n)"; else fail "web-adressen $STORE_WEB_BASE_URL finnes IKKE"; fi

  # Staging: den bare literalen fra stagingGate.ts er forventet (én gang);
  # `://<staging>` er miljøverdien, og den skal ikke finnes.
  n=$(count_fixed "$STAGING_REF")
  m=$(count_fixed "://$STAGING_REF")
  contexts "$STAGING_REF" 12 40 | tee -a "$OUT"
  if [ "$m" != "0" ]; then
    fail "staging-adressen ://$STAGING_REF finnes ($m) — bygget peker på staging"
  elif [ "$n" -le 1 ]; then
    pass "staging-ref $STAGING_REF: $n bart treff (stagingGate.ts-literalen), ingen med ://"
  else
    fail "staging-ref $STAGING_REF: $n treff — forventet høyst 1 (stagingGate.ts-literalen)"
  fi

  n=$(count_fixed 'localhost:3111')
  if [ "$n" = "0" ]; then pass "localhost:3111 (staging-verify-webben): 0 treff"; else fail "localhost:3111: $n treff — EXPO_PUBLIC_WEB_BASE_URL var Mac-en"; fi

  # Anon-nøkkelen: når byggeskriptet har satt den i miljøet, må nøyaktig den
  # verdien ligge i bundelen. Bare lengden skrives ut — aldri nøkkelen.
  if [ -n "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
    n=$(count_fixed "$EXPO_PUBLIC_SUPABASE_ANON_KEY")
    if [ "$n" -ge 1 ]; then
      pass "anon-nøkkelen fra miljøet (${#EXPO_PUBLIC_SUPABASE_ANON_KEY} tegn) finnes i bundelen ($n)"
    else
      fail "anon-nøkkelen fra miljøet (${#EXPO_PUBLIC_SUPABASE_ANON_KEY} tegn) finnes IKKE i bundelen — bygget fikk en annen nøkkel"
    fi
  else
    say "      (EXPO_PUBLIC_SUPABASE_ANON_KEY står ikke i miljøet — nøkkel-sjekken hoppes over; byggeskriptet setter den)"
  fi

  # Forbudt som HEL adresse: fire oktetter, ikke-siffer på begge sider. Hermes
  # pakker strenger, og «draft-2020-1» + «27.0.0.15…» inneholder 127.0.0.1 som
  # delstreng uten å være en IP — derfor kreves formen, ikke bare tegnene.
  # IPv6-literaler (`://[::1]`) og `.local:` matches som ren tekst.
  OCTET='[0-9]{1,3}'
  for pattern in "(^|[^0-9.])127\.0\.0\.1([^0-9]|$)" "(^|[^0-9.])192\.168\.$OCTET\.$OCTET([^0-9]|$)" "(^|[^0-9.])10\.0\.$OCTET\.$OCTET([^0-9]|$)" '://\[[0-9a-fA-F:.]{2,}\]' '\.local:'; do
    n=$(count_regex "$pattern")
    if [ "$n" = "0" ]; then
      pass "LAN/loopback «$pattern»: 0 treff"
    else
      fail "LAN/loopback «$pattern»: $n treff"
      ("$GREP" -oE -- ".{0,30}${pattern}.{0,50}" "$STR" || true) | sed 's/^/      /' | tee -a "$OUT"
    fi
  done

  # Forbudt utenom kjente bibliotek-strenger
  check_allowlisted 'http://' "${ALLOW_HTTP[@]}"
  check_allowlisted 'localhost' "${ALLOW_LOCALHOST[@]}"
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
  if [ "$bundle_id" = "$STORE_BUNDLE_ID" ]; then pass "bundle-id er $STORE_BUNDLE_ID"; else fail "bundle-id er «$bundle_id», ikke $STORE_BUNDLE_ID"; fi
  if [ "$short_version" != '<mangler>' ] && [ -n "$short_version" ]; then pass "versjon satt ($short_version)"; else fail "CFBundleShortVersionString mangler"; fi
  if [ "$build" != '<mangler>' ] && [ -n "$build" ]; then pass "build satt ($build)"; else fail "CFBundleVersion mangler"; fi
  if [ "$non_exempt" = "false" ]; then pass "ITSAppUsesNonExemptEncryption = false"; else fail "ITSAppUsesNonExemptEncryption er «$non_exempt», skal være false"; fi
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
  if printf '%s' "$ent" | "$GREP" -q 'com.apple.developer.associated-domains'; then
    fail "associated-domains er satt — appen skal IKKE claime lenker (kontrakt §Research)"
  else
    pass "ingen com.apple.developer.associated-domains"
  fi
  if printf '%s' "$ent" | "$GREP" -q 'aps-environment'; then
    fail "aps-environment er satt — native v1 har ingen push (N7)"
  else
    pass "ingen aps-environment"
  fi
else
  fail "kunne ikke lese entitlements — er appen signert?"
fi
say ""

say "## Sum: $PASS PASS, $FAIL FAIL"
say "bevis-fil: $OUT"
[ "$FAIL" = "0" ]
