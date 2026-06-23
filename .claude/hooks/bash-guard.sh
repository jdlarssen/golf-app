#!/usr/bin/env bash
# PreToolUse:Bash-vakt for Tørny.
#
# Håndhever CLAUDE.md-reglene som git-hooks IKKE kan nå: merge-strategi, force-
# push og issue-oppretting skjer server-side eller omgår git-hooks (--no-verify).
# Leser PreToolUse-JSON på stdin, inspiserer kommandoen, og svarer med ÉN
# hookSpecificOutput-JSON på stdout (eller ingenting → verktøyet kjører normalt):
#
#   • DENY   --no-verify         omgår commit-msg/pre-commit/pre-push (forbudt)
#   • DENY   gh pr merge --squash «Squash brukes ikke» → bruk --rebase
#   • ASK    git push --force     krever eksplisitt godkjenning (lease er OK)
#   • REMIND gh issue create uten --milestone (mandatory milestone-regel)
#   • REMIND gh pr create         README-friskhet + Closes #N i body
#
# Testbar frittstående: ekko en PreToolUse-payload inn på stdin og les JSON-en ut.

cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

emit_deny() { jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
emit_ask()  { jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'; exit 0; }
emit_ctx()  { jq -cn --arg c "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'; exit 0; }

# ── DENY: --no-verify (omgår commit-msg/pre-commit/pre-push) ──
case "$cmd" in
  *--no-verify*)
    emit_deny "CLAUDE.md forbyr --no-verify: det omgår commit-msg/pre-commit/pre-push-gatene (versjonering, Refs #N, Dexie-vakt, typecheck/lint/test). Fiks årsaken i stedet. Ekte nødssituasjon? La eier kjøre den manuelt." ;;
esac

# ── DENY: gh pr merge --squash (rebase-only) ──
case "$cmd" in
  *"gh pr merge"*)
    case "$cmd" in
      *--squash*) emit_deny "Squash brukes ikke i Tørny (mister granulær audit-trail per commit). Bruk: gh pr merge --rebase --delete-branch. Se CLAUDE.md → «Branch + PR-flyt»." ;;
    esac ;;
esac

# ── ASK: git push --force, men IKKE --force-with-lease (som rebase-flyten bruker) ──
case "$cmd" in
  *"git push"*)
    stripped="${cmd//--force-with-lease/}"
    case "$stripped" in
      *--force*|*" -f "*|*" -f")
        emit_ask "git push --force krever eksplisitt eier-godkjenning (CLAUDE.md: «Aldri force-push uten god grunn»). --force-with-lease fra rebase-flyten er OK og blokkeres ikke — bekreft at dette er tiltenkt." ;;
    esac ;;
esac

# ── REMIND: gh issue create uten --milestone ──
case "$cmd" in
  *"gh issue create"*)
    case "$cmd" in
      *--milestone*) : ;;
      *) emit_ctx "Mandatory: hvert nytt issue MÅ ha en milestone (CLAUDE.md → «Milestone på alle nye issues»). Legg til --milestone \"<tittel>\", eller default til «Backlog — uplanlagt / scale-triggered» og si fra i svaret. Mojibake-felle: Tier 1/Tier 5-titlene matcher ikke på navn — sett da via nummer: gh api -X PATCH repos/jdlarssen/golf-app/issues/N -F milestone=<num>." ;;
    esac ;;
esac

# ── REMIND: gh pr create — README-friskhet + Closes #N ──
case "$cmd" in
  "gh pr create"*)
    closes_note=""
    case "$cmd" in
      *"Closes #"*|*"closes #"*) : ;;
      *) closes_note=" Body ser ut til å mangle «Closes #N» — det er den autoritative auto-close-triggeren ved merge." ;;
    esac
    emit_ctx "You are running gh pr create — packaging a branch for review. Run git diff origin/main...HEAD and check whether anything README.md documents has changed: user-facing capabilities (Hva du far), the stack table, the local-dev or test commands, the cited test or migration counts, or the architecture notes (Hvordan det henger sammen). If so: update README.md, run the humanizer skill on any new or changed Norwegian copy (and the no-nb skill if you translated from English) per docs/copy-style.md, then commit and push it so it lands in THIS PR before you create it.${closes_note} Most PRs need no README change; only touch it when one of those documented facts actually changed." ;;
esac

exit 0
