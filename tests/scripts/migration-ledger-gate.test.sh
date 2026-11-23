#!/usr/bin/env bash
# Test for .github/scripts/migration-ledger-gate.sh.
#
# Kjør: bash tests/scripts/migration-ledger-gate.test.sh
#
# Skriptet kjøres i en temp-katalog med to migrasjonsfiler, tom baseline og en
# stum discord-notify.sh. LEDGER_FILE er testkroken som erstatter API-kallet.
# En falsk `gh` logger kallene og svarer på `issue list` med GH_EXISTING (JSON).
# Den falske `gh` avviser `--jq` sammen med `--arg`, slik ekte gh gjør — det var
# den formen som gjorde at dedupen aldri virket.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${GATE_SCRIPT:-$ROOT/.github/scripts/migration-ledger-gate.sh}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/work/supabase/migrations" "$TMP/work/docs/loops" "$TMP/work/.github/scripts"
printf 'select 1;\n' > "$TMP/work/supabase/migrations/0010_alpha.sql"
printf 'select 1;\n' > "$TMP/work/supabase/migrations/0011_beta.sql"
: > "$TMP/work/docs/loops/migration-ledger-baseline.txt"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/work/.github/scripts/discord-notify.sh"

cat > "$TMP/bin/gh" <<'GH'
#!/usr/bin/env bash
{ echo "@@CALL"; for a in "$@"; do printf '%s\n' "$a"; done; } >> "$FAKE_DIR/gh-calls"
case "$1 $2" in
  "issue list")
    [ -n "${GH_LIST_FAIL:-}" ] && { echo "gh: boom" >&2; exit 1; }
    for a in "$@"; do
      if [ "$a" = "--arg" ]; then echo "unknown flag: --arg" >&2; exit 2; fi
    done
    printf '%s' "${GH_EXISTING:-[]}" ;;
  "api"*) echo "https://github.com/x/y/issues/99" ;;
  *) ;;
esac
exit 0
GH
chmod +x "$TMP/bin/gh"

pass=0; fail=0
ok()  { pass=$((pass + 1)); echo "  ok   $1"; }
bad() { fail=$((fail + 1)); echo "  FAIL $1"; }

run() { # ledger-json → setter $CODE; krever GH_EXISTING/GH_LIST_FAIL i miljøet
  export FAKE_DIR="$TMP/fake"; rm -rf "$FAKE_DIR"; mkdir -p "$FAKE_DIR"
  printf '%s' "$1" > "$TMP/ledger.json"
  ( cd "$TMP/work" && PATH="$TMP/bin:$PATH" LEDGER_FILE="$TMP/ledger.json" \
      GITHUB_REPOSITORY=o/r GITHUB_EVENT_NAME=schedule GITHUB_RUN_ID=1 \
      "$BASH" "$SCRIPT" > "$TMP/out.log" 2>&1 )
  CODE=$?
}
calls() { cat "$FAKE_DIR/gh-calls" 2>/dev/null; }
count() { calls | grep -c -x -- "$1" || true; }

GREEN='[{"version":"1","name":"0010_alpha"},{"version":"2","name":"beta"}]'
RED='[{"version":"1","name":"0010_alpha"}]'
TITLE='Prod-vakt: migrasjoner merget men ikke påført prod'

echo "1. grønn uten åpne issues"
unset GH_EXISTING GH_LIST_FAIL
run "$GREEN"
[ "$CODE" = 0 ] && ok "exit 0" || bad "exit $CODE"
[ "$(count close)" = 0 ] && ok "ingen close" || bad "close uten issue"

echo "2. rød uten åpent issue → ett nytt issue"
run "$RED"
[ "$CODE" = 1 ] && ok "exit 1" || bad "exit $CODE"
[ "$(count api)" = 1 ] && ok "ett issue opprettet" || bad "api-kall: $(count api)"
grep -q '0011_beta' "$TMP/fake/gh-calls" && ok "filnavn i body" || bad "filnavn mangler"

echo "3. rød med åpent issue med eksakt tittel → kommentar, ikke nytt issue"
export GH_EXISTING="[{\"number\":42,\"title\":\"$TITLE\"}]"
run "$RED"
[ "$CODE" = 1 ] && ok "exit 1" || bad "exit $CODE"
[ "$(count api)" = 0 ] && ok "ingen duplikat" || bad "duplikat opprettet"
[ "$(count comment)" = 1 ] && [ "$(count 42)" -ge 1 ] && ok "kommentert på #42" || bad "ingen kommentar på #42"

echo "4. åpent issue med tittel som bare ligner (substreng) → nytt issue"
export GH_EXISTING="[{\"number\":7,\"title\":\"$TITLE (gammel)\"}]"
run "$RED"
[ "$(count api)" = 1 ] && ok "nytt issue" || bad "substreng-treff ble brukt"

echo "5. grønn med åpent issue → lukkes"
export GH_EXISTING="[{\"number\":42,\"title\":\"$TITLE\"}]"
run "$GREEN"
[ "$CODE" = 0 ] && ok "exit 0" || bad "exit $CODE"
[ "$(count close)" = 1 ] && [ "$(count 42)" -ge 1 ] && ok "#42 lukket" || bad "ikke lukket"

echo "6. gh issue list feiler → aldri duplikat, aldri close"
export GH_LIST_FAIL=1
run "$RED"
[ "$(count api)" = 0 ] && ok "ingen opprettelse ved gh-feil" || bad "opprettet ved gh-feil"
run "$GREEN"
[ "$(count close)" = 0 ] && ok "ingen close ved gh-feil" || bad "close ved gh-feil"
unset GH_LIST_FAIL

echo "7. tom hovedbok → fail-closed med eget varsel"
unset GH_EXISTING
run '[]'
[ "$CODE" = 1 ] && ok "exit 1" || bad "exit $CODE"
[ "$(count api)" = 1 ] && ok "lesefeil-issue filet" || bad "ingen lesefeil-issue"

echo
echo "$pass ok, $fail feilet"
[ "$fail" = 0 ]
