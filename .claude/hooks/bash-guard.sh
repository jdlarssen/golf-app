#!/usr/bin/env bash
# PreToolUse:Bash-vakt for Tørny.
#
# Håndhever CLAUDE.md-reglene som git-hooks IKKE kan nå: merge-strategi, force-
# push og issue-oppretting skjer server-side eller omgår git-hooks (--no-verify).
# Leser PreToolUse-JSON på stdin, inspiserer kommandoen, og svarer med ÉN
# hookSpecificOutput-JSON på stdout (eller ingenting → verktøyet kjører normalt):
#
#   • DENY   prod-connstring / curl/psql mot prod-Supabase / skrivende supabase-
#            CLI mot prod (#1074) — engangs-luke: touch .claude/approve-prod
#   • DENY   --no-verify         omgår commit-msg/pre-commit/pre-push (forbudt)
#   • DENY   gh pr merge --squash «Squash brukes ikke» → bruk --rebase
#   • ASK    git push --force     krever eksplisitt godkjenning (lease er OK)
#   • REMIND gh issue create uten --milestone (mandatory milestone-regel)
#   • REMIND gh pr create         README-friskhet + Closes #N i body
#
# Workflow-triggerne (--no-verify, --squash, --force) matches mot kommandoen med
# quotede segmenter fjernet, så en PR-body som bare NEVNER en trigger ikke
# nekter (#1074 defekt a). Prod-reglene matcher full kommando — der er ref-en i
# en quotet URL nettopp det vi vil fange; bruk --body-file for prosa som må
# nevne prod-detaljer.
#
# Hver deny/ask/remind logges som én JSONL-linje til .claude/logs/ (#1074).
#
# Testbar frittstående: ekko en PreToolUse-payload inn på stdin og les JSON-en ut.

PROD_REF="glofubopddkjhymcbaph"

cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

# Defekt (a)-fiks: workflow-triggere vurderes uten quotet innhold, så prosa i
# -m/--body-strenger ikke utløser dem. Newlines flates ut først — sed er
# linjebasert, og quotede strenger i commit-/PR-bodies spenner over flere linjer.
# Innholds-sjekker (Closes #, --milestone) og prod-reglene bruker fortsatt $cmd.
cmd_stripped="$(printf '%s' "$cmd" | tr '\n' ' ' | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"

# Logg-prefiks: 80 tegn, med hemmeligheter redaktert FØR trunkering —
# userinfo i URL-er (postgres://user:pw@ → ://***@), verdier etter
# apikey/authorization/password/token, og JWT-lignende eyJ…-strenger.
prefix="$(printf '%s' "$cmd" | tr '\n' ' ' | sed -E \
  -e 's#://[^@[:space:]]+@#://***@#g' \
  -e 's/((apikey|Apikey|APIKEY|authorization|Authorization|AUTHORIZATION|password|Password|PASSWORD|token|Token|TOKEN)[=: ]+)[^[:space:]"]+/\1***/g' \
  -e 's/((bearer|Bearer|BEARER)[ ]+)[^[:space:]"]+/\1***/g' \
  -e 's/eyJ[A-Za-z0-9._-]+/***/g')"
prefix="$(printf '%.80s' "$prefix")"

log_event() { # rule decision
  local dir="${CLAUDE_PROJECT_DIR:-.}/.claude/logs"
  {
    mkdir -p "$dir" && jq -cn \
      --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg hook "bash-guard" --arg rule "$1" --arg decision "$2" --arg prefix "$prefix" \
      '{ts:$ts,hook:$hook,rule:$rule,decision:$decision,prefix:$prefix}' >> "$dir/guard-events.jsonl"
  } 2>/dev/null || true
}

emit_deny() { log_event "$1" "deny"; jq -cn --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
emit_ask()  { log_event "$1" "ask";  jq -cn --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'; exit 0; }
emit_ctx()  { log_event "$1" "remind"; jq -cn --arg c "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'; exit 0; }

# Engangs-godkjenning for prod (speiler mcp-guard.sh): sentinel < 10 min eller env.
# find -mmin har lik semantikk på BSD/macOS og GNU; stat-flaggene divergerer.
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

PROD_DENY_TEXT="Prod-brannmur (#1074): direkte DB-/API-trafikk mot prod-Supabase fra shell er blokkert. Sanksjonerte veier: staging-DB for testing, Supabase MCP get_logs/list_tables for lesing, npm run gen:types for typer. Eier-godkjent prod-operasjon? touch .claude/approve-prod og gjenta (engangs, 10 min)."

# ── DENY: prod-rettet shell-trafikk (#1074). Vurderes som ETT sjekkpunkt slik at
# en kommando som matcher flere mønstre bare konsumerer engangs-godkjenningen én gang. ──
prod_rule=""
prod_extra=""
if printf '%s' "$cmd" | grep -Eq "postgres(ql)?://[^[:space:]]*${PROD_REF}"; then
  # postgres-connstring mot prod — psql read-only kan ikke klassifiseres trygt
  prod_rule="prod-connstring"
elif printf '%s' "$cmd" | grep -Eq "(curl|wget|psql|pg_dump|pg_restore)" && printf '%s' "$cmd" | grep -q "${PROD_REF}\.supabase\.co"; then
  prod_rule="prod-http"
elif printf '%s' "$cmd" | grep -Eq "(^|[[:space:];&|])(npx[[:space:]]+)?supabase[[:space:]]" && printf '%s' "$cmd" | grep -q "$PROD_REF" \
  && ! printf '%s' "$cmd" | grep -Eq "supabase[[:space:]]+(gen|inspect)[[:space:]]"; then
  # supabase-CLI mot prod, unntatt read-only gen/inspect (gen:types er lov)
  prod_rule="prod-supabase-cli"
  prod_extra=" supabase-CLI mot prod er kun lov for 'gen'/'inspect' (read-only)."
fi
if [ -n "$prod_rule" ]; then
  if approved; then
    log_event "$prod_rule" "allow-prod-approved"
  else
    emit_deny "$prod_rule" "$PROD_DENY_TEXT$prod_extra"
  fi
fi

# ── DENY: --no-verify (omgår commit-msg/pre-commit/pre-push) ──
case "$cmd_stripped" in
  *--no-verify*)
    emit_deny "no-verify" "CLAUDE.md forbyr --no-verify: det omgår commit-msg/pre-commit/pre-push-gatene (versjonering, Refs #N, Dexie-vakt, typecheck/lint/test). Fiks årsaken i stedet. Ekte nødssituasjon? La eier kjøre den manuelt." ;;
esac

# ── DENY: gh pr merge --squash (rebase-only) ──
case "$cmd_stripped" in
  *"gh pr merge"*)
    case "$cmd_stripped" in
      *--squash*) emit_deny "squash-merge" "Squash brukes ikke i Tørny (mister granulær audit-trail per commit). Bruk: gh pr merge --rebase --delete-branch. Se CLAUDE.md → «Branch + PR-flyt»." ;;
    esac ;;
esac

# ── ASK: git push --force, men IKKE --force-with-lease (som rebase-flyten bruker) ──
case "$cmd_stripped" in
  *"git push"*)
    stripped="${cmd_stripped//--force-with-lease/}"
    case "$stripped" in
      *--force*|*" -f "*|*" -f")
        emit_ask "force-push" "git push --force krever eksplisitt eier-godkjenning (CLAUDE.md: «Aldri force-push uten god grunn»). --force-with-lease fra rebase-flyten er OK og blokkeres ikke — bekreft at dette er tiltenkt." ;;
    esac ;;
esac

# ── REMIND: gh issue create uten --milestone ──
case "$cmd_stripped" in
  *"gh issue create"*)
    case "$cmd" in
      *--milestone*) : ;;
      *) emit_ctx "issue-milestone" "Mandatory: hvert nytt issue MÅ ha en milestone (CLAUDE.md → «Milestone på alle nye issues»). Legg til --milestone \"<tittel>\", eller default til «Backlog — uplanlagt / scale-triggered» og si fra i svaret. Mojibake-felle: Tier 1/Tier 5-titlene matcher ikke på navn — sett da via nummer: gh api -X PATCH repos/jdlarssen/golf-app/issues/N -F milestone=<num>." ;;
    esac ;;
esac

# ── REMIND: gh pr create — README-friskhet + Closes #N ──
# Defekt (b)-fiks: substring-match (fanger «cd x && gh pr create»), som issue-regelen.
case "$cmd_stripped" in
  *"gh pr create"*)
    closes_note=""
    case "$cmd" in
      *"Closes #"*|*"closes #"*|*--body-file*|*"-F "*) : ;;
      *) closes_note=" Body ser ut til å mangle «Closes #N» — det er den autoritative auto-close-triggeren ved merge." ;;
    esac
    emit_ctx "pr-create" "You are running gh pr create — packaging a branch for review. Run git diff origin/main...HEAD and check whether anything README.md documents has changed: user-facing capabilities (Hva du far), the stack table, the local-dev or test commands, the cited test or migration counts, or the architecture notes (Hvordan det henger sammen). If so: update README.md, run the humanizer skill on any new or changed Norwegian copy (and the no-nb skill if you translated from English) per docs/copy-style.md, then commit and push it so it lands in THIS PR before you create it.${closes_note} Most PRs need no README change; only touch it when one of those documented facts actually changed." ;;
esac

exit 0
