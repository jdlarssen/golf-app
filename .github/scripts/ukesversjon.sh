#!/usr/bin/env bash
# Ukesversjon-jobb (#1562): folder ukas .changes/-notatfiler til ÉN versjon og
# én pulje CHANGELOG-oppføringer, og åpner bokførings-PR-en mot main.
#
# Hvorfor et skript og ikke bare yaml: Actions kjører UTEN git-hooks (pre-push
# finnes ikke der), så branch+PR-disiplinen — aldri direkte push til main — må
# ligge her. Samme mønster som .github/scripts/dok-skjema.sh.
#
# Arbeidsdelingen: scripts/weekly-release.mjs eier filene (les, valider, bump,
# render, slett notater) og rører hverken git eller nett. Dette skriptet eier
# git, PR-en og fail-closed-varslingen.
#
# Fail-closed: ugyldig notatfil, uventet diff eller feilet PR → dedupet
# varsel-issue (milestone 9) + Discord, og exit 1. Aldri stille grønn, og aldri
# et delvis slipp — ett ugyldig notat stopper hele uka.

set -u

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY må være satt}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/${GITHUB_RUN_ID:-?}"
DATE="$(date -u +%Y-%m-%d)"
WEEK="$(date -u +%V)"
BRANCH="claude/ukesversjon-$DATE"

TMP="$(mktemp -d)"
SUMMARY="$TMP/summary.json"
trap 'rm -rf "$TMP"' EXIT

# ── Helpers ──

open_or_note_issue() { # title body — dedupet mot åpent issue med samme tittel
  local title="$1" body="$2" existing
  existing=$(gh issue list --repo "$REPO" --state open --search "in:title \"$title\"" --json number --jq 'length' 2>/dev/null || echo 0)
  if [ "${existing:-0}" -gt 0 ]; then
    echo "Åpent issue «$title» finnes allerede — hopper over."
    return 0
  fi
  gh api "repos/$REPO/issues" \
    -f title="$title" \
    -f body="$body" \
    -f "labels[]=bug" \
    -F milestone=9 --jq '.html_url' \
    && bash .github/scripts/discord-notify.sh "📋 **$title**" || true
}

fail_closed() { # reason [detaljer]
  echo "FAIL-CLOSED: $1" >&2
  open_or_note_issue "Ukesversjon: fikk ikke bokført ukas slipp" \
"Ukesversjon-jobben stoppet: $1

${2:-}

Kjøring: $RUN_URL

Notatfilene står urørt i \`.changes/\` — ingen delvis release er skrevet. Rett
årsaken (typisk ett ugyldig notat) og kjør workflowen på nytt med
\`workflow_dispatch\`. Format: \`.changes/README.md\`."
  exit 1
}

# ── 1. Bokfør (skriptet validerer selv og feiler med filnavn) ──

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if ! node scripts/weekly-release.mjs --summary-json "$SUMMARY" > "$TMP/run.log" 2>&1; then
  cat "$TMP/run.log"
  DETAILS=$(printf '```\n%s\n```' "$(tail -40 "$TMP/run.log")")
  git checkout -- . 2>/dev/null || true
  fail_closed "weekly-release.mjs avviste kjøringen (se detaljer)" "$DETAILS"
fi
cat "$TMP/run.log"

[ -s "$SUMMARY" ] || fail_closed "weekly-release.mjs skrev ingen oppsummering — kan ikke avgjøre om noe ble bokført"

if [ "$(jq -r '.released' "$SUMMARY")" != "true" ]; then
  echo "Ukesversjon: ingen notatfiler denne uka — ingen versjon, ingen PR."
  exit 0
fi

VERSION=$(jq -r '.version' "$SUMMARY")
NOTE_COUNT=$(jq -r '.noteCount' "$SUMMARY")
FEAT_COUNT=$(jq -r '.featCount' "$SUMMARY")

# ── 2. Diff-guard: kun bokførings-filene skal ha endret seg ──
# (I3: «ingen feil» er ikke bevis — vi bekrefter positivt hva som faktisk endret seg.)

CHANGED=$(git diff --name-only)
[ -n "$CHANGED" ] || fail_closed "skriptet meldte $VERSION bokført, men arbeidstreet er urørt"

UNEXPECTED=$(printf '%s\n' "$CHANGED" | grep -vE '^(CHANGELOG\.md|package\.json|package-lock\.json|\.changes/.+\.md)$' || true)
if [ -n "$UNEXPECTED" ]; then
  git checkout -- . 2>/dev/null || true
  fail_closed "diff-guard: uventede filer endret ($(printf '%s' "$UNEXPECTED" | tr '\n' ' '))"
fi
if printf '%s\n' "$CHANGED" | grep -qx '.changes/README.md'; then
  git checkout -- . 2>/dev/null || true
  fail_closed "diff-guard: .changes/README.md er malen og skal aldri røres av rutinen"
fi
UNTRACKED=$(git ls-files --others --exclude-standard)
if [ -n "$UNTRACKED" ]; then
  fail_closed "diff-guard: uventede nye filer ($(printf '%s' "$UNTRACKED" | tr '\n' ' '))"
fi

NOTES_LIST=$(git diff --name-only --diff-filter=D | sed 's|^|- `|; s|$|`|')

# ── 3. Én åpen ukes-PR om gangen ──
# En uåpnet forrige uke ville regnet ut samme versjon på nytt (main er ikke
# bumpet før merge). Da stopper vi heller og pinger — notatene står trygt.

EXISTING_PR=$(gh pr list --repo "$REPO" --state open --json headRefName \
  --jq '[.[] | select(.headRefName | startswith("claude/ukesversjon-"))] | length' 2>/dev/null || echo 0)
if [ "${EXISTING_PR:-0}" -gt 0 ]; then
  git checkout -- . 2>/dev/null || true
  echo "::warning::Forrige ukesversjon-PR er fortsatt åpen — hopper over ny bokføring. Notatene står i .changes/ og blir med når den er merget."
  bash .github/scripts/discord-notify.sh "🕰️ **Ukesversjon hoppet over** — forrige bokførings-PR er ikke merget ennå. $RUN_URL"
  exit 0
fi

# ── 4. Branch, commit, push (aldri direkte til main) ──

git checkout -b "$BRANCH" || fail_closed "klarte ikke lage branch $BRANCH"
git add -A CHANGELOG.md package.json package-lock.json .changes
git commit -m "chore(release): v$VERSION — uke $WEEK

Ukentlig bokføring: $NOTE_COUNT notatfil(er) fra .changes/ foldet til én
versjon ($VERSION) og skrevet inn i CHANGELOG.md. Notatfilene er slettet.

Ingen produktendring — se de enkelte issue-ene for hva som faktisk ble bygget." \
  || fail_closed "commit feilet"

git push origin "$BRANCH" || fail_closed "push av $BRANCH feilet"

# ── 5. PR (ingen produktvalg-heading → Discord-PR-kortet auto-merger på grønt) ──

PR_BODY="$TMP/prbody.md"
cat > "$PR_BODY" <<EOF
Ukentlig bokføring av versjon og changelog (#1562) — **ingen produktendring**.
All funksjonaliteten er allerede merget og deployet; dette slipset gir den ett
felles versjonsnummer og skriver oppføringene inn i changeloggen.

**Versjon:** \`$VERSION\` (uke $WEEK) · **Notater:** $NOTE_COUNT, hvorav $FEAT_COUNT funksjon(er)

Notatfiler foldet inn og slettet:
$NOTES_LIST

Rendret av \`scripts/weekly-release.mjs\`: feat-notater ble funksjonsrader og
fix/perf-notater én rettinger-skuff i ukas blokk \`### $VERSION · <dato>\`, øverst
under \`## Ukeslipp\`. Notater som merges mens denne PR-en står åpen er andre
filer — de blir med i neste ukes slipp.

Automatisk åpnet av ukesversjon-workflowen. Format: \`.changes/README.md\` +
\`docs/changelog-conventions.md\`.
EOF

PR_URL=$(gh pr create --repo "$REPO" --base main --head "$BRANCH" \
  --title "chore(release): v$VERSION — uke $WEEK" \
  --body-file "$PR_BODY") || fail_closed "gh pr create feilet"

# ── 6. CI-trigger-fella: PR-er opprettet med github.token fyrer ikke alltid CI ──
# Uten checks nekter branch protection merge, og bokføringen blir stående. Tomt
# check-rollup på head-SHA-en → dispatch portene selv (#1469-fallbacken).

SHA=$(git rev-parse HEAD)
sleep 45
CHECKS=$(gh api "repos/$REPO/commits/$SHA/check-runs" --jq '.total_count' 2>/dev/null || echo 0)
if [ "${CHECKS:-0}" -eq 0 ]; then
  echo "::warning::Ingen checks på $SHA — dispatcher ci.yml + secret-scan.yml selv."
  gh workflow run ci.yml --ref "$BRANCH" || echo "::warning::dispatch av ci.yml feilet"
  gh workflow run secret-scan.yml --ref "$BRANCH" || echo "::warning::dispatch av secret-scan.yml feilet"
else
  echo "Checks fyrte av seg selv ($CHECKS på $SHA)."
fi

echo "Ukesversjon: bokførings-PR åpnet: $PR_URL"
