#!/usr/bin/env bash
# Delt PR-opprettelse for robot-produsentene i Actions (#1701).
#
# Hvorfor: fra GitHubs plattformendring 11. juni 2026 («Bot-created pull requests
# can run workflows if approved») blir pull_request-kjøringene for PR-er som
# github.token åpner OPPRETTET, men parkert som `action_required` («Approve and
# run») til noen med skrivetilgang klikker. Konsekvensen er dobbel: branch
# protection nekter merge, og Discord-PR-kortet ser `action_required` som rødt
# (BAD_CONCLUSIONS) → ingen kort. Fiksen ligger i FORFATTERSKAPET, ikke i
# klassifisereren: åpnes PR-en med et personlig token, er hendelseskjeden
# identisk med menneske-PR-ene, som virker daglig.
#
# Regelen har ett hjem: docs/loops/discord-pr-kort.md, seksjonen «Robot-åpnede
# PR-er må ha menneskelig forfatter (#1701)» — inkludert eier-oppskriften for
# secreten. ⚠️ ALDRI push til robot-branchen med github.token ETTER at PR-en er
# åpnet: `synchronize` parkeres like fullt.
#
# Bruk (source — funksjonene skal leve i kallerens skall, som discord-notify.sh
# er et eget kall):
#
#   source .github/scripts/robot-pr.sh
#   PR_URL=$(robot_pr_create "tittel" "$PR_BODY") || fail_closed "gh pr create feilet"
#   robot_pr_verify_not_parked "Ukesversjon" "$(git rev-parse HEAD)" "$PR_URL"
#
# Kallerens skall MÅ ha satt REPO, BRANCH og RUN_URL, og MÅ ha definert
# open_or_note_issue (tittel, body) — issue-labelen er rutine-spesifikk, så
# filingen blir hos kalleren med vilje.

# ── PR-opprettelse: PAT når den finnes, github.token som ærlig fallback ──
# Skriver PR-URL-en til stdout. Returnerer != 0 bare når BEGGE veier feilet;
# kalleren fail_closed-er da som før. Aldri to PR-er: fallbacken kjøres kun når
# PAT-kallet feilet, og `gh pr create` avviser en ny PR på samme head.
robot_pr_create() { # tittel body-fil → PR-URL på stdout
  local title="$1" body_file="$2" url

  if [ -n "${PR_AUTHOR_PAT:-}" ]; then
    if url=$(GH_TOKEN="$PR_AUTHOR_PAT" gh pr create --repo "$REPO" --base main \
      --head "$BRANCH" --title "$title" --body-file "$body_file"); then
      printf '%s\n' "$url"
      return 0
    fi
    echo "::warning::PR_AUTHOR_PAT ble avvist (utløpt, eller for smale rettigheter?) — prøver github.token i stedet. Da parkeres CI til noen godkjenner kjøringene. Forny tokenet: docs/loops/discord-pr-kort.md."
  else
    echo "::warning::PR_AUTHOR_PAT er ikke satt — PR-en åpnes med github.token, og CI parkeres til noen trykker «Approve and run». Legg inn secreten: docs/loops/discord-pr-kort.md."
  fi

  url=$(gh pr create --repo "$REPO" --base main --head "$BRANCH" \
    --title "$title" --body-file "$body_file") || return 1
  printf '%s\n' "$url"
}

# ── Klassifisering: er kjøringene parkert? ──
# Ren funksjon: leser check-runs-JSON (GET /repos/:repo/commits/:sha/check-runs)
# på stdin og skriver ETT ord til stdout — «parked», «unknown» eller «ok».
# Faktorert ut nettopp for å kunne testes uten nett (#1701, kriterium 3).
#
# Fail-loud, aldri fail-silent: både 0 check-runs og JSON vi ikke klarer å lese
# blir «unknown» og eskalerer som parkert. En kjøring som ennå ikke har
# konkludert (conclusion null) er derimot «ok» — den STARTET uten godkjenning,
# og det er nøyaktig det vi vil bekrefte.
robot_pr_classify_checks() { # check-runs-JSON på stdin → parked|unknown|ok
  local json total parked
  json=$(cat)

  total=$(printf '%s' "$json" | jq -r '(.total_count // (.check_runs | length)) // 0' 2>/dev/null) || total=""
  case "$total" in ('' | *[!0-9]*) echo unknown; return 0 ;; esac
  [ "$total" -gt 0 ] || { echo unknown; return 0; }

  parked=$(printf '%s' "$json" | jq -r '[.check_runs[]? | select(.conclusion == "action_required")] | length' 2>/dev/null) || parked=""
  case "$parked" in ('' | *[!0-9]*) echo unknown; return 0 ;; esac

  if [ "$parked" -gt 0 ]; then echo parked; else echo ok; fi
}

# ── Parkerings-detektor: varsle når PR-en likevel står ──
# Erstatter #1469-fallbacken (tomt check-rollup → dispatch ci.yml + secret-scan
# selv), som var død kode: parkerte kjøringer FINNES, så guarden så «checkene
# fyrte av seg selv», og produsentene mangler uansett `actions: write` — den
# kunne aldri ha dispatchet noe. PAT-forfatterskap gjør dispatchen overflødig,
# men vi må SE det når PAT-en mangler eller er utløpt. Derfor denne.
#
# Exit 0 uansett utfall: PR-en finnes og er gyldig — det er kortet/CI som ikke
# kommer av seg selv. Bokføringen skal aldri rulles tilbake av dette.
robot_pr_verify_not_parked() { # rutine sha pr-url [ventetid]
  local routine="$1" sha="$2" pr_url="$3" wait_s="${4:-45}" verdict runs title

  # 45 s: samme ventetid #1469-fallbacken brukte, og nok for at GitHub har
  # REGISTRERT check-runs (parkerte eller ekte). Kortere ga tomt rollup på
  # blandede PR-er; lenger stjeler bare Actions-minutter.
  sleep "$wait_s"

  runs=$(gh api "repos/$REPO/commits/$sha/check-runs" 2>/dev/null) || runs=""
  verdict=$(printf '%s' "$runs" | robot_pr_classify_checks)

  if [ "$verdict" = "ok" ]; then
    echo "$routine: kjøringene startet uten godkjenning på $sha — kortet kommer av seg selv."
    return 0
  fi

  if [ "$verdict" = "parked" ]; then
    echo "::warning::$routine: kjøringene på $sha står som «Approve and run» (action_required). PR_AUTHOR_PAT mangler eller er utløpt."
  else
    echo "::warning::$routine: fant ingen lesbare check-runs på $sha etter ${wait_s}s — behandles som parkert (fail-loud, aldri stille grønn)."
  fi

  title="$routine: PR-en står med «Approve and run» — PAT mangler eller er utløpt"
  open_or_note_issue "$title" \
"Rutinen åpnet PR-en, men GitHub har parkert kjøringene — de står som «Approve
and run» og starter ikke av seg selv. Da nekter branch protection merge, og
Discord-kortet leser parkerte kjøringer som rødt, så det kommer heller ikke noe
kort.

PR-en: $pr_url

**Slik får du denne PR-en gjennom nå:**

1. **Hvor:** åpne PR-en over og velg fanen «Checks».
2. **Hva du gjør:** trykk den gule knappen «Approve and run workflows».
3. **Hva du forventer:** kjøringene starter, og PR-en blir grønn i løpet av noen
   minutter. Deretter kommer Discord-kortet som normalt.
4. **Hvis det ikke ser slik ut:** si fra her — da er det noe annet enn
   godkjenningen som stopper den.

**Slik slipper du å gjøre dette hver uke (engangsjobb):**

Secreten \`PR_AUTHOR_PAT\` mangler eller er utløpt. Uten den åpner robotene
PR-en som seg selv, og GitHub parkerer alt slikt siden juni 2026. Oppskriften
står i \`docs/loops/discord-pr-kort.md\`, seksjonen «Robot-åpnede PR-er må ha
menneskelig forfatter (#1701)».

Kjøring: $RUN_URL"

  bash .github/scripts/discord-notify.sh "⏸️ **$routine: PR-en venter på «Approve and run»** — $pr_url"
  return 0
}
