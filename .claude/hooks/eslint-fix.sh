#!/usr/bin/env bash
# PostToolUse-hook (Edit/Write/MultiEdit): kjør `eslint --fix` på fila som nettopp
# ble endret, så mekaniske feil rettes med én gang i stedet for å dukke opp på
# pre-push eller i review (= dyr rework).
#
# Token-lett med vilje: auto-fiks skjer STILLE. Vi sender bare noe tilbake til
# agenten når eslint fortsatt rapporterer problemer som IKKE kunne auto-fikses —
# rene redigeringer koster ~null ekstra kontekst.
#
# Scope: kun .ts/.tsx UNDER prosjektroten. Alt annet (.md, .sh, .json, /tmp) = no-op.
# Bevisst billig: én fil, eslint kun. Ingen tsc (for treg/token-tung per redigering).

f="$(jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -z "$f" ] && exit 0

case "$f" in
  *.ts|*.tsx) : ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in
  "$root"/*) : ;;
  *) exit 0 ;;   # utenfor prosjektet (f.eks. /tmp) — ikke rør
esac
[ -f "$f" ] || exit 0

bin="$root/node_modules/.bin/eslint"
[ -x "$bin" ] || exit 0   # ingen lokal eslint → stille no-op (ikke blokker arbeid)

cd "$root" || exit 0
out="$("$bin" --fix "$f" 2>&1)"
[ $? -eq 0 ] && exit 0     # rent (eller alt auto-fikset) → si ingenting

# Gjenstående, ikke-auto-fiksbare problemer → overflat til agenten.
jq -cn --arg o "$out" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:("eslint --fix kjørte på den endrede fila, men noen problemer gjenstår (ikke auto-fiksbare) — rett dem:\n" + $o)}}'
exit 0
