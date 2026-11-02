#!/usr/bin/env bash
# native/app/scripts/fcm-key-to-vercel.sh
# #2758: legger `FCM_SERVICE_ACCOUNT` inn i Vercel (Production og Preview) uten at
# verdien vises eller limes. Eieren dobbeltklikker en kopi av dette skriptet,
# `Tørny varselnøkkel.command` på skrivebordet, så det leser ingenting fra repoet.
#
# Reglene:
#
#  1. **Verdien går i stdin**, aldri i argv (`--value` ville stått i `ps`) og aldri
#     i utdata. `env ls` kjøres uten `--json`, som viser verdiene.
#  2. **Feil fil stopper før noe sendes.** Sjekken skriver ingen verdier: feilen
#     fra `JSON.parse` siterer fila, så stderr kastes.
#  3. **Et navn som finnes alt, overskrives ikke.** Ingen `--force`.
#  4. **`env ls` leses med `2>&1`.** Lista er aldri en verdi, og et navn som bare
#     står på stderr skal ikke se ut som at det mangler.
#
# Første kjøring åpner en nettleser, der eieren bekrefter innloggingen hos Vercel.
# Testes mot en falsk `npx` i `fcm-key-to-vercel.test.js`: en ekte kjøring skriver
# til Vercel. Bash 3.2 på Macen: variabler inntil norske tegn står i `${}`.
set -euo pipefail

FILE="$HOME/.torny-native/firebase-service-account.json"
NAME=FCM_SERVICE_ACCOUNT
PROJECT=golf-app
TEAM=jdlarssen-prosjekter

stopp() {
  printf '\nStoppet: %s\n' "$*" >&2
  exit 1
}

# Et dobbeltklikk gir et skall som kan mangle nvm sin Node.
if ! command -v npx >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +eu
  . "$HOME/.nvm/nvm.sh"
  nvm use 22 >/dev/null
  set -eu
fi
command -v npx >/dev/null 2>&1 || stopp "Fant ikke Node på denne maskinen. Si fra i chatten."

vc() {
  npx --yes vercel@65.9.0 "$@"
}

navn_hos_vercel() {
  vc env ls --project "$PROJECT" --scope "$TEAM" 2>&1
}

[ -f "$FILE" ] || stopp "Fant ikke nøkkelfila. Ingenting er endret. Si fra i chatten."

if ! node -e '
  const a = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const felt = ["project_id", "private_key", "client_email"];
  const ok = a.type === "service_account" && felt.every((k) => typeof a[k] === "string" && a[k]);
  process.exit(ok ? 0 : 1);
' "$FILE" 2>/dev/null; then
  stopp "Nøkkelfila ser ikke riktig ut. Ingenting er endret. Si fra i chatten."
fi

if ! vc whoami >/dev/null 2>&1; then
  printf 'Nå åpner nettleseren seg. Bekreft innloggingen der, så fortsetter dette av seg selv.\n'
  vc login || stopp "Du ble ikke logget inn hos Vercel. Ingenting er endret. Dobbeltklikk på fila for å prøve igjen."
fi

liste=$(navn_hos_vercel) || stopp "Fikk ikke sjekket hva som ligger hos Vercel. Ingenting er endret. Si fra i chatten."
case "$liste" in
  *"$NAME"*) stopp "Varselnøkkelen ligger alt hos Vercel, så jeg rører den ikke. Du trenger ikke gjøre mer." ;;
esac

if ! svar=$(base64 -i "$FILE" | tr -d '\n' | vc env add "$NAME" \
  --environment production,preview --sensitive --yes \
  --project "$PROJECT" --scope "$TEAM" 2>&1); then
  printf '%s\n' "$svar" >&2
  stopp "Vercel tok ikke imot nøkkelen. Si fra i chatten."
fi

liste=$(navn_hos_vercel) || stopp "Nøkkelen er sendt, men jeg fikk ikke sjekket at den kom fram. Si fra i chatten."
case "$liste" in
  *"$NAME"*) ;;
  *) stopp "Nøkkelen er sendt, men Vercel viser den ikke. Si fra i chatten." ;;
esac

printf 'Ferdig. Varselnøkkelen ligger hos Vercel. Du kan lukke vinduet.\n'
