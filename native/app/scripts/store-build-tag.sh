#!/usr/bin/env bash
# native/app/scripts/store-build-tag.sh
# Merke per butikkbygg (#2019): git-taggen `native-ios/v<versjon>-<build>` på
# nøyaktig commiten et App Store Connect-bygg ble kompilert fra.
#
# Hvorfor: bump-commiten er ikke byggecommiten (#1954: bump 68f5d6cd, bygg
# fd3b850d), og uten merket sier ingenting i repoet hvilken kode et
# TestFlight-bygg kom fra.
#
# store-build-ios.sh kaller skriptet etter «Upload succeeded», med commiten
# arkivet ble bygget fra (sidecar-fila <arkiv>.commit). Det kan også kjøres for
# hånd, f.eks. for et arkiv fra før merkene fantes.
#
# Regler:
#  - Taggen lages via GitHubs REST-API, aldri `git push`: pre-push-gaten ville
#    kjørt hele verify-suiten på en tag-push, og API-et går utenom lokale hooks.
#  - Commiten må ligge på main — merket skal peke på kode alle kan finne.
#  - Idempotent: finnes merket alt på samme commit, er alt i orden (exit 0).
#  - Et merke flyttes ALDRI. Står det på en annen commit, er dette et annet
#    bygg: bump buildnummeret i stedet.
#
# Bruk:   native/app/scripts/store-build-tag.sh <versjon> <build> <commit>
#         f.eks. native/app/scripts/store-build-tag.sh 1.1.0 3 fd3b850d
# Utdata: meldinger på stderr; ved suksess én linje på stdout: «<merke> → <sha>».
# Krever: gh, innlogget (gh auth login).
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd "$APP_DIR/../.." && pwd)
REPO='jdlarssen/golf-app'
PREFIX='native-ios'

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

say() { printf '%s\n' "$*" >&2; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

# Hjelpeteksten er header-kommentaren over (samme grep som store-build-ios.sh).
print_help() { awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; }

case "${1:-}" in -h|--help) print_help; exit 0 ;; esac
[ $# -eq 3 ] || die "Bruk: $0 <versjon> <build> <commit>   (f.eks. $0 1.1.0 3 fd3b850d)"
VERSION=$1
BUILD=$2
COMMIT=$3
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Versjonen «$VERSION» er ikke på formen X.Y.Z."
[[ "$BUILD" =~ ^[0-9A-Za-z]+$ ]] || die "Buildnummeret «$BUILD» kan bare inneholde bokstaver og sifre."
TAG="$PREFIX/v$VERSION-$BUILD"

command -v gh >/dev/null || die "GitHub CLI (gh) mangler. Installer den (brew install gh), logg inn (gh auth login) og kjør: $0 $VERSION $BUILD $COMMIT"
gh auth status >/dev/null 2>&1 || die "gh er ikke innlogget. Kjør: gh auth login — og deretter: $0 $VERSION $BUILD $COMMIT"

git -C "$REPO_ROOT" fetch -q origin main || die "git fetch origin main feilet — sjekk nettet og kjør igjen."
SHA=$(git -C "$REPO_ROOT" rev-parse --verify --quiet "$COMMIT^{commit}") || die "Fant ingen commit «$COMMIT» i repoet."
git -C "$REPO_ROOT" merge-base --is-ancestor "$SHA" origin/main \
  || die "Commiten $SHA er ikke på main. Et merke skal peke på kode alle kan finne — bygg fra main."

# «commit <sha>» for et merke som finnes, tom utdata for 404, exit 1 for alt
# annet — et API-hikk skal aldri se ut som «merket mangler».
lookup() {
  local out
  if out=$(gh api "repos/$REPO/git/ref/tags/$TAG" --jq '.object.type + " " + .object.sha' 2>"$TMP/get.err"); then
    printf '%s' "$out"
    return 0
  fi
  grep -q 'HTTP 404' "$TMP/get.err" && return 0
  say "✗ Klarte ikke lese $TAG fra GitHub: $(cat "$TMP/get.err")"
  return 1
}

EXISTING=$(lookup) || exit 1
if [ -n "$EXISTING" ]; then
  if [ "$EXISTING" = "commit $SHA" ]; then
    say "Merket $TAG finnes alt på $SHA — ingenting å gjøre."
    printf '%s → %s\n' "$TAG" "$SHA"
    exit 0
  fi
  die "Merket $TAG finnes alt, men peker på «$EXISTING» — ikke $SHA. Et merke flyttes aldri. Er dette et nytt bygg: bump STORE_IOS_BUILD_NUMBER i native/app/app.config.ts og bygg på nytt."
fi

say "Lager $TAG → $SHA (GitHub-API, ingen git push) …"
gh api -X POST "repos/$REPO/git/refs" -f ref="refs/tags/$TAG" -f sha="$SHA" --silent 2>"$TMP/post.err" \
  || die "GitHub avviste merket $TAG: $(cat "$TMP/post.err")"

# Bekreft positivt: les merket tilbake.
CONFIRMED=$(lookup) || exit 1
[ "$CONFIRMED" = "commit $SHA" ] || die "GitHub svarte OK, men $TAG står på «${CONFIRMED:-ingenting}», ikke $SHA."
say "✓ $TAG → $SHA"
printf '%s → %s\n' "$TAG" "$SHA"
