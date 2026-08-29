#!/usr/bin/env bash
# Branch-sweepen (#1675): rydder fullmergede `claude/*`-branches fra remote.
#
# Hvorfor den finnes: GitHubs `delete_branch_on_merge` fyrer bare på merger gjort
# gjennom GitHubs egen UI/auto-merge — ikke på API-/PAT-merger. Discord-PR-kortet
# rydder nå etter seg selv (lib/loops/autoMerge.ts → deleteHeadBranch), men
# GitHub-MCP-merger fra remote-økter og eldre branches har ingen slik rydder.
# Denne er nettet under: den kjører ukentlig og tar det som ble liggende.
#
# Klassifisering per branch (første treff avgjør):
#   1. oppslag feilet  → BEHOLD (PR-lista eller `git cherry` svarte ikke — vi vet
#                                for lite til å klassifisere; rapporteres som
#                                «feilet» og prøves igjen neste uke)
#   2. åpen PR         → BEHOLD (økta jobber fortsatt)
#   3. merget PR       → SLETT  (autoritativt selv når patch-id-ene har drevet,
#                                f.eks. en rebase-merge med konfliktløsning)
#   4. 0 unike patcher → SLETT  (`git cherry` sammenligner patch-id, så en
#                                rebase-merge med nye SHA-er leses riktig)
#   5. ellers          → FORELDRELØS: aldri slett, rapporter på #1110
#
# Fail-safe: sletter kun beviste tilfeller, og aldri en ref utenfor `claude/*`.
# (En sletting er uansett omgjørbar fra PR-siden på GitHub så lenge PR-en finnes.)
#
# Env: GH_TOKEN (påkrevd) · GITHUB_REPOSITORY (påkrevd) · DRY_RUN=1 (klassifiser
# og logg, ikke slett/kommenter).

set -uo pipefail

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY må være satt}"
DRY_RUN="${DRY_RUN:-0}"
DRIFT_ISSUE=1110 # Loop-drift-tavla — foreldreløse branches rapporteres her.

# `gh pr list --head` matcher på branchNAVN alene, og treffer derfor også PR-er
# fra en fork som tilfeldigvis har samme navn (`claude/…` er et vanlig mønster).
# En fremmed forks åpne PR ville da fått repoets egen branch klassifisert som
# BEHOLD — og verre: en fremmed forks MERGEDE PR ville fått den klassifisert som
# SLETT. Tell derfor kun PR-er hvis head-repo eies av dette repoets egen eier.
REPO_OWNER="${REPO%%/*}"
OWN_PR_COUNT_JQ="[.[] | select(.headRepositoryOwner.login == \"$REPO_OWNER\")] | length"

if ! git fetch --prune --quiet origin '+refs/heads/*:refs/remotes/origin/*'; then
  echo "::error::git fetch feilet — sweepen kan ikke klassifisere noe."
  exit 1
fi

deleted=()
kept=()
orphans=()
failed=()

# `%(refname:strip=3)` fjerner «refs/remotes/origin/» → «claude/…».
while read -r branch; do
  [ -n "$branch" ] || continue

  # Prefiks-vakten, gjentatt her selv om ref-mønsteret over allerede filtrerer:
  # sletting er irreversibel nok til å tåle to låser. `..` ville dessuten
  # normalisert seg bort i API-pathen (…/heads/claude/../../main).
  case "$branch" in
    claude/*[!A-Za-z0-9._/-]* | *..*)
      echo "::warning::«$branch» har uventede tegn — rører den ikke."
      kept+=("$branch (uventet ref-navn)")
      continue
      ;;
    claude/*) ;;
    *)
      echo "::warning::«$branch» er utenfor claude/* — rører den ikke."
      continue
      ;;
  esac

  open_prs=$(gh pr list --repo "$REPO" --state open --head "$branch" \
    --json number,headRepositoryOwner --jq "$OWN_PR_COUNT_JQ")
  if [ -z "$open_prs" ]; then
    echo "::warning::$branch: PR-oppslaget feilet — beholder branchen."
    failed+=("$branch")
    continue
  fi
  if [ "$open_prs" -gt 0 ]; then
    echo "BEHOLD  $branch — åpen PR"
    kept+=("$branch (åpen PR)")
    continue
  fi

  merged_prs=$(gh pr list --repo "$REPO" --state merged --head "$branch" \
    --json number,headRepositoryOwner --jq "$OWN_PR_COUNT_JQ")
  # Samme vakt som for open-oppslaget over: et feilende `gh pr list` gir tom
  # streng, og uvoktet ville den lest som «0 merged» — nok et tomt-utdata-som-
  # autoritativt-nei. Toppkommentarens regel #1 gjelder ALLE tre oppslagene.
  if [ -z "$merged_prs" ]; then
    echo "::warning::$branch: PR-oppslaget (merged) feilet — beholder branchen."
    failed+=("$branch")
    continue
  fi

  # Exit-statusen MÅ fanges før klassifiseringen: i røret under gikk `git cherry`s
  # exit tapt, og en feilende cherry (skadet ref, manglende objekt) ga tom
  # utdata → `unique=0` → «0 unike patcher» → SLETT. Feilen så altså ut som et
  # bevis på at branchen var fullmerget.
  if ! cherry_out=$(git cherry "origin/main" "origin/$branch" 2>/dev/null); then
    echo "::warning::$branch: git cherry feilet — beholder branchen."
    failed+=("$branch")
    continue
  fi
  # `grep -c` gir 0 OG exit 1 når ingenting matcher — `|| true` er påkrevd her
  # (ikke kosmetikk): uten den ville tilordningen arvet exit 1.
  unique=$(grep -c '^+' <<<"$cherry_out" || true)

  if [ "$merged_prs" -gt 0 ]; then
    reason="merget PR ($unique unik(e) patch(er) i cherry)"
  elif [ "$unique" -eq 0 ]; then
    reason="0 unike patcher mot main"
  else
    echo "FORELDRELØS  $branch — $unique unik(e) patch(er), ingen PR"
    orphans+=("$branch ($unique unik(e) commit(s))")
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "SLETT (dry-run)  $branch — $reason"
    deleted+=("$branch")
    continue
  fi

  if gh api -X DELETE "repos/$REPO/git/refs/heads/$branch" --silent; then
    echo "SLETTET  $branch — $reason"
    deleted+=("$branch")
  else
    echo "::warning::$branch: sletting feilet — prøves igjen neste uke."
    failed+=("$branch")
  fi
done < <(git for-each-ref --format='%(refname:strip=3)' 'refs/remotes/origin/claude/*')

echo
echo "Oppsummering: ${#deleted[@]} slettet, ${#kept[@]} beholdt, ${#orphans[@]} foreldreløs(e), ${#failed[@]} feilet."

# Foreldreløse branches er det eneste som trenger et menneske: commits ingen PR
# har tatt imot. Kommenter KUN når lista er ikke-tom — en ukentlig «alt er fint»-
# kommentar ville druknet tavla.
if [ "${#orphans[@]}" -gt 0 ]; then
  body=$(
    printf '🧹 **Branch-sweep %s**: %d foreldreløs(e) `claude/*`-branch(er) — commits uten PR.\n\n' \
      "$(date -u +%Y-%m-%d)" "${#orphans[@]}"
    printf -- '- `%s`\n' "${orphans[@]}"
    printf '\nSweepen sletter dem aldri selv. Ta dem videre i en PR, eller slett dem manuelt:\n'
    printf '```bash\ngit push origin --delete <branch>\n```\n'
  )
  if [ "$DRY_RUN" = "1" ]; then
    echo "DRY_RUN — ville kommentert på #$DRIFT_ISSUE:"
    echo "$body"
  elif ! gh api "repos/$REPO/issues/$DRIFT_ISSUE/comments" -f body="$body" --silent; then
    echo "::error::fikk ikke rapportert foreldreløse branches på #$DRIFT_ISSUE."
    exit 1
  fi
fi

# Feilede oppslag/slettinger er ufarlige i seg selv (branchen blir stående til
# neste uke), men skal være synlige i kjøringen.
if [ "${#failed[@]}" -gt 0 ]; then
  echo "::warning::${#failed[@]} branch(er) kunne ikke behandles: ${failed[*]}"
fi
