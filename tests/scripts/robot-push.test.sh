#!/usr/bin/env bash
# Test for robot_push i .github/scripts/robot-pr.sh (#2024).
#
# Kjør: bash tests/scripts/robot-push.test.sh
#
# En falsk `git` og en falsk `sleep` legges først på PATH. Falsk git feiler de
# første GIT_FAILS kallene (med GitHubs commit_refs-melding på stderr) og
# lykkes deretter; begge logger hvert kall til en tellerfil. Slik bevises
# retry-grenen uten nett — den kan ikke fremprovoseres mot GitHub.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat > "$TMP/bin/git" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_DIR/git-calls"
n=$(wc -l < "$FAKE_DIR/git-calls" | tr -d ' ')
if [ "$n" -le "${GIT_FAILS:-0}" ]; then
  echo "remote: fatal error in commit_refs" >&2
  exit 1
fi
exit 0
EOF
cat > "$TMP/bin/sleep" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_DIR/sleep-calls"
EOF
chmod +x "$TMP/bin/git" "$TMP/bin/sleep"

pass=0
fail=0

check() { # beskrivelse forventet faktisk
  if [ "$2" = "$3" ]; then
    pass=$((pass + 1))
    printf 'PASS  %s\n' "$1"
  else
    fail=$((fail + 1))
    printf 'FAIL  %s: forventet %s, fikk %s\n' "$1" "$2" "$3"
  fi
}

run_case() { # git-feil → setter EXIT, GIT_CALLS, SLEEP_CALLS, STDERR
  local dir="$TMP/case-$1"
  mkdir -p "$dir"
  : > "$dir/git-calls"
  : > "$dir/sleep-calls"
  (
    export PATH="$TMP/bin:$PATH" FAKE_DIR="$dir" GIT_FAILS="$1"
    unset ROBOT_PUSH_SLEEP
    # shellcheck source=/dev/null
    source "$ROOT/.github/scripts/robot-pr.sh"
    robot_push "claude/test-branch"
  ) 2> "$dir/stderr"
  EXIT=$?
  GIT_CALLS=$(wc -l < "$dir/git-calls" | tr -d ' ')
  SLEEP_CALLS=$(wc -l < "$dir/sleep-calls" | tr -d ' ')
  STDERR=$(cat "$dir/stderr")
  LAST_GIT=$(tail -n 1 "$dir/git-calls")
  SLEEPS=$(tr '\n' ' ' < "$dir/sleep-calls" | sed 's/ $//')
}

# (a) feil på 1. forsøk, grønn på 2.
run_case 1
check "(a) exit 0 når 2. forsøk lykkes" 0 "$EXIT"
check "(a) nøyaktig 2 git-kall" 2 "$GIT_CALLS"
check "(a) én ventetid (10 s) før 2. forsøk" "10" "$SLEEPS"
check "(a) pusher riktig branch uten --force" "push origin claude/test-branch" "$LAST_GIT"
case "$STDERR" in
  *"robot_push: forsøk 1/3 feilet"*) check "(a) logger mislykket forsøk på stderr" yes yes ;;
  *) check "(a) logger mislykket forsøk på stderr" yes no ;;
esac
case "$STDERR" in
  *"commit_refs"*) check "(a) GitHubs feilmelding står fortsatt i loggen" yes yes ;;
  *) check "(a) GitHubs feilmelding står fortsatt i loggen" yes no ;;
esac

# (b) feil 3 ganger → gir opp
run_case 3
if [ "$EXIT" -ne 0 ]; then check "(b) exit ≠0 etter 3 mislykkede forsøk" yes yes
else check "(b) exit ≠0 etter 3 mislykkede forsøk" yes no; fi
check "(b) nøyaktig 3 git-kall" 3 "$GIT_CALLS"
check "(b) ventetider 10 s og 30 s" "10 30" "$SLEEPS"

# (c) grønn første gang
run_case 0
check "(c) exit 0" 0 "$EXIT"
check "(c) nøyaktig 1 git-kall" 1 "$GIT_CALLS"
check "(c) ingen sleep" 0 "$SLEEP_CALLS"

echo
printf '%s bestått, %s feilet\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
