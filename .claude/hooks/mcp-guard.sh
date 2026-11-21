#!/usr/bin/env bash
# PreToolUse-vakt for Supabase-MCP-verktøy — Tørny prod-brannmur (#1074).
#
# Matcher i settings.json sender ALLE MCP-kall hit (`^mcp__`). Kall som ikke
# nevner prod-ref-en avsluttes før jq startes, så andre verktøy merker ingenting.
# Leser PreToolUse-JSON på stdin og svarer med hookSpecificOutput-JSON på stdout
# (eller ingenting → normal permission-flyt):
#
#   • DENY   skrivende kall mot prod (glofubopddkjhymcbaph) uten godkjenning
#   • DENY   merge_branch/create_project alltid uten godkjenning
#   • DENY   ethvert verktøy som har prod som prosjekt og ikke står på lista over
#            kjente leseverktøy (standard er nei — nye verktøy må inn på lista)
#   • PASS   execute_sql mot prod som er beviselig read-only — logges. Beviset:
#            starter med SELECT/WITH/EXPLAIN/SHOW, ett statement, ingen
#            skriveord i selve SQL-en, og hvert funksjonskall står på lista over
#            kjente lesefunksjoner (en funksjon kan skrive, så ukjent = skriv).
#            Tekst i enkle anførselstegn regnes ikke som SQL når spørringen er
#            enkel nok til at grensene er sikre (ingen ", \, $, -- eller /*).
#   • PASS   alt mot staging/branch-prosjekter (prod-ref finnes ikke i kallet)
#
# Godkjennings-luke (engangs): eier godkjenner eksplisitt i økten →
# `touch .claude/approve-prod` → neste prod-skriv slipper gjennom og filen
# slettes. Filer eldre enn 10 min ignoreres. APPROVE_PROD=1 i hook-miljøet
# (eier-startet terminal-økt) honoreres også. En beviselig lesing rører aldri
# godkjenningen.
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
# Alders-sjekken bruker find -mmin, som har LIK semantikk på BSD/macOS og GNU —
# stat-flaggene divergerer (GNU -f = filsystem-status, ikke mtime).
approved() {
  [ "${APPROVE_PROD:-}" = "1" ] && return 0
  local f="${CLAUDE_PROJECT_DIR:-.}/.claude/approve-prod"
  [ -f "$f" ] || return 1
  if [ -n "$(find "$f" -mmin -10 2>/dev/null)" ]; then
    rm -f "$f"
    return 0
  fi
  return 1
}

# Billig utgang før jq: kallet nevner ikke prod og er ikke i alltid-nekt-klassen.
case "$input" in
  *"$PROD_REF"*|*'__merge_branch"'*|*'__create_project"'*) : ;;
  *) exit 0 ;;
esac

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

# Verktøy som bare leser. Alt annet med prod som prosjekt nektes uten godkjenning.
READ_TOOLS=" list_tables list_extensions list_migrations get_advisors get_logs query_logs get_project get_project_url get_publishable_keys get_anon_key generate_typescript_types list_edge_functions get_edge_function list_branches list_notebooks get_notebook get_cost search_docs list_projects list_organizations get_organization "

# Ord som kan stå rett foran en parentes i en ren lesing: SQL-syntaks, typer og
# kjente lesefunksjoner. En funksjon som ikke står her, kan skrive (egne
# funksjoner, setval, set_config, dblink, query_to_xml …) → ikke beviselig lesing.
SAFE_BEFORE_PAREN=" SELECT FROM WHERE AND OR NOT IN EXISTS ANY ALL SOME AS ON USING JOIN LATERAL UNION INTERSECT EXCEPT HAVING BY WHEN THEN ELSE CASE OVER FILTER GROUP VALUES ARRAY ROW DISTINCT LIMIT OFFSET BETWEEN LIKE ILIKE IS WITH EXPLAIN MATERIALIZED INTERVAL \
 NUMERIC DECIMAL VARCHAR CHAR TIMESTAMP TIMESTAMPTZ TIME FLOAT BIT \
 COALESCE NULLIF GREATEST LEAST CAST EXTRACT POSITION SUBSTRING TRIM OVERLAY NUM_NONNULLS NUM_NULLS ISFINITE \
 COUNT SUM AVG MIN MAX BOOL_AND BOOL_OR EVERY STDDEV STDDEV_POP STDDEV_SAMP VARIANCE VAR_POP VAR_SAMP PERCENTILE_CONT PERCENTILE_DISC MODE CORR \
 ROW_NUMBER RANK DENSE_RANK PERCENT_RANK CUME_DIST NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE \
 LOWER UPPER LENGTH CHAR_LENGTH OCTET_LENGTH SUBSTR LEFT RIGHT BTRIM LTRIM RTRIM REPLACE TRANSLATE SPLIT_PART CONCAT CONCAT_WS FORMAT STRPOS STARTS_WITH INITCAP LPAD RPAD REPEAT REVERSE QUOTE_IDENT QUOTE_LITERAL QUOTE_NULLABLE STRING_AGG MD5 ENCODE DECODE CHR ASCII \
 REGEXP_REPLACE REGEXP_MATCH REGEXP_MATCHES REGEXP_SPLIT_TO_TABLE REGEXP_SPLIT_TO_ARRAY REGEXP_COUNT REGEXP_LIKE \
 NOW CLOCK_TIMESTAMP STATEMENT_TIMESTAMP TRANSACTION_TIMESTAMP DATE_TRUNC DATE_PART AGE TO_CHAR TO_DATE TO_TIMESTAMP TO_NUMBER MAKE_DATE MAKE_TIMESTAMPTZ MAKE_INTERVAL DATE TIMEZONE \
 ROUND TRUNC FLOOR CEIL CEILING ABS MOD POWER SQRT SIGN LN LOG EXP DIV WIDTH_BUCKET RANDOM GEN_RANDOM_UUID \
 ARRAY_AGG ARRAY_LENGTH CARDINALITY UNNEST ARRAY_POSITION ARRAY_REMOVE ARRAY_APPEND ARRAY_CAT ARRAY_UPPER ARRAY_LOWER ARRAY_TO_STRING STRING_TO_ARRAY GENERATE_SERIES \
 JSON_AGG JSONB_AGG JSON_OBJECT_AGG JSONB_OBJECT_AGG JSON_BUILD_OBJECT JSONB_BUILD_OBJECT JSON_BUILD_ARRAY JSONB_BUILD_ARRAY JSONB_ARRAY_ELEMENTS JSONB_ARRAY_ELEMENTS_TEXT JSON_ARRAY_ELEMENTS JSON_ARRAY_ELEMENTS_TEXT JSONB_OBJECT_KEYS JSON_OBJECT_KEYS JSONB_EACH JSONB_EACH_TEXT JSONB_TYPEOF JSON_TYPEOF JSONB_ARRAY_LENGTH JSON_ARRAY_LENGTH JSONB_EXTRACT_PATH JSONB_EXTRACT_PATH_TEXT JSONB_STRIP_NULLS JSONB_PRETTY JSONB_SET JSONB_PATH_QUERY JSONB_PATH_QUERY_ARRAY JSONB_PATH_EXISTS TO_JSON TO_JSONB ROW_TO_JSON \
 PG_GET_FUNCTIONDEF PG_GET_VIEWDEF PG_GET_TRIGGERDEF PG_GET_CONSTRAINTDEF PG_GET_INDEXDEF PG_GET_EXPR PG_GET_FUNCTION_IDENTITY_ARGUMENTS PG_GET_FUNCTION_ARGUMENTS PG_GET_FUNCTION_RESULT PG_GET_USERBYID PG_GET_SERIAL_SEQUENCE PG_TABLE_IS_VISIBLE PG_TYPEOF PG_COLUMN_SIZE PG_SIZE_PRETTY PG_TOTAL_RELATION_SIZE PG_RELATION_SIZE PG_TABLE_SIZE PG_INDEXES_SIZE PG_DATABASE_SIZE OBJ_DESCRIPTION COL_DESCRIPTION FORMAT_TYPE TO_REGCLASS CURRENT_SETTING VERSION HAS_TABLE_PRIVILEGE HAS_SCHEMA_PRIVILEGE HAS_FUNCTION_PRIVILEGE HAS_COLUMN_PRIVILEGE "

# Beviselig read-only SQL. Setter ro_reason når beviset ikke holder.
#
# 1. Starter med SELECT/WITH/EXPLAIN/SHOW.
# 2. Tekst i enkle anførselstegn tas ut av det som leses som SQL — men bare når
#    grensene er sikre: spørringen har ingen ", \, $, -- eller /*, og hver
#    apostrof har en makker ('' er en apostrof inni teksten). Ellers leses hele
#    spørringen som SQL, slik vakta gjorde før (strengere, aldri slappere).
# 3. Ett statement, ingen skriveord som eget ord, ingen kommentarer, og hvert
#    ord rett foran en parentes står i SAFE_BEFORE_PAREN.
# LC_ALL=C: byte for byte, så tegn utenfor ASCII aldri leses som mellomrom
# eller bokstaver i et nøkkelord.
ro_reason=""
is_readonly_sql() {
  local q="$1" u scan tokens t
  ro_reason="spørringen er tom"
  [ -z "$q" ] && return 1
  u="$(printf '%s' "$q" | LC_ALL=C tr '[:lower:]' '[:upper:]' | LC_ALL=C tr '\n\r\t' '   ')"
  u="${u#"${u%%[! ]*}"}"
  ro_reason="spørringen starter ikke med SELECT, WITH, EXPLAIN eller SHOW"
  case "$u" in
    SELECT*|WITH*|EXPLAIN*|SHOW*) : ;;
    *) return 1 ;;
  esac
  scan="$u"
  case "$u" in
    *'"'*|*'\'*|*'$'*|*'--'*|*'/*'*) : ;;
    *"'"*)
      scan="$(printf '%s' "$u" | LC_ALL=C sed -E "s/'([^']|'')*'/ 0 /g")"
      ro_reason="en tekststreng i spørringen lukkes ikke"
      case "$scan" in *"'"*) return 1 ;; esac
      ;;
  esac
  ro_reason="spørringen har kommentarer (-- eller /*); ta dem ut"
  case "$scan" in *'--'*|*'/*'*) return 1 ;; esac
  ro_reason="spørringen har flere statements"
  printf '%s' "$scan" | LC_ALL=C grep -Eq ';[[:space:]]*[^[:space:]]' && return 1
  ro_reason="spørringen har et skriveord (INSERT, UPDATE, DELETE, INTO, DDL …) utenfor tekststrenger"
  printf '%s' "$scan" | LC_ALL=C grep -Eq '(^|[^A-Z_])(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|MERGE|VACUUM|REINDEX|CLUSTER|COMMENT|POLICY|REFRESH|SECURITY|DO|INTO|LOCK|NOTIFY|LISTEN|PREPARE|EXECUTE)([^A-Z_]|$)' && return 1
  ro_reason="et navn i doble anførselstegn står foran en parentes (kan være et funksjonskall)"
  printf '%s' "$scan" | LC_ALL=C grep -Eq '"[[:space:]]*\(' && return 1
  tokens="$(printf '%s' "$scan" | LC_ALL=C sed -E 's/[[:space:]]+\(/(/g' \
    | LC_ALL=C grep -oE '[^][:space:](),=<>+*/|!~%^&:;[-]*\(' | LC_ALL=C sort -u)"
  while IFS= read -r t; do
    t="${t%\(}"
    [ -z "$t" ] && continue
    case "$SAFE_BEFORE_PAREN" in
      *" $t "*) : ;;
      *) ro_reason="funksjonskallet «$(printf '%.60s' "$t")» står ikke på lista over kjente lesefunksjoner (en funksjon kan skrive)"; return 1 ;;
    esac
  done <<TOKENS
$tokens
TOKENS
  ro_reason=""
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
    emit_deny "prod-sql-write" "$DENY_TEXT Read-only SELECT mot prod er lov; denne queryen kunne ikke klassifiseres som read-only: $ro_reason. Er det en ren lesing, skriv den om og prøv igjen — en lesing som ikke kan bevises, bruker opp godkjenningen." "$prefix"
    ;;
  apply_migration|deploy_edge_function|create_branch|delete_branch|reset_branch|rebase_branch|pause_project|restore_project)
    approved && { log_event "prod-$short" "allow-prod-approved" "$prefix"; exit 0; }
    emit_deny "prod-$short" "$DENY_TEXT" "$prefix"
    ;;
  *)
    # Alle andre verktøy: gjelder bare når prod ER prosjektet (et argument er
    # nøyaktig ref-en) — tekst som bare nevner ref-en (en issue-kommentar, en
    # URL i nettleseren) er ikke et prod-kall.
    targets_prod="$(printf '%s' "$input" | jq -r --arg ref "$PROD_REF" '[.tool_input[]? | strings] | any(. == $ref)' 2>/dev/null)"
    [ "$targets_prod" = "false" ] && exit 0
    case "$READ_TOOLS" in *" $short "*) exit 0 ;; esac
    approved && { log_event "prod-$short" "allow-prod-approved" "$prefix"; exit 0; }
    emit_deny "prod-unknown-tool" "$DENY_TEXT Verktøyet $short står ikke på lista over kjente leseverktøy (READ_TOOLS i .claude/hooks/mcp-guard.sh), og prod er prosjektet i kallet." "$prefix"
    ;;
esac

exit 0
