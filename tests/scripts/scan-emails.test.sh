#!/usr/bin/env bash
# Test for .githooks/scan-emails.sh: a leading «+» (added diff line) is not part
# of the address, so an allowlisted address on an added line must pass.
# Kjør: bash tests/scripts/scan-emails.test.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export CLAUDE_PROJECT_DIR="$ROOT"
SCAN="$ROOT/.githooks/scan-emails.sh"
fail=0
check() { # navn forventet-exit input
  printf '%s\n' "$3" | bash "$SCAN" >/dev/null; got=$?
  if [ "$got" = "$2" ]; then echo "  ok   $1"; else echo "  FAIL $1 (exit $got, ventet $2)"; fail=1; fi
}
# «^noreply@» er forankret med ^: med et ledende + foran (diff-linje) traff den ikke.
check "forankret allowlist-adresse" 0 "noreply@tornygolf.no"
check "forankret allowlist-adresse etter ledende +" 0 "+noreply@tornygolf.no"
check "ukjent adresse blokkeres" 1 "someone""@""unlisted-example.org"
check "ukjent adresse etter ledende + blokkeres" 1 "+someone""@""unlisted-example.org"
exit $fail
