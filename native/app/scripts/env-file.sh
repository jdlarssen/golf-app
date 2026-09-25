# native/app/scripts/env-file.sh
# Dotenv-leseren butikkbygget og beviset deler (#2208). Sources av
# `store-build-ios.sh` og `store-build-proof.sh`; kjøres ikke alene.
#
#   env_file_value <fil> <NØKKEL>    verdien fra siste linje som setter nøkkelen
#                                    (tom streng og exit 0 når den mangler)
#   env_file_keys  <fil> <prefiks>   nøklene i fila som starter med prefikset,
#                                    én per linje, uten duplikater
#
# Linjeformen er dotenv sin: `export KEY=` og innrykk godtas. For verdien tolkes
# anførselstegn først (innholdet mellom dem er verdien, også når det har « #»).
# Ellers strippes « # kommentar» og mellomrom på slutten. CR fra en
# Windows-redigert fil fjernes.
#
# Begge kallerne kjører `set -euo pipefail` under macOS' /bin/bash 3.2, så grep
# som kan gi null treff har `|| true`. Absolutt grep: maskinen kan ha ugrep
# først i PATH.

ENV_FILE_GREP=/usr/bin/grep

env_file_value() {
  local file=$1 key=$2 line value
  line=$("$ENV_FILE_GREP" -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -1 || true)
  [ -n "$line" ] || return 0
  value=${line#*=}
  value=${value%$'\r'}
  case "$value" in
    \"*) value=$(printf '%s' "$value" | sed -E 's/^"([^"]*)".*$/\1/') ;;
    \'*) value=$(printf '%s' "$value" | sed -E "s/^'([^']*)'.*$/\\1/") ;;
    *)   value=$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//') ;;
  esac
  printf '%s' "$value"
}

env_file_keys() {
  local file=$1 prefix=$2
  ("$ENV_FILE_GREP" -E "^[[:space:]]*(export[[:space:]]+)?${prefix}[A-Za-z0-9_]*=" "$file" || true) \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=.*$//' \
    | awk '!seen[$0]++'
}
