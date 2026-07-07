#!/usr/bin/env bash
# Best-effort Discord-varsling for loop-alarmer og brief (aldri blokkerende).
# Bruk: bash .github/scripts/discord-notify.sh "melding"
# Krever DISCORD_WEBHOOK_URL i miljøet; mangler den, gjør skriptet ingenting
# (stille — varsling er tillegg, GitHub-issuet er alltid primærartefakten).
[ -n "${DISCORD_WEBHOOK_URL:-}" ] || exit 0
[ -n "${1:-}" ] || exit 0
jq -cn --arg c "$1" '{content: $c}' \
  | curl -sf -X POST "$DISCORD_WEBHOOK_URL" -H "Content-Type: application/json" -d @- >/dev/null 2>&1 \
  || true
