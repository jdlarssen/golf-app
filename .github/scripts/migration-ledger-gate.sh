#!/usr/bin/env bash
# Migrasjons-hovedbok-porten (#1410): sammenligner filene i supabase/migrations/
# med det som faktisk er PÅFØRT prod (supabase_migrations.schema_migrations,
# lest READ-ONLY via Supabase Management API). Rødt når en fil på main mangler
# i hovedboka — tilstanden «kode i prod, migrasjon ikke i prod» som ingen
# annen port kunne se (0148 lå merget + annonsert i CHANGELOG i to uker uten å
# være påført; 0158 sto som «ubekreftet» i fire dager fordi ingen kunne lese
# prod fra sky-kjøringene).
#
# Matching: filnavn uten `NNNN_`-prefiks == hovedbok-navn uten evt. samme
# prefiks (hovedboka bokfører noen med og noen uten nummer). MULTISETT: to
# filer med samme slug trenger to hovedbok-rader — én rad kan ikke dekke begge
# (ellers ville en re-påført/omdøpt tvilling passere grønt uten å være påført).
# Kjente unntak (omdøpt ved påføring, eller påført utenom hovedboka og
# verifisert funksjonelt) ligger i docs/loops/migration-ledger-baseline.txt.
#
# Fail-closed: klarer ikke skriptet å lese hovedboka, filer det et eget varsel
# — aldri stille grønn exit. Grønn kjøring lukker portens egne åpne varsel-
# issues (eksakt tittel), så morgenbriefen slutter å spørre av seg selv.
#
# Miljø:  REF (prosjekt-ref), SUPABASE_ACCESS_TOKEN — påkrevd for API-lesing.
#         GITHUB_REPOSITORY + GH_TOKEN — issue-håndtering (hoppes over uten).
#         GITHUB_EVENT_NAME=pull_request — ingen issue-skriving (PR-en er synlig selv).
#         LEDGER_FILE=<sti> — testkrok: JSON-liste [{version,name}] i stedet for API.
#
# Portabel bash 3.2 (macOS) med vilje: `declare -A` svelges stille der og ga
# «grønn med 0 filer sjekket» i første lokale kjøring — nettopp feilmodusen
# porten skal hindre. Temp-filer + awk i stedet.

set -u

REF="${REF:-}"
API="https://api.supabase.com/v1/projects/${REF}"
BASELINE="docs/loops/migration-ledger-baseline.txt"
MIGRATIONS_DIR="supabase/migrations"
# Hovedboka begynner ved 0010 (første MCP-påførte migrasjon, 2026-05-11).
# 0001–0009 gikk via SQL Editor før den fantes — de sjekkes ikke.
LEDGER_STARTS_AT=10
REPO="${GITHUB_REPOSITORY:-}"
EVENT="${GITHUB_EVENT_NAME:-}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${REPO:-?}/actions/runs/${GITHUB_RUN_ID:-?}"
ISSUE_TITLE="Prod-vakt: migrasjoner merget men ikke påført prod"
READ_FAIL_TITLE="Migrasjons-porten: fikk ikke lest hovedboka i prod"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

can_touch_issues() { [ -n "$REPO" ] && [ "$EVENT" != "pull_request" ]; }

mark_handled() { # forteller workflowen at et issue alt er filet/finnes — unngår dobbelt varsel
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "handled=true" >> "$GITHUB_OUTPUT"
  return 0
}

open_issue_numbers() { # title → åpne issue-numre med EKSAKT denne tittelen (søket er substreng)
  gh issue list --repo "$REPO" --state open --search "in:title \"$1\"" --json number,title \
    --jq --arg t "$1" 'map(select(.title == $t)) | .[].number' 2>/dev/null
}

open_or_note_issue() { # title body — dedupet på eksakt tittel; oppdaterer åpent issue med ny body som kommentar
  local title="$1" body="$2" existing issue_url
  can_touch_issues || { echo "(ingen issue-skriving: ${REPO:-lokalt}/${EVENT:-ingen event})"; return 0; }
  existing=$(open_issue_numbers "$title" | head -1)
  # gh-feil (rate limit, token, nett) må ikke bli «finnes ikke» → dobbel opprettelse,
  # og heller ikke «finnes» → stille. Bare et numerisk svar teller.
  case "$existing" in
    (*[!0-9]*) echo "::warning::uventet svar fra gh issue list — lar workflow-backstoppen ta varselet"; return 0 ;;
  esac
  if [ -n "$existing" ]; then
    echo "Åpent issue «$title» finnes (#$existing) — legger dagens status som kommentar."
    gh issue comment "$existing" --repo "$REPO" --body "$body" >/dev/null 2>&1 \
      || echo "::warning::fikk ikke kommentert på #$existing"
    mark_handled
    return 0
  fi
  issue_url=$(gh api "repos/$REPO/issues" \
    -f title="$title" \
    -f body="$body" \
    -f "labels[]=bug" \
    -f "labels[]=prod-vakt" \
    -F milestone=9 --jq '.html_url' 2>/dev/null)
  if [ -z "$issue_url" ]; then
    echo "::warning::gh api klarte ikke opprette issue — lar workflow-backstoppen ta varselet"
    return 0
  fi
  echo "Opprettet: $issue_url"
  mark_handled
  bash .github/scripts/discord-notify.sh "🚨 **$title** — $issue_url"
}

close_open_issues_if_any() { # grønt igjen → lukk portens egne varsler (begge titler, eksakt match)
  can_touch_issues || return 0
  local title n
  for title in "$ISSUE_TITLE" "$READ_FAIL_TITLE"; do
    for n in $(open_issue_numbers "$title"); do
      gh issue close "$n" --repo "$REPO" --comment "Grønn igjen: hovedboka i prod er lest, og alle migrasjonsfiler på main er bokført der. Kjøring: $RUN_URL" \
        && echo "Lukket #$n (grønt igjen)."
    done
  done
}

fail_closed() { # reason
  echo "::error::$1"
  open_or_note_issue "$READ_FAIL_TITLE" \
"Migrasjons-hovedbok-porten (#1410) klarte ikke å lese \`supabase_migrations.schema_migrations\` i prod: $1

Kjøring: $RUN_URL

Uten lesing er «merget men ikke påført»-tilstanden usynlig igjen — behandles som et funn, ikke støy. Protokoll: docs/loops/ci-vakta.md §6b."
  exit 1
}

# ── 1. Hent hovedboka ──
if [ -n "${LEDGER_FILE:-}" ]; then
  LEDGER=$(cat "$LEDGER_FILE") || fail_closed "klarte ikke lese LEDGER_FILE=$LEDGER_FILE"
else
  [ -n "$REF" ] || fail_closed "REF (prosjekt-ref) er ikke satt"
  [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || fail_closed "SUPABASE_ACCESS_TOKEN er ikke satt i miljøet"
  BODY=$(jq -cn '{query:"select version, name from supabase_migrations.schema_migrations order by version"}')
  # HTTP-koden skilles ut så varselet kan si 401 (rotert token) vs 5xx (API nede).
  HTTP=$(curl -s -o "$TMP/ledger.json" -w '%{http_code}' -X POST "$API/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$BODY") || fail_closed "database/query-endepunktet svarte ikke (curl-feil mot $API/database/query)"
  [ "$HTTP" = "200" ] || fail_closed "database/query svarte HTTP $HTTP (401/403 = token; 5xx = API) — $(head -c 200 "$TMP/ledger.json" | tr '\n' ' ')"
  LEDGER=$(cat "$TMP/ledger.json")
fi
# Formvalidering: en tom eller omformet respons skal aldri degradere til «alt mangler».
printf '%s' "$LEDGER" | jq -e 'type == "array" and length > 0 and all(.[]; has("name"))' >/dev/null 2>&1 \
  || fail_closed "uventet svarform fra hovedboka (ikke en ikke-tom liste med name-felt)"

# Slug per hovedbok-rad — IKKE dedupet: dubletter er ekte rader (admin_key_metrics
# ligger to ganger) og teller som to i multisett-matchingen.
printf '%s' "$LEDGER" | jq -r '.[].name' | sed -E 's/^[0-9]{4,}_//' | sort > "$TMP/ledger_slugs"
LEDGER_ROWS=$(grep -c . "$TMP/ledger_slugs" || true)

# ── 2. Les baseline (alias / @outside-ledger) → TAB-separert oppslagsfil ──
[ -f "$BASELINE" ] || fail_closed "baseline-fila mangler ($BASELINE) — uten den blir kjente unntak til falske røde"
# Fjern kommentarer og CR (CRLF-lagret fil ga fire falske røde i review), del på ÉN «=».
sed 's/#.*//; s/\r$//' "$BASELINE" \
  | awk -F'=' 'NF == 2 { gsub(/^[ \t]+|[ \t]+$/, "", $1); gsub(/^[ \t]+|[ \t]+$/, "", $2); if ($1 != "" && $2 != "") print $1 "\t" $2 }' \
  > "$TMP/aliases"
# Linjer awk avviste (0 eller 2+ «=», tom side) er skrivefeil, ikke støy — vis dem.
BAD_LINES=$(sed 's/#.*//; s/\r$//' "$BASELINE" | grep -n . | awk '{ line=$0; sub(/^[0-9]+:/, "", line); if (line ~ /^[ \t]*$/) next; n=gsub(/=/, "=", line); if (n != 1) { split($0, a, ":"); print a[1] ": " line } }')
[ -z "$BAD_LINES" ] || fail_closed "baseline-linjer uten nøyaktig én «=» (skrivefeil?): $(printf '%s' "$BAD_LINES" | tr '\n' ';')"
BAD_TARGETS=$(awk -F'\t' '$2 ~ /^@/ && $2 != "@outside-ledger" { print $1 " = " $2 }' "$TMP/aliases")
[ -z "$BAD_TARGETS" ] || fail_closed "ukjent @-markør i baseline (kun @outside-ledger finnes): $(printf '%s' "$BAD_TARGETS" | tr '\n' ';')"
alias_for() { awk -F'\t' -v k="$1" '$1 == k { print $2; exit }' "$TMP/aliases"; }

# ── 3. Sammenlign fil for fil (multisett: hver hovedbok-rad brukes én gang) ──
cp "$TMP/ledger_slugs" "$TMP/unconsumed"
: > "$TMP/missing"   # filer på main uten (ubrukt) hovedbok-rad
GRANDFATHERED=0      # @outside-ledger
SKIPPED_PRE=0        # under LEDGER_STARTS_AT
CHECKED=0

for path in "$MIGRATIONS_DIR"/*.sql; do
  file=$(basename "$path" .sql)
  num=$(printf '%s' "$file" | sed -nE 's/^([0-9]{4,})_.*/\1/p')
  [ -n "$num" ] || { echo "::warning::$file har ikke NNNN_-prefiks (minst 4 sifre) — hoppes over"; continue; }
  if [ "$((10#$num))" -lt "$LEDGER_STARTS_AT" ]; then SKIPPED_PRE=$((SKIPPED_PRE + 1)); continue; fi
  target=$(alias_for "$file")
  if [ "$target" = "@outside-ledger" ]; then GRANDFATHERED=$((GRANDFATHERED + 1)); continue; fi
  [ -n "$target" ] || target=$(printf '%s' "$file" | sed -E 's/^[0-9]{4,}_//')
  CHECKED=$((CHECKED + 1))
  if grep -qxF "$target" "$TMP/unconsumed"; then
    # Forbruk NØYAKTIG én rad (første treff) — sed '0,/re/' er GNU-only, så awk.
    awk -v t="$target" 'BEGIN { done = 0 } { if (!done && $0 == t) { done = 1; next } print }' \
      "$TMP/unconsumed" > "$TMP/unconsumed.next" && mv "$TMP/unconsumed.next" "$TMP/unconsumed"
  else
    echo "$file" >> "$TMP/missing"
  fi
done

# Selvkontroll (I3): en glob som ikke traff, eller en parse-feil som hoppet
# over alt, må aldri passere som grønn.
[ "$CHECKED" -gt 0 ] || fail_closed "0 migrasjonsfiler sjekket (finnes $MIGRATIONS_DIR/*.sql? kjøres skriptet fra repo-rota?)"

# Baseline-linjer som peker på filer som ikke lenger finnes → rydd (advarsel, ikke rødt).
while IFS=$'\t' read -r key _; do
  [ -z "$key" ] || [ -f "$MIGRATIONS_DIR/$key.sql" ] \
    || echo "::warning::baseline-linje for $key peker på en fil som ikke finnes lenger — fjern den"
done < "$TMP/aliases"

# Ubrukte hovedbok-rader = SQL påført prod utenom repoet, eller en rad påført to
# ganger (drift andre veien). Advarsel, ikke rødt — dok-skjema-jobben eier prod↔staging-drift.
LEDGER_ONLY=$(sort -u "$TMP/unconsumed" | grep . || true)
[ -z "$LEDGER_ONLY" ] || echo "::warning::hovedbok-rader uten migrasjonsfil på main (påført utenom repoet, eller dobbelt?): $(printf '%s' "$LEDGER_ONLY" | tr '\n' ' ')"

echo "Hovedbok: $LEDGER_ROWS rader. Filer sjekket: $CHECKED, utenom hovedboka (baseline): $GRANDFATHERED, før hovedboka (<$(printf '%04d' "$LEDGER_STARTS_AT")): $SKIPPED_PRE."

# ── 4. Dom ──
if [ ! -s "$TMP/missing" ]; then
  echo "Migrasjons-porten: grønn — alle migrasjonsfiler på main er bokført i prods hovedbok."
  close_open_issues_if_any
  exit 0
fi

LIST=$(cat "$TMP/missing")
while read -r f; do echo "::error::$f er merget på main, men er ikke påført prod (ingen rad i schema_migrations)"; done < "$TMP/missing"

open_or_note_issue "$ISSUE_TITLE" \
"Migrasjons-hovedbok-porten (#1410) fant migrasjonsfiler på \`main\` som **ikke er bokført som påført i prod**:

\`\`\`
$LIST
\`\`\`

Koden som hviler på dem er allerede ute hos spillerne — funksjonen feiler stille til migrasjonen ligger i basen (0-rad-skriv, CHECK-avvisning, manglende policy).

**Fiks (i en økt med eier — prod-brannmuren #1074 står):** påfør via Supabase MCP \`apply_migration\` med filnavnet uten \`NNNN_\` som navn, staging først hvis den ikke alt er der. Ble fila påført under et annet navn, eller utenom hovedboka og verifisert funksjonelt, legg linja i \`docs/loops/migration-ledger-baseline.txt\` via PR med begrunnelse.

Porten lukker dette issuet selv ved neste grønne kjøring. Kjøring: $RUN_URL — protokoll: docs/loops/ci-vakta.md §6b."

exit 1
