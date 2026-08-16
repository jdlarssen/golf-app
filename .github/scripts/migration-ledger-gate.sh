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
# prefiks (hovedboka bokfører noen med og noen uten nummer). Kjente unntak
# (omdøpt ved påføring, eller påført utenom hovedboka og verifisert
# funksjonelt) ligger i docs/loops/migration-ledger-baseline.txt.
#
# Fail-closed: klarer ikke skriptet å lese hovedboka, filer det et eget varsel
# — aldri stille grønn exit. Grønn kjøring lukker et evt. åpent varsel-issue,
# så morgenbriefen slutter å spørre av seg selv.
#
# Miljø:  REF (prosjekt-ref), SUPABASE_ACCESS_TOKEN — påkrevd for API-lesing.
#         GITHUB_REPOSITORY + GH_TOKEN — issue-håndtering (hoppes over uten).
#         GITHUB_EVENT_NAME=pull_request — ingen issue-skriving (PR-en er synlig selv).
#         LEDGER_FILE=<sti> — testkrok: JSON-liste [{version,name}] i stedet for API.

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

can_touch_issues() { [ -n "$REPO" ] && [ "$EVENT" != "pull_request" ]; }

mark_handled() { # forteller workflowen at et issue alt er filet — unngår dobbelt varsel
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "handled=true" >> "$GITHUB_OUTPUT"
  return 0
}

open_or_note_issue() { # title body — dedupet på tittel
  local title="$1" body="$2" existing issue_url
  can_touch_issues || { echo "(ingen issue-skriving: ${REPO:-lokalt}/${EVENT:-ingen event})"; return 0; }
  existing=$(gh issue list --repo "$REPO" --state open --search "in:title \"$title\"" --json number --jq 'length')
  if [ "$existing" -gt 0 ]; then
    echo "Åpent issue «$title» finnes allerede — hopper over."
    mark_handled
    return 0
  fi
  issue_url=$(gh api "repos/$REPO/issues" \
    -f title="$title" \
    -f body="$body" \
    -f "labels[]=bug" \
    -f "labels[]=prod-vakt" \
    -F milestone=9 --jq '.html_url')
  echo "Opprettet: $issue_url"
  mark_handled
  bash .github/scripts/discord-notify.sh "🚨 **$title** — $issue_url"
}

close_open_issue_if_any() { # grønt igjen → lukk varselet med bevis-lenke
  can_touch_issues || return 0
  local n
  for n in $(gh issue list --repo "$REPO" --state open --search "in:title \"$ISSUE_TITLE\"" --json number --jq '.[].number'); do
    gh issue close "$n" --repo "$REPO" --comment "Grønn igjen: alle migrasjonsfiler på main er nå bokført i prods hovedbok. Kjøring: $RUN_URL" \
      && echo "Lukket #$n (grønt igjen)."
  done
}

fail_closed() { # reason
  echo "::error::$1"
  open_or_note_issue "Migrasjons-porten: fikk ikke lest hovedboka i prod" \
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
  LEDGER=$(curl -sf -X POST "$API/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$BODY") || fail_closed "database/query-endepunktet svarte ikke (curl-feil mot $API/database/query)"
fi
# Formvalidering: en tom eller omformet respons skal aldri degradere til «alt mangler».
printf '%s' "$LEDGER" | jq -e 'type == "array" and length > 0 and all(.[]; has("name"))' >/dev/null 2>&1 \
  || fail_closed "uventet svarform fra hovedboka (ikke en ikke-tom liste med name-felt)"

LEDGER_SLUGS=$(printf '%s' "$LEDGER" | jq -r '.[].name' | sed -E 's/^[0-9]{4,}_//' | sort -u)
LEDGER_COUNT=$(printf '%s\n' "$LEDGER_SLUGS" | grep -c . || true)

# ── 2. Les baseline (alias / @outside-ledger) → TAB-separert oppslagsfil ──
# Bevisst uten bash-4-assosiative tabeller: macOS-bash 3.2 svelger `declare -A`
# stille og porten ble «grønn med 0 filer sjekket» i første lokale kjøring.
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
: > "$TMP/aliases"
if [ -f "$BASELINE" ]; then
  sed 's/#.*//' "$BASELINE" \
    | awk -F'=' 'NF == 2 { gsub(/^[ \t]+|[ \t]+$/, "", $1); gsub(/^[ \t]+|[ \t]+$/, "", $2); if ($1 != "" && $2 != "") print $1 "\t" $2 }' \
    > "$TMP/aliases"
fi
alias_for() { awk -F'\t' -v k="$1" '$1 == k { print $2; exit }' "$TMP/aliases"; }

# ── 3. Sammenlign fil for fil ──
: > "$TMP/missing"   # filer på main uten hovedbok-rad
: > "$TMP/matched"   # hovedbok-navn som fikk en fil
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
  if printf '%s\n' "$LEDGER_SLUGS" | grep -qxF "$target"; then
    echo "$target" >> "$TMP/matched"
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

# Hovedbok-rader uten fil på main = SQL påført prod utenom repoet (drift andre veien).
# Advarsel, ikke rødt — dok-skjema-jobben eier prod↔staging-drift.
LEDGER_ONLY=$(comm -23 <(printf '%s\n' "$LEDGER_SLUGS") <(sort -u "$TMP/matched"))
[ -z "$LEDGER_ONLY" ] || echo "::warning::hovedbok-rader uten migrasjonsfil på main (påført utenom repoet?): $(printf '%s' "$LEDGER_ONLY" | tr '\n' ' ')"

echo "Hovedbok: $LEDGER_COUNT unike navn. Filer sjekket: $CHECKED, utenom hovedboka (baseline): $GRANDFATHERED, før hovedboka (<$(printf '%04d' "$LEDGER_STARTS_AT")): $SKIPPED_PRE."

# ── 4. Dom ──
if [ ! -s "$TMP/missing" ]; then
  echo "Migrasjons-porten: grønn — alle migrasjonsfiler på main er bokført i prods hovedbok."
  close_open_issue_if_any
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
