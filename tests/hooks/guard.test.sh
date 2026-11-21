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
# expect_reason_contains:[…] krever at hver streng står i deny-/ask-grunnen eller
# påminnelsesteksten; assert_no_log_rule:"<regel>" krever at fixturen ikke
# skrev noen logglinje for den regelen (falske treff, #1303).
# setup:"approve-prod" oppretter sentinel-filen før kjøring;
# "approve-prod-stale" backdater den forbi 10-minutters-vinduet.
# assert_sentinel_consumed verifiserer engangs-semantikken;
# assert_sentinel_kept at en ren lesing lar godkjenningen stå urørt.
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
unset APPROVE_PROD BASH_GUARD_PR_JSON BASH_GUARD_ISSUE_COMMENTS_JSON 2>/dev/null || true

SENTINEL="$TMP/.claude/approve-prod"
pass=0
fail=0

decide() { # hook-script <<< payload → deny|ask|context|none
  local hook_script="$1" payload="$2" out
  out="$(printf '%s' "$payload" | bash "$hook_script")"
  printf '%s' "$out" > "$TMP/last-out.json"
  if [ -z "$out" ]; then
    printf 'none'
  else
    printf '%s' "$out" | jq -r 'if .hookSpecificOutput.permissionDecision then .hookSpecificOutput.permissionDecision elif .hookSpecificOutput.additionalContext then "context" else "none" end'
  fi
}

run_fixture_file() { # fixtures.json hook-script
  local file="$1" hook_script="$2" count i name expect setup consume kept payload decision ok
  local reason_needles no_log_rule log_before log_after needle reason
  count="$(jq 'length' "$file")"
  i=0
  while [ "$i" -lt "$count" ]; do
    name="$(jq -r ".[$i].name" "$file")"
    expect="$(jq -r ".[$i].expect" "$file")"
    setup="$(jq -r ".[$i].setup // empty" "$file")"
    consume="$(jq -r ".[$i].assert_sentinel_consumed // empty" "$file")"
    kept="$(jq -r ".[$i].assert_sentinel_kept // empty" "$file")"
    payload="$(jq -c ".[$i].payload" "$file")"
    reason_needles="$(jq -r ".[$i].expect_reason_contains // [] | .[]" "$file")"
    no_log_rule="$(jq -r ".[$i].assert_no_log_rule // empty" "$file")"

    case "$setup" in
      approve-prod)
        mkdir -p "$TMP/.claude" && touch "$SENTINEL" ;;
      approve-prod-stale)
        mkdir -p "$TMP/.claude" && touch -t 202001010000 "$SENTINEL" ;;
      # #1907: stubber issue-trådens kommentarer for gh-issue-comment-regelen, så
      # fixturen aldri går på nett. «exists» = én kontrakt- og én leveranse-
      # kommentar med ## Teknisk; «none» = kun en kontraktkommentar.
      closing-comment-exists)
        printf '%s' '[{"id":1,"body":"## 📋 Forge-kontrakt tilgjengelig\n\n<details>…</details>"},{"id":2,"body":"Bygget på PR #9 — venter på merge.\n\n## Teknisk\n\nx\n\n## Funksjonell\n\ny"}]' > "$TMP/issue-comments.json"
        export BASH_GUARD_ISSUE_COMMENTS_JSON="$TMP/issue-comments.json" ;;
      closing-comment-none)
        printf '%s' '[{"id":1,"body":"## 📋 Forge-kontrakt tilgjengelig\n\n<details>…</details>"}]' > "$TMP/issue-comments.json"
        export BASH_GUARD_ISSUE_COMMENTS_JSON="$TMP/issue-comments.json" ;;
      # Falsk positiv funnet i null-testen mot #1884: kontrakten NEVNER
      # «`## Teknisk`» i en PR-regel-setning uten å være en closing-kommentar.
      closing-comment-inline-mention)
        printf '%s' '[{"id":1,"body":"## 📋 Forge-kontrakt tilgjengelig\n\n- Closing-kommentar etter merge: `## Teknisk` (inkl. avvik) + `## Funksjonell`."}]' > "$TMP/issue-comments.json"
        export BASH_GUARD_ISSUE_COMMENTS_JSON="$TMP/issue-comments.json" ;;
      # #1303: stubber `gh pr view --json number,labels,commits` for merge-sperren.
      pr-visible-unlabeled)
        printf '%s' '{"number":5,"labels":[],"commits":[{"messageHeadline":"docs: x","messageBody":"Refs #5"},{"messageHeadline":"fix(cup): fail closed","messageBody":"Refs #5"}]}' > "$TMP/pr.json"
        export BASH_GUARD_PR_JSON="$TMP/pr.json" ;;
      pr-visible-staging-verified)
        printf '%s' '{"number":5,"labels":[{"name":"staging-verified"}],"commits":[{"messageHeadline":"fix(cup): fail closed","messageBody":"Refs #5"}]}' > "$TMP/pr.json"
        export BASH_GUARD_PR_JSON="$TMP/pr.json" ;;
      pr-visible-needs-manual-qa)
        printf '%s' '{"number":5,"labels":[{"name":"autonomy:review"},{"name":"needs-manual-qa"}],"commits":[{"messageHeadline":"feat(native)!: x","messageBody":"Refs #5"}]}' > "$TMP/pr.json"
        export BASH_GUARD_PR_JSON="$TMP/pr.json" ;;
      pr-internal-only)
        printf '%s' '{"number":5,"labels":[],"commits":[{"messageHeadline":"docs(x): a","messageBody":""},{"messageHeadline":"chore: b","messageBody":""},{"messageHeadline":"refactor(y): c","messageBody":""},{"messageHeadline":"test: d","messageBody":""},{"messageHeadline":"prefix fix: not a prefix","messageBody":""}]}' > "$TMP/pr.json"
        export BASH_GUARD_PR_JSON="$TMP/pr.json" ;;
      pr-fix-no-changelog)
        printf '%s' '{"number":5,"labels":[],"commits":[{"messageHeadline":"fix(hooks): x","messageBody":"[no-changelog]\n\nRefs #5"},{"messageHeadline":"test(hooks): y","messageBody":""}]}' > "$TMP/pr.json"
        export BASH_GUARD_PR_JSON="$TMP/pr.json" ;;
      pr-invalid-json)
        printf '%s' '{"number":5,"labels":[' > "$TMP/pr.json"
        export BASH_GUARD_PR_JSON="$TMP/pr.json" ;;
      pr-lookup-fails)
        rm -f "$TMP/pr-missing.json"
        export BASH_GUARD_PR_JSON="$TMP/pr-missing.json" ;;
    esac

    log_before="$(grep -c "\"rule\":\"${no_log_rule:-__none__}\"" "$TMP/.claude/logs/guard-events.jsonl" 2>/dev/null || true)"

    decision="$(decide "$hook_script" "$payload")"
    unset BASH_GUARD_ISSUE_COMMENTS_JSON BASH_GUARD_PR_JSON

    ok=1
    [ "$decision" = "$expect" ] || ok=0
    if [ "$consume" = "true" ] && [ -f "$SENTINEL" ]; then
      ok=0
      decision="$decision (sentinel ikke konsumert)"
    fi
    if [ "$kept" = "true" ] && [ ! -f "$SENTINEL" ]; then
      ok=0
      decision="$decision (sentinel brukt opp av en lesing)"
    fi
    rm -f "$SENTINEL"

    if [ -n "$reason_needles" ]; then
      reason="$(jq -r '.hookSpecificOutput | (.permissionDecisionReason // .additionalContext // "")' "$TMP/last-out.json" 2>/dev/null)"
      while IFS= read -r needle; do
        case "$reason" in
          *"$needle"*) : ;;
          *) ok=0; decision="$decision (grunnen mangler «$needle»)" ;;
        esac
      done <<< "$reason_needles"
    fi
    if [ -n "$no_log_rule" ]; then
      log_after="$(grep -c "\"rule\":\"${no_log_rule}\"" "$TMP/.claude/logs/guard-events.jsonl" 2>/dev/null || true)"
      if [ "${log_after:-0}" != "${log_before:-0}" ]; then
        ok=0
        decision="$decision (skrev $no_log_rule-hendelse)"
      fi
    fi

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

# Matcher-bevis (p09): prod-vakta klassifiserer selv, så settings.json må sende
# ALLE MCP-verktøy til den — også verktøy som ikke fantes da lista ble skrevet.
echo "== settings.json-matcher =="
MCP_MATCHER="$(jq -r '.hooks.PreToolUse[] | select(.hooks[].command | contains("mcp-guard.sh")) | .matcher' "$ROOT/.claude/settings.json")"
for tool_name in mcp__supabase__execute_sql mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration \
  mcp__supabase__run_notebook mcp__supabase__create_notebook mcp__supabase__merge_branch mcp__x__some_future_tool; do
  if [ -n "$MCP_MATCHER" ] && printf '%s' "$tool_name" | grep -Eq "$MCP_MATCHER"; then
    pass=$((pass + 1))
    printf 'PASS  matcher treffer %s\n' "$tool_name"
  else
    fail=$((fail + 1))
    printf 'FAIL  matcher «%s» treffer ikke %s\n' "$MCP_MATCHER" "$tool_name"
  fi
done

# Discord-kort-jobben (p09): jobben sjekker ut PR-ens kode og kjører den med
# hemmeligheter. Porten i første steg skal bare slippe gjennom kode som ligger i
# dette repoet. Skriptet klippes ut av workflow-fila og kjøres med en gh-stubb.
echo "== discord-pr-card: bare kode fra dette repoet =="
CARD_WF="$ROOT/.github/workflows/discord-pr-card.yml"
TRUST_SH="$TMP/pr-head-trust.sh"
awk '/# pr-head-trust:start/{on=1; next} /# pr-head-trust:end/{on=0} on' "$CARD_WF" | sed -E 's/^          //' > "$TRUST_SH"
mkdir -p "$TMP/bin"
printf '#!/bin/sh\nprintf "%%s" "$FAKE_PR_HEAD_REPO"\n[ -n "$FAKE_GH_FAIL" ] && exit 1\nexit 0\n' > "$TMP/bin/gh"
chmod +x "$TMP/bin/gh"
trust_case() { # navn forventet(run=true|run=false) VAR=verdi…
  local name="$1" want="$2" got
  shift 2
  : > "$TMP/gh-output"
  env -i PATH="$TMP/bin:$PATH" GITHUB_OUTPUT="$TMP/gh-output" GITHUB_REPOSITORY="jdlarssen/golf-app" \
    BOT=b CHANNEL=c "$@" bash "$TRUST_SH" > /dev/null 2>&1
  got="$(tail -n 1 "$TMP/gh-output")"
  if [ -s "$TRUST_SH" ] && [ "$got" = "$want" ]; then
    pass=$((pass + 1)); printf 'PASS  %s\n' "$name"
  else
    fail=$((fail + 1)); printf 'FAIL  %s\n      forventet %s, fikk %s\n' "$name" "$want" "${got:-<tomt>}"
  fi
}
trust_case "CI-fullført, kode fra dette repoet → kjører" "run=true" EVENT_NAME=workflow_run RUN_HEAD_REPO=jdlarssen/golf-app
trust_case "CI-fullført, kode fra en fork → kjører ikke" "run=false" EVENT_NAME=workflow_run RUN_HEAD_REPO=fremmed/golf-app
trust_case "CI-fullført, ukjent opphav → kjører ikke (fail-closed)" "run=false" EVENT_NAME=workflow_run
trust_case "ready-flipp, kode fra dette repoet → kjører" "run=true" EVENT_NAME=pull_request PR_HEAD_REPO=jdlarssen/golf-app
trust_case "ready-flipp, kode fra en fork → kjører ikke" "run=false" EVENT_NAME=pull_request PR_HEAD_REPO=fremmed/golf-app
trust_case "manuell kjøring, PR fra dette repoet → kjører" "run=true" EVENT_NAME=workflow_dispatch PR_INPUT=12 FAKE_PR_HEAD_REPO=jdlarssen/golf-app
trust_case "manuell kjøring, PR fra en fork → kjører ikke" "run=false" EVENT_NAME=workflow_dispatch PR_INPUT=12 FAKE_PR_HEAD_REPO=fremmed/golf-app
trust_case "manuell kjøring, oppslaget feiler → kjører ikke (fail-closed)" "run=false" EVENT_NAME=workflow_dispatch PR_INPUT=12 FAKE_GH_FAIL=1
trust_case "manuell kjøring, PR-nummer som ikke er et tall → kjører ikke" "run=false" EVENT_NAME=workflow_dispatch PR_INPUT="12/../x" FAKE_PR_HEAD_REPO=jdlarssen/golf-app
trust_case "ukjent hendelse → kjører ikke" "run=false" EVENT_NAME=push RUN_HEAD_REPO=jdlarssen/golf-app
trust_case "boten er ikke satt opp → kjører ikke" "run=false" EVENT_NAME=workflow_run RUN_HEAD_REPO=jdlarssen/golf-app BOT=
# Hvert steg etter porten (unntatt feilalarmen) må ha porten i sin if-linje —
# ellers kjører et nytt steg selv om porten sa nei.
steps_total="$(grep -c '^      - name:' "$CARD_WF")"
steps_gated="$(grep -c "if: steps.guard.outputs.run == 'true'" "$CARD_WF")"
if [ "$steps_total" -gt 2 ] && [ "$steps_gated" -eq $((steps_total - 2)) ]; then
  pass=$((pass + 1)); printf 'PASS  alle %s steg etter porten er portet\n' "$steps_gated"
else
  fail=$((fail + 1)); printf 'FAIL  %s steg, %s med porten (forventet alle unntatt porten selv og feilalarmen)\n' "$steps_total" "$steps_gated"
fi

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
