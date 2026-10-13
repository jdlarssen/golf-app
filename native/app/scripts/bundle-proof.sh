# native/app/scripts/bundle-proof.sh
# Bundel-reglene for butikkbyggene (#2560, O3). Ett hjem for reglene som leser
# Hermes-bundelen, så iOS-beviset (`store-build-proof.sh`, `main.jsbundle`) og
# Android-beviset (`store-build-proof-android.sh`, `index.android.bundle`) aldri
# kan gli fra hverandre. Hvorfor reglene ser ut som de gjør, står øverst i
# `store-build-proof.sh` (punkt 1). Sources av de to bevisene; kjøres ikke alene.
#
# Kalleren skal:
#  - kjøre `set -euo pipefail` og `export LC_ALL=C` (se `store-build-proof.sh`);
#  - kalle `bundle_proof_require` før bevis-fila skrives (exit 2 når et verktøy
#    eller en hjelpefil mangler);
#  - definere `say`, `pass`, `fail` og `$OUT`, sette `STR=''` og `U16=''`, og
#    slette de to filene i sin EXIT-felle (én felle per skript, se der);
#  - sjekke at bundelen finnes, og så kalle `bundle_proof <sti-til-bundelen>`.
#
# `TORNY_APP_ENV_DIR` peker regelen om appens `.env`-verdier på en annen mappe;
# standard er appmappa denne fila ligger i.

BUNDLE_PROOF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Absolutte stier: `grep` kan være ugrep på maskinen, og `strings` finnes i flere
# varianter. Beviset skal være det samme uansett hva som ligger først i PATH.
GREP=/usr/bin/grep
STRINGS=/usr/bin/strings
PYTHON3=/usr/bin/python3
HERMES_STRINGS="$BUNDLE_PROOF_DIR/hermes-strings.py"
ENV_FILE_LIB="$BUNDLE_PROOF_DIR/env-file.sh"
# Mappa med appens .env-filer (#2208).
ENV_DIR=${TORNY_APP_ENV_DIR:-$(cd "$BUNDLE_PROOF_DIR/.." && pwd)}

PROD_SUPABASE_HOST='glofubopddkjhymcbaph.supabase.co'
STORE_WEB_BASE_URL='https://tornygolf.no'
STAGING_REF='snwmueecmfqqdurxedxv'

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

# Verktøy og hjelpefiler bundel-reglene trenger. Exit 2, som bevisene ellers.
bundle_proof_require() {
  local tool
  for tool in "$GREP" "$STRINGS" "$PYTHON3"; do
    [ -x "$tool" ] || { printf '✗ Mangler verktøy: %s\n' "$tool" >&2; exit 2; }
  done
  [ -f "$HERMES_STRINGS" ] || { printf '✗ Mangler %s (leser UTF-16-tabellen)\n' "$HERMES_STRINGS" >&2; exit 2; }
  [ -f "$ENV_FILE_LIB" ] || { printf '✗ Mangler %s (leser appens .env-filer)\n' "$ENV_FILE_LIB" >&2; exit 2; }
  # shellcheck source=env-file.sh
  . "$ENV_FILE_LIB"
}

# Alle bundel-reglene mot én Hermes-bundel. PASS/FAIL går gjennom kallerens
# `pass`/`fail`, så summen og exit-koden er kallerens.
bundle_proof() {
  local bundle=$1
  local n m ascii_lines u16_lines env_checked env_file env_name env_key env_val OCTET pattern
  STR=$(mktemp -t torny-bevis)
  U16=$(mktemp -t torny-bevis-u16)
  "$STRINGS" "$bundle" > "$STR"
  say "størrelse: $(wc -c < "$bundle" | tr -d ' ') byte · sha256: $(shasum -a 256 "$bundle" | cut -c1-16)…"

  # Both string tables in one file (#1983): the `strings` dump, then the
  # UTF-16LE strings. One string per line in both, so the two tables can never
  # be glued into one false hit. A scanner failure leaves U16 empty, and the
  # æ/ø/å check below then fails too.
  if ! "$PYTHON3" "$HERMES_STRINGS" "$bundle" > "$U16"; then
    fail "hermes-strings.py feilet — UTF-16-tabellen er ikke lest"
    : > "$U16"
  fi
  ascii_lines=$(wc -l < "$STR" | tr -d ' ')
  u16_lines=$(wc -l < "$U16" | tr -d ' ')
  cat "$U16" >> "$STR"
  say "strengtabeller lest: ASCII $ascii_lines linjer · UTF-16LE $u16_lines strenger"

  # The guard on the reader itself: the app's Norwegian copy always puts
  # words like «før» and «på» in the UTF-16 table. Æ/ø/å must sit next to a
  # lowercase ASCII letter, because a lone ø turns up in binary noise too.
  # Alternation, not a bracket expression: under LC_ALL=C, `[æøå]` would be a
  # set of single bytes.
  n=$( ("$GREP" -caE -- '[a-z](æ|ø|å)|(æ|ø|å)[a-z]' "$U16") || true)
  if [ "${n:-0}" -ge 1 ]; then
    pass "UTF-16-tabellen er lest: $n strenger med æ/ø/å i et ord"
  else
    fail "fant ingen UTF-16-strenger med æ/ø/å — leseren er ødelagt eller Hermes har byttet format"
  fi

  # `grep` svarer 1 på null treff; det er et tall her, ikke en feil.
  # `-a`: the file is text, and BSD grep must never answer «Binary file
  # matches» in place of the `-o` hits.
  count_fixed() { ("$GREP" -aoF -- "$1" "$STR" || true) | wc -l | tr -d ' '; }
  count_regex() { ("$GREP" -aoE -- "$1" "$STR" || true) | wc -l | tr -d ' '; }
  offsets_of()  { ("$GREP" -aobF -- "$1" "$STR" || true) | cut -d: -f1; }

  # Every context below is cut by byte count, and the UTF-16 strings hold
  # multibyte characters, so a cut can split an «ø» in half. Invalid bytes can
  # only sit at a cut edge (the `strings` dump is ASCII, the UTF-16 dump valid
  # UTF-8), so trimming each edge keeps the proof file valid UTF-8 and a plain
  # `grep FAIL` on it working in a UTF-8 terminal. sed in the C locale, not
  # `iconv -c` (on macOS it exits 1 on a cut 3-byte character, and even on
  # valid input across byte 1024) and not Python (a broken reader must still
  # print a readable FAIL). Per line: orphan continuation bytes at the start,
  # an unfinished sequence at the end.
  UTF8_CONT=$(printf '\200-\277')
  UTF8_TAIL="[$(printf '\300-\377')]|[$(printf '\340-\377')][$UTF8_CONT]|[$(printf '\360-\377')][$UTF8_CONT][$UTF8_CONT]"
  utf8_trim() { sed -E "s/^[$UTF8_CONT]+//; s/($UTF8_TAIL)\$//"; }
  head_bytes() { printf '%s' "${1:0:$2}" | utf8_trim; }

  # Tekst fra byte-offset: `head` leser fila og `tail` spiser alt head gir, så
  # ingen SIGPIPE (det motsatte, `tail | head`, dør med 141 under pipefail).
  slice() {
    local start=$1 length=$2
    [ "$start" -lt 0 ] && { length=$((length + start)); start=0; }
    head -c "$((start + length))" "$STR" | tail -c "+$((start + 1))" | tr '\n' ' ' | utf8_trim
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
    if [ "$hits" = "0" ]; then pass "«${token}»: 0 treff"; return; fi
    while read -r off; do
      [ -n "$off" ] || continue
      tail_text=$(slice "$off" 120)
      ok=0
      for re in "${allow[@]}"; do
        if printf '%s' "$tail_text" | "$GREP" -qE -- "$re"; then ok=1; break; fi
      done
      if [ "$ok" = "1" ]; then
        say "      kjent  «$(head_bytes "$tail_text" 70)»"
      else
        unknown=$((unknown + 1))
        say "      UKJENT «$(head_bytes "$tail_text" 90)»"
      fi
    done < <(offsets_of "$token")
    if [ "$unknown" = "0" ]; then
      pass "«${token}»: $hits treff, alle på lista over kjente bibliotek-strenger"
    else
      fail "«${token}»: $unknown av $hits treff står IKKE på lista (se UKJENT over)"
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

  # Appens lokale .env-verdier (#2208): ingen skal finnes i bundelen. Verdien
  # skrives aldri ut og står aldri i argv. grep får den som mønsterfil via
  # prosess-substitusjon, og tomme verdier er sortert ut før det, for en tom
  # mønsterlinje treffer alt.
  env_checked=0
  for env_file in "$ENV_DIR"/.env*; do
    [ -f "$env_file" ] || continue
    env_name=$(basename "$env_file")
    while read -r env_key; do
      [ -n "$env_key" ] || continue
      env_val=$(env_file_value "$env_file" "$env_key")
      [ -n "$env_val" ] || continue
      env_checked=$((env_checked + 1))
      if [ "${#env_val}" -lt 12 ]; then
        say "      ${env_name} ${env_key}: ${#env_val} tegn, for kort til å sjekkes (korte verdier gir falske treff)"
      elif [ "$env_val" = "https://$PROD_SUPABASE_HOST" ] || [ "$env_val" = "$STORE_WEB_BASE_URL" ] \
          || { [ -n "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ] && [ "$env_val" = "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]; }; then
        say "      ${env_name} ${env_key}: samme verdi som beviset krever i bundelen, hoppes over"
      else
        n=$( ("$GREP" -aoF -f <(printf '%s\n' "$env_val") "$STR" || true) | wc -l | tr -d ' ')
        if [ "$n" = "0" ]; then
          pass "${env_name} ${env_key} (${#env_val} tegn): 0 treff i bundelen"
        else
          fail "${env_name} ${env_key} (${#env_val} tegn): ${n} treff i bundelen — en lokal .env-verdi er bakt inn"
        fi
      fi
    done < <(env_file_keys "$env_file" EXPO_PUBLIC_)
  done
  if [ "$env_checked" = "0" ]; then
    say "      (ingen EXPO_PUBLIC_-verdier i ${ENV_DIR}/.env* å sjekke)"
  fi

  # Forbudt som HEL adresse: fire oktetter, ikke-siffer på begge sider. Hermes
  # pakker strenger, og «draft-2020-1» + «27.0.0.15…» inneholder 127.0.0.1 som
  # delstreng uten å være en IP — derfor kreves formen, ikke bare tegnene.
  # IPv6-literaler (`://[::1]`) og `.local:` matches som ren tekst.
  OCTET='[0-9]{1,3}'
  for pattern in "(^|[^0-9.])127\.0\.0\.1([^0-9]|$)" "(^|[^0-9.])192\.168\.$OCTET\.$OCTET([^0-9]|$)" "(^|[^0-9.])10\.0\.$OCTET\.$OCTET([^0-9]|$)" '://\[[0-9a-fA-F:.]{2,}\]' '\.local:'; do
    n=$(count_regex "$pattern")
    if [ "$n" = "0" ]; then
      pass "LAN/loopback «${pattern}»: 0 treff"
    else
      fail "LAN/loopback «${pattern}»: $n treff"
      ("$GREP" -aoE -- ".{0,30}${pattern}.{0,50}" "$STR" || true) | utf8_trim | sed 's/^/      /' | tee -a "$OUT"
    fi
  done

  # Forbudt utenom kjente bibliotek-strenger
  check_allowlisted 'http://' "${ALLOW_HTTP[@]}"
  check_allowlisted 'localhost' "${ALLOW_LOCALHOST[@]}"
}
