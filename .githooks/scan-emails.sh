#!/usr/bin/env bash
# Finner e-postadresser som ikke står på allowlista (#1929).
#
# Leser tekst på stdin, skriver én ikke-allowlistet adresse per linje på stdout,
# og avslutter 1 hvis den fant noe (0 hvis rent). Kalles av
# .claude/hooks/bash-guard.sh og .githooks/pre-commit, så regelen har ett hjem.
#
# Frittstående testbar:  printf 'noen@example.com\n' | .githooks/scan-emails.sh
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
allow="$root/.githooks/email-allowlist.txt"

# Fail-open BARE hvis lista mangler helt: en hook som kræsjer er verre enn en
# som slipper gjennom, og manglende liste er en rigg-feil, ikke en lekkasje.
[ -f "$allow" ] || exit 0

# Adresse-formen holdes bevisst litt løs — heller ett falskt treff (som kan
# allowlistes) enn en ekte adresse som glipper.
found="$(grep -oiE '[[:alnum:]._%+-]+@[[:alnum:]-]+(\.[[:alnum:]-]+)+' || true)"
[ -z "$found" ] && exit 0

# Bygg ett samlet ERE-alternativ av allowlista, så vi slipper en loop per treff.
pattern="$(grep -vE '^\s*(#|$)' "$allow" | paste -sd '|' -)"

if [ -n "$pattern" ]; then
  leaks="$(printf '%s\n' "$found" | sort -u | grep -viE "$pattern" || true)"
else
  leaks="$(printf '%s\n' "$found" | sort -u)"
fi

[ -z "$leaks" ] && exit 0
printf '%s\n' "$leaks"
exit 1
