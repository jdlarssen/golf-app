#!/usr/bin/env bash
# Test for .github/scripts/prod-vakt.sh (#2238).
#
# Kjør: bash tests/scripts/prod-vakt.test.sh
# macOS-fella (bash 3.2 + UTF-8): LANG=nb_NO.UTF-8 LC_ALL=nb_NO.UTF-8 /bin/bash tests/scripts/prod-vakt.test.sh
#
# En falsk `curl` og en falsk `gh` legges først på PATH. Falsk curl logger
# argumentene sine og svarer med HTTP-kode og body fra miljøet (ADV_* for
# advisors, PG_* for logg-endepunktet). Falsk gh svarer på `issue list` med
# GH_EXISTING og fanger tittel og body når skriptet oppretter et issue. Slik
# bevises forespørselens form og alle fail-closed-grenene uten nett og uten
# å røre prod.
#
# Skriptet kjøres med samme bash som testen ("$BASH"), så macOS-kjøringen
# faktisk tester bash 3.2.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat > "$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
{ echo "@@CALL"; for a in "$@"; do printf '%s\n' "$a"; done; } >> "$FAKE_DIR/curl-calls"
out="" fail=0 want_code=0 url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -w) want_code=1; shift ;;
    -H|-X|-d|--data-urlencode) shift ;;
    --*) ;;
    -*) case "$1" in *f*) fail=1 ;; esac ;;
    *) url="$1" ;;
  esac
  shift
done
case "$url" in
  */advisors/security) code="$ADV_HTTP"; body="$ADV_BODY" ;;
  */analytics/endpoints/logs*) code="$PG_HTTP"; body="$PG_BODY" ;;
  *) code=404; body='{"message":"ukjent endepunkt i testen"}' ;;
esac
if [ -n "$out" ]; then
  printf '%s' "$body" > "$out"
  [ "$want_code" = 1 ] && printf '%s' "$code"
  exit 0
fi
# Stil uten -o (curl -sf): -f gir exit 22 på HTTP >= 400, som ekte curl.
if [ "$fail" = 1 ] && [ "$code" -ge 400 ]; then exit 22; fi
printf '%s' "$body"
EOF
cat > "$TMP/bin/gh" <<'EOF'
#!/usr/bin/env bash
{ echo "@@CALL"; for a in "$@"; do printf '%s\n' "$a"; done; } >> "$FAKE_DIR/gh-calls"
case "$1 ${2:-}" in
  "issue list") printf '%s\n' "$GH_EXISTING" ;;
  "api repos/"*)
    if [ "$GH_API_FAIL" = 1 ]; then echo "gh: HTTP 502" >&2; exit 1; fi
    for a in "$@"; do
      case "$a" in
        title=*) printf '%s' "${a#title=}" > "$FAKE_DIR/issue-title" ;;
        body=*) printf '%s' "${a#body=}" > "$FAKE_DIR/issue-body" ;;
      esac
    done
    echo "https://github.com/test/repo/issues/9999" ;;
  *) echo "falsk gh: ukjent kall: $*" >&2; exit 1 ;;
esac
EOF
chmod +x "$TMP/bin/curl" "$TMP/bin/gh"

pass=0
fail=0

check() { # beskrivelse forventet faktisk
  if [ "$2" = "$3" ]; then
    pass=$((pass + 1))
    printf 'PASS  %s\n' "$1"
  else
    fail=$((fail + 1))
    printf 'FAIL  %s: forventet %s, fikk %s\n' "$1" "$2" "$3"
  fi
}

contains() { # beskrivelse tekst nål
  case "$2" in
    *"$3"*) check "$1" yes yes ;;
    *) check "$1" yes no ;;
  esac
}

lacks() { # beskrivelse tekst nål
  case "$2" in
    *"$3"*) check "$1" "ingen treff" "treff" ;;
    *) check "$1" "ingen treff" "ingen treff" ;;
  esac
}

reset_env() {
  ADV_HTTP=200
  ADV_BODY='{"lints":[{"cache_key":"kjent_advisory"}]}'
  PG_HTTP=200
  PG_BODY='{"result":[]}'
  GH_EXISTING=0
  GH_API_FAIL=0
  BASELINE_LINES='# testbaseline
kjent_advisory'
}

run_case() { # navn → setter EXIT, OUT, TITLE, ISSUE, GHOUT, CALL (args fra logg-kallet)
  local dir="$TMP/case-$1"
  mkdir -p "$dir"
  : > "$dir/curl-calls"
  : > "$dir/gh-calls"
  : > "$dir/github-output"
  printf '%s\n' "$BASELINE_LINES" > "$dir/baseline"
  (
    cd "$ROOT" || exit 99
    export PATH="$TMP/bin:$PATH" FAKE_DIR="$dir" REF=testref SUPABASE_ACCESS_TOKEN=fake-token \
      GITHUB_REPOSITORY=test/repo GITHUB_OUTPUT="$dir/github-output" GITHUB_RUN_ID=42 \
      BASELINE_FILE="$dir/baseline" \
      ADV_HTTP ADV_BODY PG_HTTP PG_BODY GH_EXISTING GH_API_FAIL
    unset DISCORD_WEBHOOK_URL
    "$BASH" .github/scripts/prod-vakt.sh
  ) > "$dir/stdout" 2> "$dir/stderr"
  EXIT=$?
  OUT=$(cat "$dir/stdout" "$dir/stderr")
  TITLE=$(cat "$dir/issue-title" 2>/dev/null || true)
  ISSUE=$(cat "$dir/issue-body" 2>/dev/null || true)
  GHOUT=$(cat "$dir/github-output")
  # Argumentene fra kallet mot logg-endepunktet, ett per linje.
  CALL=$(awk '/^@@CALL$/ { if (blk ~ /analytics\/endpoints\/logs/) hit = blk; blk = ""; next }
              { blk = blk $0 "\n" }
              END { if (blk ~ /analytics\/endpoints\/logs/) hit = blk; printf "%s", hit }' "$dir/curl-calls")
}

READ_FAIL="Prod-vakt: fikk ikke lest telemetri"
SIGNAL="Prod-vakt: signaler i prod-telemetrien"

# (a)+(d) alt stille: forespørselens form, og tom liste er lovlig 0 feil
reset_env
run_case a
check "(a) exit 0 når alt er stille" 0 "$EXIT"
URL=$(printf '%s\n' "$CALL" | grep '^https://' | head -1)
check "(a) treffer det nye logg-endepunktet" "https://api.supabase.com/v1/projects/testref/analytics/endpoints/logs" "$URL"
START=$(printf '%s\n' "$CALL" | sed -n 's/^iso_timestamp_start=//p')
END=$(printf '%s\n' "$CALL" | sed -n 's/^iso_timestamp_end=//p')
SPAN=$(jq -n --arg s "$START" --arg e "$END" '($e | fromdate) - ($s | fromdate)' 2>/dev/null || echo ugyldig)
check "(a) vinduet er nøyaktig 86400 s" 86400 "$SPAN"
WHOLE=$(jq -n --arg e "$END" '($e | fromdate) % 60' 2>/dev/null || echo ugyldig)
check "(a) vinduet slutter på et helt minutt" 0 "$WHOLE"
RECENT=$(jq -n --arg e "$END" 'now - ($e | fromdate) | . >= 0 and . < 120' 2>/dev/null || echo ugyldig)
check "(a) vinduet slutter nå (siste to minutter)" true "$RECENT"
SQL=$(printf '%s\n' "$CALL" | sed -n 's/^sql=//p')
contains "(a) SQL leser logs-tabellen med source-filter" "$SQL" "from logs where source = 'postgres_logs'"
contains "(a) SQL bruker ClickHouse count()" "$SQL" "count()"
contains "(a) SQL grupperer per SQLSTATE" "$SQL" "log_attributes['parsed.sql_state_code']"
lacks "(a) SQL henter ikke event_message" "$SQL" "event_message"
contains "(a) token sendes som Bearer" "$CALL" "Authorization: Bearer fake-token"
GETS=$(printf '%s\n' "$CALL" | grep -cx -- '-G')
check "(a) GET med parametrene i URL-en (-G), ikke POST" 1 "$GETS"
contains "(d) loggen sier alt stille med 0 feil" "$OUT" "alt stille — 0 postgres-feil"
check "(d) ingen issue opprettet" "" "$TITLE"

# (b) logg-kallet svarer HTTP 400 med feiltekst
reset_env
PG_HTTP=400
PG_BODY='{"error":"Table \"postgres_logs\" does not exist."}'
run_case b
check "(b) exit 1" 1 "$EXIT"
check "(b) issue om lesefeil" "$READ_FAIL" "$TITLE"
contains "(b) varselet sier HTTP 400" "$ISSUE" "HTTP 400"
contains "(b) varselet har feilutdraget" "$ISSUE" "does not exist"
contains "(b) GITHUB_OUTPUT har handled=true" "$GHOUT" "handled=true"

# (c) HTTP 200 med error i body er ikke «0 feil»
reset_env
PG_BODY='{"error":"Unknown identifier: parsed.sql_state_code"}'
run_case c
check "(c) exit 1" 1 "$EXIT"
check "(c) issue om lesefeil" "$READ_FAIL" "$TITLE"
lacks "(c) ikke «alt stille»" "$OUT" "alt stille"
contains "(c) GITHUB_OUTPUT har handled=true" "$GHOUT" "handled=true"

# (c2) tellingen er ikke et tall
reset_env
PG_BODY='{"result":[{"code":"42501","n":"mange"}]}'
run_case c2
check "(c2) ikke-numerisk n gir exit 1" 1 "$EXIT"
check "(c2) issue om lesefeil" "$READ_FAIL" "$TITLE"

# (c3) raden mangler n
reset_env
PG_BODY='{"result":[{"code":"42501"}]}'
run_case c3
check "(c3) manglende n gir exit 1" 1 "$EXIT"
check "(c3) issue om lesefeil" "$READ_FAIL" "$TITLE"

# (c4) svaret mangler result (det gamle `// 0` gjorde dette til 0 feil)
reset_env
PG_BODY='{"rows":[]}'
run_case c4
check "(c4) manglende result gir exit 1" 1 "$EXIT"
check "(c4) issue om lesefeil" "$READ_FAIL" "$TITLE"

# (c5) error i body ved siden av en gyldig result-liste er fortsatt en feil
reset_env
PG_BODY='{"result":[],"error":"Query timed out"}'
run_case c5
check "(c5) error ved siden av result gir exit 1" 1 "$EXIT"
check "(c5) issue om lesefeil" "$READ_FAIL" "$TITLE"
lacks "(c5) ikke «alt stille»" "$OUT" "alt stille"

# (e) én kjent kode og én ny: den nye varsles med antall, den kjente vises
reset_env
BASELINE_LINES="$BASELINE_LINES
pg:23505"
PG_BODY='{"result":[{"code":"42501","n":"17"},{"code":"23505","n":2}]}'
run_case e
check "(e) exit 0 (signal filet)" 0 "$EXIT"
check "(e) signal-issue" "$SIGNAL" "$TITLE"
contains "(e) ny kode med antall" "$ISSUE" "pg:42501: 17"
contains "(e) kjent kode vises med antall" "$ISSUE" "pg:23505: 2"
contains "(e) totalen står i issuet" "$ISSUE" "19"

# (f) alle koder i baseline: ingen varsel
reset_env
BASELINE_LINES="$BASELINE_LINES
pg:23505
pg:42501"
PG_BODY='{"result":[{"code":"42501","n":"17"},{"code":"23505","n":2}]}'
run_case f
check "(f) exit 0" 0 "$EXIT"
check "(f) ingen issue" "" "$TITLE"
contains "(f) loggen sier alt stille" "$OUT" "alt stille"
contains "(f) loggen viser kjente koder med antall" "$OUT" "pg:42501: 17"

# (g) advisors-kallet svarer 401
reset_env
ADV_HTTP=401
ADV_BODY='{"message":"JWT could not be decoded"}'
run_case g
check "(g) exit 1" 1 "$EXIT"
check "(g) issue om lesefeil" "$READ_FAIL" "$TITLE"
contains "(g) varselet sier HTTP 401" "$ISSUE" "HTTP 401"
contains "(g) varselet har feilutdraget" "$ISSUE" "JWT could not be decoded"
contains "(g) GITHUB_OUTPUT har handled=true" "$GHOUT" "handled=true"

# (g2) advisors svarer 200, men uten lints-liste
reset_env
ADV_BODY='{"message":"ok"}'
run_case g2
check "(g2) exit 1" 1 "$EXIT"
check "(g2) issue om lesefeil" "$READ_FAIL" "$TITLE"
contains "(g2) varselet peker på advisors-svaret" "$ISSUE" "advisors-endepunktet"

# (h) tom og manglende kode slås sammen til pg:-
reset_env
PG_BODY='{"result":[{"code":"","n":3},{"code":null,"n":"4"}]}'
run_case h
check "(h) exit 0 (signal filet)" 0 "$EXIT"
check "(h) signal-issue" "$SIGNAL" "$TITLE"
contains "(h) tom kode blir pg:- og summeres" "$ISSUE" "pg:-: 7"

# (i) lesefeil når issuet alt er åpent: ingen ny opprettelse, men handled
reset_env
PG_HTTP=500
PG_BODY='{"message":"internal"}'
GH_EXISTING=1
run_case i
check "(i) exit 1" 1 "$EXIT"
check "(i) ingen ny opprettelse (dedup)" "" "$TITLE"
contains "(i) GITHUB_OUTPUT har handled=true" "$GHOUT" "handled=true"

# (j) lesefeil og gh klarer ikke opprette issuet: backstoppen må fyre
reset_env
PG_HTTP=500
PG_BODY='{"message":"internal"}'
GH_API_FAIL=1
run_case j
check "(j) exit 1" 1 "$EXIT"
lacks "(j) handled er ikke satt når issuet ikke ble filet" "$GHOUT" "handled=true"

# (k) kun mgmt-api-feil (interaktive spørringer, ikke apptrafikk): alt stille,
# ingen issue, men nevnt i loggen — selv en ukjent/ubaselinet kode (#2304)
reset_env
PG_BODY='{"result":[{"code":"42703","app":"mgmt-api","n":2}]}'
run_case k
check "(k) exit 0 (ingen alarm alene)" 0 "$EXIT"
check "(k) ingen issue" "" "$TITLE"
contains "(k) loggen sier alt stille" "$OUT" "alt stille"
contains "(k) loggen nevner mgmt-api-kilden" "$OUT" "pg:42703: 2"
contains "(k) totalen inkluderer mgmt-api-feilen" "$OUT" "2 postgres-feil"

# (l) samme kode fra BÅDE mgmt-api og ekte apptrafikk: mgmt-api-andelen
# varsler ikke alene, men apptrafikk-andelen gjør — og de telles separat
reset_env
PG_BODY='{"result":[{"code":"42703","app":"mgmt-api","n":2},{"code":"42703","app":"","n":5}]}'
run_case l
check "(l) exit 0 (signal filet)" 0 "$EXIT"
check "(l) signal-issue" "$SIGNAL" "$TITLE"
contains "(l) apptrafikk-andelen varsler som ny" "$ISSUE" "pg:42703: 5"
contains "(l) mgmt-api-andelen vises separat" "$ISSUE" "pg:42703: 2"
contains "(l) mgmt-api-seksjonen nevner Management API" "$ISSUE" "Management API"
contains "(l) totalen summerer begge andelene" "$ISSUE" "7"

echo
printf '%s bestått, %s feilet\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
