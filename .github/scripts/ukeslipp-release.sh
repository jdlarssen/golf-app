#!/usr/bin/env bash
# Ukeslipp-release (#2019): git-tag vX.Y.Z + GitHub-release for ett ukeslipp.
# Kjøres av .github/workflows/ukeslipp-release.yml — headeren der forklarer
# hvorfor den har tre triggere.
#
# Arbeidsdelingen: scripts/release-notes.mjs henter ukas blokk fra CHANGELOG.md
# (formatet eies av weekly-release.mjs), dette skriptet eier git, tag og release.
#
# Idempotent: finnes releasen alt, gjør skriptet ingenting (exit 0). Det er det
# som gjør cron + push + dispatch mot samme slipp ufarlig.
#
# Fail-closed: mangler ukas blokk, finnes ikke release-commiten, eller står en
# tag alt på en annen commit → exit 1. Aldri en release på gjetning, og en tag
# flyttes aldri. Varsel-issuet eies av workflowen.
#
# Lokalt (repo-rota, main sjekket ut):
#   GITHUB_REPOSITORY=jdlarssen/golf-app INPUT_VERSION=1.236.0 bash .github/scripts/ukeslipp-release.sh
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY må være satt}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

die() { echo "::error::$1" >&2; exit 1; }

# GET mot GitHub-API-et som skiller «finnes ikke» fra feil: 404 gir tom utdata
# og exit 0; alt annet enn et svar (nett, token) gir exit 1. Ellers ville et
# API-hikk sett ut som «mangler» og ført til en ny release (I3).
gh_get_or_empty() { # <api-sti> <jq>
  local out
  if out=$(gh api "$1" --jq "$2" 2>"$TMP/gh.err"); then
    printf '%s' "$out"
    return 0
  fi
  grep -q 'HTTP 404' "$TMP/gh.err" && return 0
  echo "::error::gh api $1 feilet: $(cat "$TMP/gh.err")" >&2
  return 1
}

# ── 0. Bare fra main ──
# package.json og CHANGELOG.md leses fra utsjekken — en dispatch fra en annen
# branch ville lest feil filer.
if [ -n "${GITHUB_REF:-}" ] && [ "$GITHUB_REF" != "refs/heads/main" ]; then
  die "ukeslipp-release kjører bare fra main (fikk $GITHUB_REF). Kjør: gh workflow run ukeslipp-release.yml --ref main"
fi

# ── 1. Versjon ──
MAIN_VERSION=$(jq -r '.version' package.json)
VERSION="${INPUT_VERSION:-$MAIN_VERSION}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "«$VERSION» er ikke en versjon på formen X.Y.Z."
TAG="v$VERSION"
echo "Versjon: $VERSION (package.json på main: $MAIN_VERSION)"

# ── 2. Idempotens: finnes releasen alt? ──
RELEASE_URL=$(gh_get_or_empty "repos/$REPO/releases/tags/$TAG" '.html_url') || exit 1
if [ -n "$RELEASE_URL" ]; then
  echo "::notice::$TAG finnes alt ($RELEASE_URL) — ingenting å gjøre."
  exit 0
fi

# ── 3. Notatene: ukas blokk i CHANGELOG.md ──
# Før commit-oppslaget: en versjon uten ukeblokk (9.9.9, eller et slipp fra før
# ukesrutinen) stopper her, med feilmeldingen fra release-notes.mjs over.
node scripts/release-notes.mjs --version "$VERSION" > "$TMP/release.json" \
  || die "release-notes.mjs avviste $VERSION (feilen står over) — ingen release."
TITLE=$(jq -r '.title' "$TMP/release.json")
jq -r '.notes' "$TMP/release.json" > "$TMP/notes.md"
{ [ -n "$TITLE" ] && [ -s "$TMP/notes.md" ]; } || die "release-notes.mjs ga tom tittel eller tomme notater for $VERSION."

# ── 4. Release-commiten ──
# Nyeste commit med emnet «chore(release): v<versjon> …» (ukesversjon.sh skriver
# det), kryssjekket mot version-feltet i den commitens package.json. Loggen går
# til fil først: awk som avslutter tidlig midt i en pipe gir SIGPIPE under pipefail.
git log --format='%H%x09%s' HEAD > "$TMP/log.tsv"
TARGET=$(awk -F'\t' -v p="chore(release): v$VERSION " 'index($2, p) == 1 { print $1; exit }' "$TMP/log.tsv")
[ -n "$TARGET" ] || die "fant ingen commit på main med emnet «chore(release): v$VERSION …»."
COMMIT_VERSION=$(git show "$TARGET:package.json" | jq -r '.version')
[ "$COMMIT_VERSION" = "$VERSION" ] || die "commit $TARGET heter v$VERSION, men package.json der sier $COMMIT_VERSION."
echo "Release-commit: $TARGET"

# ── 5. En tag som alt finnes, må stå på release-commiten ──
# Typisk etter en kjøring som laget taggen men døde før releasen. Står den et
# annet sted, stopper vi: en tag flyttes aldri.
TAG_REF=$(gh_get_or_empty "repos/$REPO/git/ref/tags/$TAG" '.object.type + " " + .object.sha') || exit 1
if [ -n "$TAG_REF" ] && [ "$TAG_REF" != "commit $TARGET" ]; then
  die "taggen $TAG finnes alt ($TAG_REF), men ikke som lett tag på release-commiten $TARGET. Tags flyttes aldri — rydd opp for hånd."
fi

# ── 6. Opprett ──
# «Latest» bare for versjonen i package.json på main, så tilbakefylling i
# vilkårlig rekkefølge aldri stjeler den fra nyeste slipp.
LATEST=false
if [ "$VERSION" = "$MAIN_VERSION" ]; then LATEST=true; fi
URL=$(gh release create "$TAG" --repo "$REPO" --target "$TARGET" --title "$TITLE" \
  --notes-file "$TMP/notes.md" --latest="$LATEST") \
  || die "gh release create feilet for $TAG."

# ── 7. Bekreft positivt: taggen står på release-commiten ──
CONFIRMED=$(gh_get_or_empty "repos/$REPO/git/ref/tags/$TAG" '.object.type + " " + .object.sha') || exit 1
[ "$CONFIRMED" = "commit $TARGET" ] \
  || die "releasen $URL ble laget, men taggen $TAG står på «${CONFIRMED:-ingenting}», ikke $TARGET."

echo "::notice::$TAG → $TARGET (latest=$LATEST): $URL"
bash .github/scripts/discord-notify.sh "🏷️ Ukeslipp $VERSION ligger på GitHub — $URL"
