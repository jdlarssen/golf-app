#!/usr/bin/env bash
# Prod-vakta: leser prod-telemetri READ-ONLY via Supabase Management API og
# filer dedupede varsel-issues når noe krever oppmerksomhet. Se
# docs/loops/prod-vakta.md for protokollen.
#
# Personvern: issues inneholder KUN tellinger, SQLSTATE-koder og
# advisory-nøkler — aldri rå logglinjer (de kan inneholde brukerdata).
# Spørringen henter bare kode og antall, så regelen holder alt i SQL-en.
# Detalj-graving skjer read-only i interaktive økter via Supabase MCP.
#
# Fail-closed: klarer ikke skriptet å lese telemetrien, filer det et eget
# varsel-issue om NETTOPP det — aldri stille grønn exit. Varselet og jobbloggen
# sier hvorfor (HTTP-kode + utdrag av API-svaret). Filet eller funnet issue
# gir handled=true i GITHUB_OUTPUT, så workflowens failure-steg ikke dobler.
#
# Miljø:  REF, SUPABASE_ACCESS_TOKEN, GITHUB_REPOSITORY (+ GH_TOKEN for gh).
#         BASELINE_FILE=<sti> — testkrok (tests/scripts/prod-vakt.test.sh).
#
# Portabel bash 3.2 (macOS, der testen også kjører): ingen `declare -A` eller
# `mapfile`, og en variabel inntil et ikke-ASCII-tegn skrives «${var}» — ellers
# dør skriptet på «unbound variable» i UTF-8-locale.

set -u

REF="${REF:?REF (prosjekt-ref) må være satt}"
API="https://api.supabase.com/v1/projects/${REF}"
BASELINE="${BASELINE_FILE:-docs/loops/prod-vakta-baseline.txt}"
REPO="${GITHUB_REPOSITORY:?}"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

mark_handled() { # forteller workflowen at issuet alt er filet/finnes — unngår dobbelt varsel
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "handled=true" >> "$GITHUB_OUTPUT"
  return 0
}

open_or_note_issue() { # title body — dedupet: hopper over hvis åpent issue med samme tittel finnes
  local title="$1" body="$2" existing issue_url
  existing=$(gh issue list --repo "$REPO" --state open --search "in:title \"$title\"" --json number --jq 'length')
  if [ "$existing" -gt 0 ]; then
    echo "Åpent issue «${title}» finnes allerede — hopper over."
    return 0
  fi
  issue_url=$(gh api "repos/$REPO/issues" \
    -f title="$title" \
    -f body="$body" \
    -f "labels[]=bug" \
    -f "labels[]=prod-vakt" \
    -F milestone=9 --jq '.html_url') || issue_url=""
  # Ikke filet = ikke håndtert: returner feil, så ingen setter handled=true
  # og workflowens failure-steg tar varselet.
  if [ -z "$issue_url" ]; then
    echo "::warning::gh api klarte ikke opprette issuet «${title}»"
    return 1
  fi
  echo "Opprettet: $issue_url"
  bash .github/scripts/discord-notify.sh "🚨 **$title** — $issue_url"
}

fail_closed() { # reason
  # Til jobbloggen også: dedup hopper over et åpent issue, og da er dette
  # eneste sted årsaken fra DENNE kjøringen synes.
  echo "::error::$1"
  open_or_note_issue "Prod-vakt: fikk ikke lest telemetri" \
"Prod-vakta klarte ikke å lese prod-telemetrien: $1

Kjøring: ${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-?}

Uten lesing er prod i praksis uovervåket — dette issuet skal behandles som et funn, ikke som støy. Protokoll: docs/loops/prod-vakta.md." \
    && mark_handled
  exit 1
}

api_get() { # navn url [curl-argumenter …] → svaret i $TMP/<navn>.json; fail_closed ved curl-feil eller ikke-2xx
  local name="$1" url="$2" http
  shift 2
  # HTTP-koden skilles ut så varselet kan si 401 (token) vs 429 (rate limit) vs 5xx (API nede).
  http=$(curl -s -o "$TMP/$name.json" -w '%{http_code}' \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$@" "$url") \
    || fail_closed "${name}-endepunktet svarte ikke (curl-feil mot ${url})"
  case "$http" in
    (2[0-9][0-9]) ;;
    (*) fail_closed "${name}-endepunktet svarte HTTP ${http} (401/403 = token; 429 = rate limit; 5xx = API). Svar: $(head -c 200 "$TMP/$name.json" | tr '\n' ' ')" ;;
  esac
}

grep -v '^#' "$BASELINE" | grep -v '^$' > "$TMP/baseline"

# ── 1. Security-advisors mot baseline ──
api_get advisors "$API/advisors/security"
ADV=$(cat "$TMP/advisors.json")
# Formvalidering (fail-closed, symmetrisk med tellings-stien): en omformet
# API-respons skal aldri stille degradere til «ingen nye advisories».
printf '%s' "$ADV" | jq -e '.lints | type == "array"' >/dev/null 2>&1 \
  || fail_closed "uventet svarform fra advisors-endepunktet (.lints er ikke en liste)"
NEW_ADV=$(printf '%s' "$ADV" | jq -r '.lints[].cache_key' | grep -vxF -f "$TMP/baseline" || true)

# ── 2. Postgres-feil (ERROR/FATAL/PANIC) siste 24 t — kun tellinger per SQLSTATE ──
# ClickHouse-motoren (Supabase-standard siden juni 2026): alle kilder i én
# `logs`-tabell med `source`-kolonne og feltene i log_attributes; count(), for
# count(*) avvises. Endepunktet leser bare SISTE MINUTT uten
# iso_timestamp_start/end, så vinduet sendes eksplisitt: nøyaktig 24 t (API-ets
# maks), kuttet til helt minutt og regnet ut fra ÉN now-verdi. jq, ikke
# `date -d` (finnes ikke på macOS).
SQL="select log_attributes['parsed.sql_state_code'] as code, log_attributes['parsed.application_name'] as app, count() as n from logs where source = 'postgres_logs' and log_attributes['parsed.error_severity'] in ('ERROR','FATAL','PANIC') group by code, app order by n desc limit 50"
WINDOW=$(jq -rn 'now | floor | . - (. % 60) | "\(. - 86400 | todate) \(todate)"')
START="${WINDOW% *}"
END="${WINDOW#* }"
api_get logs "$API/analytics/endpoints/logs" -G --data-urlencode "sql=$SQL" --data-urlencode "iso_timestamp_start=$START" --data-urlencode "iso_timestamp_end=$END"
PG=$(cat "$TMP/logs.json")
# Formvalidering: et svar som ikke er en gyldig telling, blir aldri «0 feil».
# Tom liste = lovlig 0. Antallet kan komme som tall eller siffer-streng
# (ClickHouse UInt64).
printf '%s' "$PG" | jq -e '
  type == "object"
  and (.error == null)
  and (.result | type == "array")
  and all(.result[];
        type == "object"
        and ((.n | type == "number" and . >= 0 and . == floor)
             or (.n | type == "string" and test("^[0-9]+$"))))
' >/dev/null 2>&1 \
  || fail_closed "uventet svarform fra logs-endepunktet (ikke en liste med tellinger). Svar: $(head -c 200 "$TMP/logs.json" | tr '\n' ' ')"

# «pg:<kode><TAB><app><TAB><antall>» per rad (tom kode → pg:-, tom app → -).
printf '%s' "$PG" \
  | jq -r '.result[] | "pg:\(if (.code // "") == "" then "-" else .code end)\t\(if (.app // "") == "" then "-" else .app end)\t\(.n | tonumber)"' \
  > "$TMP/pg_rows"
# Supabase Management API (MCP execute_sql, SQL-editoren) — interaktive
# spørringer, ikke apptrafikk. Telles og vises for seg, varsler ALDRI alene
# uansett SQLSTATE-kode (#2304: en feilskrevet manuell spørring er ikke et
# apphull). En ekte feil fra appen på samme kode (annen application_name)
# varsler fortsatt normalt — se awk-filteret under.
awk -F'\t' '$2 == "mgmt-api" { n[$1] += $3 } END { for (k in n) print k "\t" n[k] }' "$TMP/pg_rows" \
  | sort -k1,1 > "$TMP/pg_mgmt"
# Resten (apptrafikk), summert per nøkkel, størst først.
awk -F'\t' '$2 != "mgmt-api" { n[$1] += $3 } END { for (k in n) print n[k] "\t" k }' "$TMP/pg_rows" \
  | sort -k1,1nr -k2,2 \
  | awk -F'\t' '{ print $2 "\t" $1 }' > "$TMP/pg_codes"
# Kjente koder (pg:<kode> i baseline) telles og vises, men varsler ikke alene.
: > "$TMP/pg_known"; : > "$TMP/pg_new"
awk -F'\t' -v kf="$TMP/pg_known" -v nf="$TMP/pg_new" \
  'FILENAME == ARGV[1] { known[$0] = 1; next } { print > (($1 in known) ? kf : nf) }' \
  "$TMP/baseline" "$TMP/pg_codes"
PG_TOTAL=$(awk -F'\t' '{ s += $2 } END { print s + 0 }' "$TMP/pg_codes")
MGMT_TOTAL=$(awk -F'\t' '{ s += $2 } END { print s + 0 }' "$TMP/pg_mgmt")
PG_TOTAL=$((PG_TOTAL + MGMT_TOTAL))
KNOWN_LINE=$(awk -F'\t' '{ printf "%s%s: %s", (NR > 1 ? " · " : ""), $1, $2 }' "$TMP/pg_known")
MGMT_LINE=$(awk -F'\t' '{ printf "%s%s: %s", (NR > 1 ? " · " : ""), $1, $2 }' "$TMP/pg_mgmt")

# ── Vurdér signal ──
if [ -z "$NEW_ADV" ] && [ ! -s "$TMP/pg_new" ]; then
  if [ "$PG_TOTAL" -eq 0 ]; then
    echo "Prod-vakt: alt stille — 0 postgres-feil siste døgn, ingen advisories utenfor baseline."
  else
    MSG="Prod-vakt: alt stille — ${PG_TOTAL} postgres-feil siste døgn"
    [ -s "$TMP/pg_known" ] && MSG="${MSG}, kjente typer (${KNOWN_LINE})"
    [ -s "$TMP/pg_mgmt" ] && MSG="${MSG}, fra Supabase Management API (${MGMT_LINE})"
    echo "${MSG}, ingen advisories utenfor baseline."
  fi
  exit 0
fi

ADV_SECTION=""
if [ -n "$NEW_ADV" ]; then
  ADV_SECTION="**Nye security-advisories utenfor baseline:**
\`\`\`
$NEW_ADV
\`\`\`
Bevisste valg → legg nøkkelen i \`docs/loops/prod-vakta-baseline.txt\` via PR. Reelle funn → fiks.
"
fi
PG_SECTION=""
if [ -s "$TMP/pg_new" ]; then
  PG_SECTION="**Nye typer postgres-feil siste 24 t** (ERROR/FATAL/PANIC, SQLSTATE-kode: antall):
\`\`\`
$(awk -F'\t' '{ print $1 ": " $2 }' "$TMP/pg_new")
\`\`\`
"
fi
if [ -s "$TMP/pg_known" ]; then
  PG_SECTION="${PG_SECTION}Kjente typer (i baseline, varsler ikke alene): ${KNOWN_LINE}
"
fi
if [ -s "$TMP/pg_mgmt" ]; then
  PG_SECTION="${PG_SECTION}Fra Supabase Management API / interaktive spørringer (ikke apptrafikk, varsler ikke alene): ${MGMT_LINE}
"
fi
if [ "$PG_TOTAL" -gt 0 ]; then
  PG_SECTION="${PG_SECTION}Totalt ${PG_TOTAL} postgres-feil siste 24 t. Detaljer hentes read-only i interaktiv økt (Supabase MCP, logs explorer). Rå logglinjer skal ikke inn i issues. Typer som er diagnostisert og godtatt → legg \`pg:<kode>\` i \`docs/loops/prod-vakta-baseline.txt\` via PR. Reelle feil → fiks.
"
fi

BODY=$(printf 'Prod-vakta fant signaler i prod-telemetrien (%s):\n\n%s\n%s\nKjøring: %s/%s/actions/runs/%s\n\nHåndtering: docs/loops/ci-vakta.md → «Prod-vakt-issues». Issuet lukkes når signalet er diagnostisert og enten fikset eller baselinet.' \
  "$(date -u +%Y-%m-%d)" "$ADV_SECTION" "$PG_SECTION" "${GITHUB_SERVER_URL:-https://github.com}" "$REPO" "${GITHUB_RUN_ID:-?}")

open_or_note_issue "Prod-vakt: signaler i prod-telemetrien" "$BODY"
