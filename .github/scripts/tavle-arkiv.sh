#!/usr/bin/env bash
# Tavle-arkivet (#1996): git + PR rundt scripts/loops/archive-boards.ts.
#
# Én kjøring gjør, i denne rekkefølgen:
#   1. Slett: kommentarer som har en byte-identisk kopi i en arkivfil på main.
#      Arbeidstreet ER main her (ingenting er skrevet ennå), så «kopien ligger
#      på main» er strukturelt sant, ikke bare påstått.
#   2. Arkiver: forrige måneds kommentarer skrives til docs/loops/logg/.
#   3. Ny fil → branch claude/arkiv-YYYY-MM, commit, PR mot main. Docs-only uten
#      produktvalg, så Discord-kortet merger den selv. Neste cron-dag (cron går
#      1.–3. i måneden) sletter kommentarene.
#
# Aldri direkte push til main: Actions omgår git-hookene, så branch+PR-
# disiplinen ligger her.
#
# Env: REPO fra GITHUB_REPOSITORY, GH_TOKEN/GITHUB_TOKEN (github.token),
# PR_AUTHOR_PAT (kun gh pr create, #1701), DISCORD_WEBHOOK_URL,
# PHASE (both|archive|delete), MONTH (YYYY-MM eller tom), DRY_RUN (true|false).
#
# Issue-filing ved rød kjøring har ett hjem: workflowens failure-steg. Skriptet
# setter bare exit-koden. Unntaket er parkerings-detektoren i robot-pr.sh, som
# trenger open_or_note_issue.

set -u

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY må være satt}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/${GITHUB_RUN_ID:-?}"
PHASE="${PHASE:-both}"
MONTH="${MONTH:-}"
DRY_RUN="${DRY_RUN:-false}"
LOGG="docs/loops/logg"
BRANCH=""

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

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
    -f "labels[]=area:devx" \
    -F milestone=9 --jq '.html_url' \
    && bash .github/scripts/discord-notify.sh "📋 **$title**" || true
}

fail_closed() { # reason — failure-steget i workflowen filer issuet
  echo "::error::Tavle-arkiv: $1" >&2
  exit 1
}

clean_tree() {
  git checkout -- . 2>/dev/null || true
  git clean -fdq -- "$LOGG" 2>/dev/null || true
}

# Sources ETTER open_or_note_issue: parkerings-detektoren filer via den.
source .github/scripts/robot-pr.sh

case "$PHASE" in (both|archive|delete) ;; (*) fail_closed "ukjent PHASE «$PHASE»" ;; esac
if [ -n "$MONTH" ] && ! [[ "$MONTH" =~ ^[0-9]{4}-(0[1-9]|1[0-2])$ ]]; then
  fail_closed "ugyldig MONTH «$MONTH» — forventet YYYY-MM"
fi

month_args=()
[ -n "$MONTH" ] && month_args=(--month "$MONTH")

runner() { npx --yes tsx scripts/loops/archive-boards.ts "$@"; }

# ── Dry-run: vis alt, rør ingenting ──
if [ "$DRY_RUN" = "true" ]; then
  runner --phase "$PHASE" --dry-run "${month_args[@]}"
  rc=$?
  [ -z "$(git status --porcelain)" ] || fail_closed "dry-run endret arbeidstreet — skal aldri skje"
  exit "$rc"
fi

# ── Ekte kjøring kun fra main ──
# workflow_dispatch sjekker ut grenen valgt i «Use workflow from». Slette-fasen
# skal bare stole på arkivfiler som ligger på main — fra en umerget
# claude/arkiv-*-gren ville den slettet kommentarer uten en kopi på main. Cron
# kjører alltid på main; alt annet må bruke dry_run.
MAIN_SHA=$(git rev-parse origin/main 2>/dev/null) || fail_closed "fant ikke origin/main i checkouten"
if [ "$(git rev-parse HEAD)" != "$MAIN_SHA" ]; then
  fail_closed "ekte kjøring må starte fra main (HEAD $(git rev-parse --short HEAD) ≠ origin/main) — bruk dry_run fra andre grener"
fi

# ── 1. Slett (mens arbeidstreet fortsatt er ren main) ──
delete_rc=0
if [ "$PHASE" != "archive" ]; then
  runner --phase delete "${month_args[@]}" || delete_rc=$?
  [ "$delete_rc" -eq 0 ] || echo "::warning::Slette-fasen meldte avvik eller feil — arkiv-fasen kjøres likevel, og kjøringen blir rød til slutt."
fi
[ "$PHASE" = "delete" ] && exit "$delete_rc"

# ── 2. Arkiver ──
runner --phase archive "${month_args[@]}" || { clean_tree; fail_closed "arkiv-fasen feilet (se loggen over) — ingen fil skrevet til PR"; }

CHANGED=$(git status --porcelain --untracked-files=all | cut -c4-)
if [ -z "$CHANGED" ]; then
  echo "Tavle-arkiv: ingen nye arkivfiler."
  exit "$delete_rc"
fi

# ── 3. Diff-guard: kun nye arkivfiler under docs/loops/logg/ ──
while IFS= read -r f; do
  if ! [[ "$f" =~ ^docs/loops/logg/[0-9]{4}-[0-9]{2}-[a-z-]+-[0-9]+\.md$ ]]; then
    clean_tree
    fail_closed "diff-guard: uventet endring «$f» — kun arkivfiler under $LOGG skal røres"
  fi
done <<< "$CHANGED"

# ── 4. Maks én åpen arkiv-PR ──
EXISTING_PR=$(gh pr list --repo "$REPO" --state open --json headRefName \
  --jq '[.[] | select(.headRefName | startswith("claude/arkiv-"))] | length' 2>/dev/null || echo 0)
if [ "${EXISTING_PR:-0}" -gt 0 ]; then
  echo "Tavle-arkiv: en åpen arkiv-PR finnes allerede — hopper over ny PR (maks én)."
  clean_tree
  exit "$delete_rc"
fi

# ── 5. Branch, commit, push, PR ──
NB_MONTHS=(januar februar mars april mai juni juli august september oktober november desember)
month_label() { # YYYY-MM → «september 2026»
  echo "${NB_MONTHS[$((10#${1#*-} - 1))]} ${1%-*}"
}

MONTHS=$(printf '%s\n' "$CHANGED" | sed -E 's#^.*/([0-9]{4}-[0-9]{2})-.*$#\1#' | sort -u)
LATEST=$(printf '%s\n' "$MONTHS" | tail -n 1)
LABEL=$(printf '%s\n' "$MONTHS" | while read -r m; do month_label "$m"; done | paste -sd ',' - | sed 's/,/, /g')
BRANCH="claude/arkiv-$LATEST"

FILE_LINES=""
MASKED_NOTE=""
while IFS= read -r f; do
  n=$(grep -cE '^## \S+ · [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$f")
  FILE_LINES+="- \`$f\`: $n kommentarer"$'\n'
  grep -q '^Eneste avvik fra verbatim' "$f" && MASKED_NOTE="E-postmønstre utenfor allowlista er maskert med «[at]» (#1929); avviket står i filas header."
done <<< "$CHANGED"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -b "$BRANCH" || fail_closed "klarte ikke lage branch $BRANCH"
git add -- "$LOGG"
git commit -m "docs(loops): arkiv for $LABEL — tavlene #1110 og #1208

${FILE_LINES}
Kopiert verbatim fra tavlene. ${MASKED_NOTE}
Kommentarene slettes fra tavlene av neste kjøring, etter at denne er merget.

Refs #1110
Refs #1996" || fail_closed "commit feilet"
git push origin "$BRANCH" || fail_closed "push av $BRANCH feilet"

PR_BODY="$TMP/prbody.md"
cat > "$PR_BODY" <<EOF
Månedsarkiv for $LABEL fra tavlene #1110 og #1208, kopiert verbatim til \`$LOGG/\`:

${FILE_LINES}
${MASKED_NOTE}

Kommentarene slettes fra tavlene først når denne PR-en er merget: neste kjøring
av tavle-arkivet (cron 1.–3. i måneden) sjekker hver kommentar mot fila på main,
og sletter bare dem som er helt lik kopien.

Automatisk åpnet av tavle-arkiv-workflowen. Kjøring: $RUN_URL

Refs #1996
EOF

PR_URL=$(robot_pr_create "docs(loops): arkiv for $LABEL" "$PR_BODY") \
  || fail_closed "gh pr create feilet"

# Kortet fyrer av seg selv via «CI (docs no-op)» — forutsatt at kjøringene ikke
# er parkert. Detektoren sier fra hvis de er det.
robot_pr_verify_not_parked "Tavle-arkiv" "$(git rev-parse HEAD)" "$PR_URL"

echo "Tavle-arkiv: arkiv-PR åpnet: $PR_URL"
exit "$delete_rc"
