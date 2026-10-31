#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (claude.ai/code, the Claude app).
# Makes a fresh cloud container match the owner's Mac setup closely enough that
# the repo's own commands work as documented. Does nothing on a local machine.
#
# What it does, in order:
#   1. npm install (skipped when package.json/package-lock.json are unchanged).
#      postinstall also points git at .githooks, so commit-msg/pre-commit/pre-push run.
#   2. A stub ~/.nvm/nvm.sh when nvm is missing and the system Node is already 22,
#      so `source ~/.nvm/nvm.sh && nvm use 22` in docs, launch.json and
#      orchestrator.json keeps working.
#   3. The playwright-cli command the playwright-cli skill needs.
#   4. .env.staging.local, written from the environment's variables, but only
#      when they point at torny-staging. Never prod.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# 1. npm dependencies -------------------------------------------------------
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  # Delete the old hashes first, so a failed install runs again next time
  rm -f "$hashes"
  npm install --no-audit --no-fund
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
fi

# 2. nvm stub ---------------------------------------------------------------
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ ! -s "$HOME/.nvm/nvm.sh" ] && [ "$node_major" = "22" ]; then
  mkdir -p "$HOME/.nvm"
  cat > "$HOME/.nvm/nvm.sh" <<'STUB'
# Stub written by .claude/hooks/session-start.sh: this cloud container already
# runs Node 22, so `nvm use 22` has nothing to switch. Other nvm commands fail loudly.
nvm() {
  if [ "${1:-}" = "use" ] && [ "${2:-}" = "22" ]; then return 0; fi
  echo "nvm stub: only 'nvm use 22' is supported in cloud sessions (node $(node -v))" >&2
  return 1
}
STUB
fi

# 3. playwright-cli ---------------------------------------------------------
if ! command -v playwright-cli >/dev/null 2>&1; then
  npm install -g --no-audit --no-fund @playwright/cli@latest
fi

# 4. .env.staging.local from environment variables --------------------------
staging_ref="snwmueecmfqqdurxedxv"
env_file=".env.staging.local"
if [ ! -e "$env_file" ]; then
  case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
    *"$staging_ref"*)
      tmp="$(mktemp)"
      for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
        SUPABASE_SERVICE_ROLE_KEY E2E_ADMIN_EMAIL E2E_PLAYER_EMAIL DEV_LOGIN_PASSWORD \
        NEXT_PUBLIC_ALLOW_SELF_REGISTRATION NEXT_PUBLIC_PASSKEYS; do
        value="${!name:-}"
        [ -n "$value" ] || continue
        case "$value" in
          *"'"* | *$'\n'*)
            echo "session-start: $name holds a quote or newline, left out of $env_file" >&2
            continue
            ;;
        esac
        printf "%s='%s'\n" "$name" "$value" >> "$tmp"
      done
      chmod 600 "$tmp"
      mv "$tmp" "$env_file"
      ;;
    "")
      echo "session-start: no staging variables in this environment, so $env_file was not written (see docs/cloud-sessions.md)" >&2
      ;;
    *)
      echo "session-start: NEXT_PUBLIC_SUPABASE_URL is not torny-staging, so $env_file was not written" >&2
      ;;
  esac
fi
