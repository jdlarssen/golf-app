#!/usr/bin/env bash
# Prod-vakta: leser prod-telemetri READ-ONLY via Supabase Management API og
# filer dedupede varsel-issues når noe krever oppmerksomhet. Se
# docs/loops/prod-vakta.md for protokollen.
#
# Personvern: issues inneholder KUN tellinger og advisory-nøkler — aldri rå
# logglinjer (de kan inneholde brukerdata). Detalj-graving skjer read-only i
# interaktive økter via Supabase MCP.
#
# Fail-closed: klarer ikke skriptet å lese telemetrien, filer det et eget
# varsel-issue om NETTOPP det — aldri stille grønn exit.

set -u

REF="${REF:?REF (prosjekt-ref) må være satt}"
API="https://api.supabase.com/v1/projects/$REF"
BASELINE="docs/loops/prod-vakta-baseline.txt"
REPO="${GITHUB_REPOSITORY:?}"

open_or_note_issue() { # title body — dedupet: hopper over hvis åpent issue med samme tittel finnes
  local title="$1" body="$2" existing issue_url
  existing=$(gh issue list --repo "$REPO" --state open --search "in:title \"$title\"" --json number --jq 'length')
  if [ "$existing" -gt 0 ]; then
    echo "Åpent issue «$title» finnes allerede — hopper over."
    return 0
  fi
  issue_url=$(gh api "repos/$REPO/issues" \
    -f title="$title" \
    -f body="$body" \
    -f "labels[]=bug" \
    -f "labels[]=prod-vakt" \
    -F milestone=9 --jq '.html_url')
  echo "Opprettet: $issue_url"
  bash .github/scripts/discord-notify.sh "🚨 **$title** — $issue_url"
}

fail_closed() { # reason
  open_or_note_issue "Prod-vakt: fikk ikke lest telemetri" \
"Prod-vakta klarte ikke å lese prod-telemetrien: $1

Kjøring: ${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-?}

Uten lesing er prod i praksis uovervåket — dette issuet skal behandles som et funn, ikke som støy. Protokoll: docs/loops/prod-vakta.md."
  exit 1
}

# ── 1. Security-advisors mot baseline ──
ADV=$(curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API/advisors/security") \
  || fail_closed "advisors-endepunktet svarte ikke (curl-feil mot $API/advisors/security)"
# Formvalidering (fail-closed, symmetrisk med tellings-stien): en omformet
# API-respons skal aldri stille degradere til «ingen nye advisories».
printf '%s' "$ADV" | jq -e '.lints | type == "array"' >/dev/null 2>&1 \
  || fail_closed "uventet svarform fra advisors-endepunktet (.lints er ikke en liste)"
NEW_ADV=$(printf '%s' "$ADV" | jq -r '.lints[].cache_key' | grep -vxF -f <(grep -v '^#' "$BASELINE" | grep -v '^$') || true)

# ── 2. Postgres-feil (ERROR/FATAL/PANIC) siste 24 t — kun telling ──
SQL="select count(*) as n from postgres_logs cross join unnest(metadata) m cross join unnest(m.parsed) p where p.error_severity in ('ERROR','FATAL','PANIC') and postgres_logs.timestamp > timestamp_sub(current_timestamp(), interval 24 hour)"
PG=$(curl -sf -G -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API/analytics/endpoints/logs.all" --data-urlencode "sql=$SQL") \
  || fail_closed "logs-endepunktet svarte ikke (analytics/endpoints/logs.all)"
PG_ERRORS=$(printf '%s' "$PG" | jq -r '.result[0].n // 0' 2>/dev/null)
case "$PG_ERRORS" in (*[!0-9]*|'') fail_closed "uventet svarform fra logs-endepunktet (klarte ikke lese telling)";; esac

# ── Vurdér signal ──
if [ -z "$NEW_ADV" ] && [ "$PG_ERRORS" -eq 0 ]; then
  echo "Prod-vakt: alt stille — 0 postgres-feil siste døgn, ingen advisories utenfor baseline."
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
if [ "$PG_ERRORS" -gt 0 ]; then
  PG_SECTION="**Postgres-feil siste 24 t:** $PG_ERRORS stk (ERROR/FATAL/PANIC).
Detaljer hentes read-only i interaktiv økt (Supabase MCP, logs explorer) — rå logglinjer skal ikke inn i issues.
"
fi

BODY=$(printf 'Prod-vakta fant signaler i prod-telemetrien (%s):\n\n%s\n%s\nKjøring: %s/%s/actions/runs/%s\n\nHåndtering: docs/loops/ci-vakta.md → «Prod-vakt-issues». Issuet lukkes når signalet er diagnostisert og enten fikset eller baselinet.' \
  "$(date -u +%Y-%m-%d)" "$ADV_SECTION" "$PG_SECTION" "${GITHUB_SERVER_URL:-https://github.com}" "$REPO" "${GITHUB_RUN_ID:-?}")

open_or_note_issue "Prod-vakt: signaler i prod-telemetrien" "$BODY"
