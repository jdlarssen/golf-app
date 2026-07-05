#!/usr/bin/env bash
# Fixture-harness for guard-hookene (#1074): .claude/hooks/bash-guard.sh og
# .claude/hooks/mcp-guard.sh.
#
# Kjør: bash tests/hooks/guard.test.sh
#
# Hver fixture i tests/hooks/fixtures/{bash,mcp}.json piper sin payload inn i
# riktig hook-skript med CLAUDE_PROJECT_DIR pekt på en temp-katalog (loggen
# lander der, aldri i repoet) og sammenligner beslutningen mot expect:
#   deny | ask | context | none
# setup:"approve-prod" oppretter sentinel-filen før kjøring;
# "approve-prod-stale" backdater den forbi 10-minutters-vinduet.
# assert_sentinel_consumed verifiserer engangs-semantikken.
#
# Etter fixture-runden bevises i tillegg:
#   1. Vaktloggen finnes, har linjer, og hver linje er gyldig JSON.
#   2. Non-blocking logging: skrivebeskyttet loggkatalog endrer ikke beslutningen.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXDIR="$ROOT/tests/hooks/fixtures"
TMP="$(mktemp -d)"
trap 'chmod -R u+w "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT

export CLAUDE_PROJECT_DIR="$TMP"
unset APPROVE_PROD 2>/dev/null || true

SENTINEL="$TMP/.claude/approve-prod"
pass=0
fail=0

decide() { # hook-script <<< payload → deny|ask|context|none
  local hook_script="$1" payload="$2" out
  out="$(printf '%s' "$payload" | bash "$hook_script")"
  if [ -z "$out" ]; then
    printf 'none'
  else
    printf '%s' "$out" | jq -r 'if .hookSpecificOutput.permissionDecision then .hookSpecificOutput.permissionDecision elif .hookSpecificOutput.additionalContext then "context" else "none" end'
  fi
}

run_fixture_file() { # fixtures.json hook-script
  local file="$1" hook_script="$2" count i name expect setup consume payload decision ok
  count="$(jq 'length' "$file")"
  i=0
  while [ "$i" -lt "$count" ]; do
    name="$(jq -r ".[$i].name" "$file")"
    expect="$(jq -r ".[$i].expect" "$file")"
    setup="$(jq -r ".[$i].setup // empty" "$file")"
    consume="$(jq -r ".[$i].assert_sentinel_consumed // empty" "$file")"
    payload="$(jq -c ".[$i].payload" "$file")"

    case "$setup" in
      approve-prod)
        mkdir -p "$TMP/.claude" && touch "$SENTINEL" ;;
      approve-prod-stale)
        mkdir -p "$TMP/.claude" && touch -t 202001010000 "$SENTINEL" ;;
    esac

    decision="$(decide "$hook_script" "$payload")"

    ok=1
    [ "$decision" = "$expect" ] || ok=0
    if [ "$consume" = "true" ] && [ -f "$SENTINEL" ]; then
      ok=0
      decision="$decision (sentinel ikke konsumert)"
    fi
    rm -f "$SENTINEL"

    if [ "$ok" -eq 1 ]; then
      pass=$((pass + 1))
      printf 'PASS  %s\n' "$name"
    else
      fail=$((fail + 1))
      printf 'FAIL  %s\n      forventet %s, fikk %s\n' "$name" "$expect" "$decision"
    fi
    i=$((i + 1))
  done
}

echo "== bash-guard fixtures =="
run_fixture_file "$FIXDIR/bash.json" "$ROOT/.claude/hooks/bash-guard.sh"
echo "== mcp-guard fixtures =="
run_fixture_file "$FIXDIR/mcp.json" "$ROOT/.claude/hooks/mcp-guard.sh"

echo "== vaktlogg =="
LOG="$TMP/.claude/logs/guard-events.jsonl"
if [ -s "$LOG" ] && jq -es 'length > 0' "$LOG" > /dev/null 2>&1; then
  pass=$((pass + 1))
  printf 'PASS  loggen har %s gyldige JSONL-linjer\n' "$(wc -l < "$LOG" | tr -d ' ')"
else
  fail=$((fail + 1))
  echo "FAIL  vaktloggen mangler, er tom eller har ugyldig JSON"
fi

# Redaksjons-bevis: fixture-hemmelighetene (connstring-passord, apikey-verdi)
# skal ALDRI nå loggen — prefiksen redakteres før trunkering.
if grep -q "hemmeligpw123\|hemmeligkey456" "$LOG"; then
  fail=$((fail + 1))
  echo "FAIL  hemmelighet fra fixture lekket til vaktloggen"
else
  pass=$((pass + 1))
  echo "PASS  fixture-hemmeligheter er redaktert bort fra loggen"
fi

# Non-blocking-bevis: gjør loggkatalogen skrivebeskyttet og gjenta en kjent
# deny-fixture — beslutningen skal være uendret selv om logging feiler.
chmod 555 "$TMP/.claude/logs"
readonly_decision="$(decide "$ROOT/.claude/hooks/mcp-guard.sh" "$(jq -c '.[] | select(.name | startswith("apply_migration mot prod")) | .payload' "$FIXDIR/mcp.json")")"
chmod 755 "$TMP/.claude/logs"
if [ "$readonly_decision" = "deny" ]; then
  pass=$((pass + 1))
  echo "PASS  skrivebeskyttet loggkatalog endrer ikke beslutningen (non-blocking)"
else
  fail=$((fail + 1))
  printf 'FAIL  non-blocking-bevis: forventet deny, fikk %s\n' "$readonly_decision"
fi

echo
printf '%s bestått, %s feilet\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
