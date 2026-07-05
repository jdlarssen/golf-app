#!/usr/bin/env bash
# PreToolUse-vakt for skrivende Supabase-MCP-verktøy — Tørny prod-brannmur (#1074).
#
# Matcher i settings.json fanger kun mutasjons-verktøyene (execute_sql,
# apply_migration, deploy_edge_function, branch-/prosjekt-livssyklus); read-only-
# verktøy (list_tables, get_logs, …) når aldri hit. Leser PreToolUse-JSON på
# stdin og svarer med hookSpecificOutput-JSON på stdout (eller ingenting →
# normal permission-flyt):
#
#   • DENY   skrivende kall mot prod (glofubopddkjhymcbaph) uten godkjenning
#   • DENY   merge_branch alltid uten godkjenning (merger TIL prod per definisjon)
#   • PASS   execute_sql mot prod som er beviselig read-only (SELECT/WITH/EXPLAIN/
#            SHOW, ingen skrive-nøkkelord, ett statement) — logges
#   • PASS   alt mot staging/branch-prosjekter (prod-ref finnes ikke i kallet)
#
# Godkjennings-luke (engangs): eier godkjenner eksplisitt i økten →
# `touch .claude/approve-prod` → neste prod-skriv slipper gjennom og filen
# slettes. Filer eldre enn 10 min ignoreres. APPROVE_PROD=1 i hook-miljøet
# (eier-startet terminal-økt) honoreres også.
#
# Fail-closed: klarer ikke skriptet å klassifisere et prod-rettet kall (feilet
# parsing, tom query), er svaret DENY — aldri stille pass.
#
# Testbar frittstående: ekko en PreToolUse-payload inn på stdin (se
# tests/hooks/guard.test.sh).

PROD_REF="glofubopddkjhymcbaph"

input="$(cat)"
[ -z "$input" ] && exit 0

log_event() { # rule decision prefix
  local dir="${CLAUDE_PROJECT_DIR:-.}/.claude/logs"
  {
    mkdir -p "$dir" && jq -cn \
      --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg hook "mcp-guard" --arg rule "$1" --arg decision "$2" --arg prefix "$3" \
      '{ts:$ts,hook:$hook,rule:$rule,decision:$decision,prefix:$prefix}' >> "$dir/guard-events.jsonl"
  } 2>/dev/null || true
}

emit_deny() { # rule reason prefix
  log_event "$1" "deny" "$3"
  jq -cn --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Engangs-godkjenning: sentinel-fil < 10 min gammel (slettes ved bruk) eller env.
approved() {
  [ "${APPROVE_PROD:-}" = "1" ] && return 0
  local f="${CLAUDE_PROJECT_DIR:-.}/.claude/approve-prod"
  [ -f "$f" ] || return 1
  local now mtime
  now=$(date +%s)
  mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
  if [ $((now - mtime)) -le 600 ]; then
    rm -f "$f"
    return 0
  fi
  return 1
}

tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"
short="${tool##*__}"

DENY_TEXT="Prod-brannmur (#1074): skrivende Supabase-kall mot prod-prosjektet er blokkert. DB-endringer går staging først (snwmueecmfqqdurxedxv), verifiseres, DERETTER prod — og prod-steget krever eksplisitt eier-godkjenning i økten. Etter godkjenning: kjør 'touch .claude/approve-prod' og gjenta kallet (engangs, 10 min gyldighet)."

# Alltid-nekt-klassen: verktøy hvis mål ikke kan knyttes til en prosjekt-ref i
# argumentene, så prod-ref-porten under aldri ser dem — merge_branch merger TIL
# prod per definisjon, create_project oppretter nytt (koster penger, org-nivå).
# Vurderes FØR prod-ref-porten. Branch-livssyklus (reset/rebase/delete_branch)
# opererer på egne dev-brancher og er sanksjonert — de passerer porten under.
case "$short" in
  merge_branch|create_project)
    approved && { log_event "prod-$short" "allow-prod-approved" "$short"; exit 0; }
    emit_deny "prod-$short" "$DENY_TEXT $short kan ikke knyttes til en prosjekt-ref i argumentene og nektes derfor alltid uten godkjenning." "$short"
    ;;
esac

# Gjelder ikke prod → slipp gjennom (staging- og branch-prosjekter er sanksjonert).
case "$input" in
  *"$PROD_REF"*) : ;;
  *) exit 0 ;;
esac

# Herfra: kallet nevner prod. Feilet jq-parsing over (tomt tool-navn) er
# uklassifiserbart → fail-closed.
if [ -z "$tool" ]; then
  emit_deny "prod-unparseable" "$DENY_TEXT Klarte ikke å parse verktøykallet (fail-closed)." "unparseable"
fi

prefix="$short project_id=$(printf '%s' "$input" | jq -r '.tool_input.project_id // "?"' 2>/dev/null)"

# Beviselig read-only SQL: starter med SELECT/WITH/EXPLAIN/SHOW, ingen
# skrive-nøkkelord som eget ord, ikke flere statements. Alt annet → deny.
is_readonly_sql() {
  local q="$1"
  [ -z "$q" ] && return 1
  local u
  u="$(printf '%s' "$q" | tr '[:lower:]' '[:upper:]')"
  u="${u#"${u%%[![:space:]]*}"}"
  case "$u" in
    SELECT*|WITH*|EXPLAIN*|SHOW*) : ;;
    *) return 1 ;;
  esac
  printf '%s' "$u" | grep -Eq ';[[:space:]]*[^[:space:]]' && return 1
  printf '%s' "$u" | grep -Eq '(^|[^A-Z_])(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|MERGE|VACUUM|REINDEX|CLUSTER|COMMENT|POLICY|REFRESH|SECURITY|DO)([^A-Z_]|$)' && return 1
  return 0
}

case "$short" in
  execute_sql)
    query="$(printf '%s' "$input" | jq -r '.tool_input.query // empty' 2>/dev/null)"
    if is_readonly_sql "$query"; then
      log_event "prod-sql-readonly" "allow-prod-readonly" "$prefix"
      exit 0
    fi
    approved && { log_event "prod-sql-write" "allow-prod-approved" "$prefix"; exit 0; }
    emit_deny "prod-sql-write" "$DENY_TEXT Read-only SELECT mot prod er lov; denne queryen kunne ikke klassifiseres som read-only." "$prefix"
    ;;
  *)
    approved && { log_event "prod-$short" "allow-prod-approved" "$prefix"; exit 0; }
    emit_deny "prod-$short" "$DENY_TEXT" "$prefix"
    ;;
esac

exit 0
