#!/usr/bin/env bash
# Dok-skjema-jobb (#1122): regenererer den GENERERTE seksjonen i
# docs/schema-ground-truth.md fra live-skjemaet. Kjøres ukentlig fra GitHub
# Actions — som har SUPABASE_ACCESS_TOKEN — fordi sky-routinen (Nattkjøreren /
# Dok-avstemmeren) IKKE har tokenen og dermed ikke kan spørre databasene selv.
# Se docs/loops/dok-avstemmeren.md steg 1.
#
# Read-only: skriptet kjører KUN den kanoniske SELECT-spørringen (byte-identisk
# med dok-avstemmeren.md steg 1) og tar INGEN input — ingen injeksjonsflate.
# Management-API-endepunktet kan i prinsippet kjøre vilkårlig SQL, derfor er
# spørringen hardkodet her.
#
# Aldri direkte push til main: Actions omgår git-hookene (pre-push finnes ikke),
# så branch+PR-disiplinen ligger i skriptet selv. Diff → docs-PR (eieren merger).
#
# Fail-closed: klarer ikke skriptet å lese/validere skjemaet, filer det et
# dedupet varsel-issue og exit 1 — aldri stille grønn.

set -u

PROD_REF="glofubopddkjhymcbaph"
STAGING_REF="snwmueecmfqqdurxedxv"
API="https://api.supabase.com/v1/projects"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY må være satt}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/${GITHUB_RUN_ID:-?}"
DOC="docs/schema-ground-truth.md"
DATE="$(date -u +%Y-%m-%d)"
BRANCH="claude/dok-skjema-$DATE"

TMP="$(mktemp -d)"
DIFFREPORT="$TMP/diff.txt"
: > "$DIFFREPORT"
trap 'rm -rf "$TMP"' EXIT

# ── Den kanoniske spørringen — MÅ holdes byte-identisk med
#    docs/loops/dok-avstemmeren.md steg 1 (interaktive økter kjører samme SQL via MCP). ──
read -r -d '' SNAPSHOT_SQL <<'SQL'
select json_build_object(
  'rls', (select json_agg(json_build_object('tbl', relname, 'rls', relrowsecurity, 'policies', (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)) order by relname)
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='r'),
  'checks_total', (select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='c'),
  'checks_by_tbl', (select json_object_agg(tbl, n) from (select conrelid::regclass::text tbl, count(*) n from pg_constraint where connamespace='public'::regnamespace and contype='c' group by 1) s),
  'triggers', (select json_agg(json_build_object('tbl', t.tgrelid::regclass::text, 'name', t.tgname) order by t.tgrelid::regclass::text, t.tgname)
               from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and not t.tgisinternal),
  'secdef', (select json_agg(proname order by proname) from pg_proc where pronamespace='public'::regnamespace and prosecdef)
) as snapshot;
SQL

# ── Helpers (definert før bruk) ──

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
    -f "labels[]=documentation" \
    -F milestone=9 --jq '.html_url' \
    && bash .github/scripts/discord-notify.sh "📋 **$title**" || true
}

fail_closed() { # reason
  echo "FAIL-CLOSED: $1" >&2
  open_or_note_issue "Dok-skjema: fikk ikke regenerert skjema-snapshot" \
"Dok-skjema-jobben klarte ikke å lese/validere live-skjemaet: $1

Kjøring: $RUN_URL

Uten regenerering driver docs/schema-ground-truth.md fra virkeligheten. Behandles som et funn, ikke støy. Protokoll: docs/loops/dok-avstemmeren.md steg 1."
  exit 1
}

fetch_snapshot() { # ref -> skriver .snapshot-objektet til stdout, feiler ellers
  local ref="$1" body resp
  body=$(jq -cn --arg q "$SNAPSHOT_SQL" '{query:$q}')
  resp=$(curl -sf -X POST "$API/$ref/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body") || return 1
  # Management-API svarer med en rad-liste: [{"snapshot": {...}}]
  printf '%s' "$resp" | jq -e '.[0].snapshot' 2>/dev/null
}

report_unexpected_diffs() { # melder dedupet issue hvis render-scriptet fant avvik utover kjente
  [ -s "$DIFFREPORT" ] || return 0
  local list; list=$(cat "$DIFFREPORT")
  open_or_note_issue "Dok-skjema: uventet prod↔staging skjema-avvik" \
"Dok-skjema-jobben fant prod↔staging-avvik utover det kjente (\`rls_auto_enable\` kun i prod):

\`\`\`
$list
\`\`\`

Skjema-avvik er DB-arbeid, ikke docs-drift: bevisst → baseline i render-scriptet
(\`KNOWN_ONLY_PROD_SECDEF\` i .github/scripts/dok-skjema-render.py); reelt → migrasjon
som bringer staging/prod i sync. Kjøring: $RUN_URL"
}

# ── 1. Hent snapshots (prod to ganger for idempotens, staging én gang) ──
PROD_A="$TMP/prod_a.json"; PROD_B="$TMP/prod_b.json"; STAGING="$TMP/staging.json"
fetch_snapshot "$PROD_REF"    > "$PROD_A" || fail_closed "prod-snapshot svarte ikke (curl/JSON-feil mot $API/$PROD_REF/database/query)"
fetch_snapshot "$PROD_REF"    > "$PROD_B" || fail_closed "prod-snapshot (idempotens-kjøring 2) svarte ikke"
fetch_snapshot "$STAGING_REF" > "$STAGING" || fail_closed "staging-snapshot svarte ikke (curl/JSON-feil mot $API/$STAGING_REF/database/query)"

# ── 2. Assertions (rød = eskaler, aldri «tomt = OK») ──
# Idempotens: json_object_agg er uordnet, så vi sammenligner nøkkel-sorterte
# (kanoniske) former — data skal være stabil, ikke tilfeldig byte-rekkefølge.
if ! diff <(jq -S -c . "$PROD_A") <(jq -S -c . "$PROD_B") >/dev/null 2>&1; then
  fail_closed "idempotens-sjekk feilet — to prod-kjøringer ga ulik data (kanonisk sammenligning)"
fi

N_TABLES=$(jq '.rls | length' "$PROD_A" 2>/dev/null)
case "$N_TABLES" in (''|*[!0-9]*) fail_closed "klarte ikke lese tabell-antall fra prod-snapshot";; esac
if [ "$N_TABLES" -lt 30 ]; then
  fail_closed "tabell-antall $N_TABLES < 30 — traff sannsynligvis feil skjema/prosjekt"
fi

jq -e '
  (.rls | map(select(.tbl | IN("games","scores","users","game_players")))) as $core
  | ($core | length == 4) and ($core | all(.rls == true and .policies > 0))
' "$PROD_A" >/dev/null 2>&1 \
  || fail_closed "kjernetabell-assertion feilet — games/scores/users/game_players må finnes med rls=true og policies>0"

# ── 3. Generer ny seksjon + prod↔staging-diff-rapport ──
SECTION="$TMP/section.md"
python3 .github/scripts/dok-skjema-render.py "$PROD_A" "$STAGING" "$DIFFREPORT" "$DATE" > "$SECTION" \
  || fail_closed "seksjons-generatoren feilet (dok-skjema-render.py)"
[ -s "$SECTION" ] || fail_closed "generert seksjon ble tom"

# ── 4. Skriv seksjonen inn mellom markørene (erstatter START..SLUTT inklusiv) ──
# Marker-integritet FØR erstatning: nøyaktig én START og én SLUTT må finnes.
# Mangler/duplisert/omdøpt markør → awk ville stille no-op'e (kopiere fila
# uendret via !skip), og steg 5 ville se «ingen diff» og rapportere «allerede
# fersk» — en falsk grønn som permanent slår av regenereringen. Fail-closed i stedet.
start_n=$(grep -c 'GENERERT-SEKSJON-START' "$DOC")
slutt_n=$(grep -c 'GENERERT-SEKSJON-SLUTT' "$DOC")
if [ "$start_n" != 1 ] || [ "$slutt_n" != 1 ]; then
  fail_closed "markør-integritet i $DOC feilet (START=$start_n, SLUTT=$slutt_n; forventet 1/1) — regenerering ville stille no-op'e"
fi
awk -v nf="$SECTION" '
  index($0, "GENERERT-SEKSJON-START") { while ((getline l < nf) > 0) print l; skip=1; next }
  index($0, "GENERERT-SEKSJON-SLUTT") { skip=0; next }
  !skip { print }
' "$DOC" > "$DOC.tmp" || fail_closed "awk-erstatning i $DOC feilet"
# Etter erstatning bærer den nye seksjonen selv markørene → nøyaktig 1/1 skal stå igjen.
new_start=$(grep -c 'GENERERT-SEKSJON-START' "$DOC.tmp")
new_slutt=$(grep -c 'GENERERT-SEKSJON-SLUTT' "$DOC.tmp")
if [ "$new_start" != 1 ] || [ "$new_slutt" != 1 ]; then
  rm -f "$DOC.tmp"
  fail_closed "markør-antall etter erstatning avvek (START=$new_start, SLUTT=$new_slutt; forventet 1/1)"
fi
mv "$DOC.tmp" "$DOC" || fail_closed "mv av regenerert $DOC feilet"

# ── 5. Diff-guard: KUN docs/schema-ground-truth.md skal ha endret seg ──
CHANGED=$(git diff --name-only)
if [ -z "$CHANGED" ]; then
  echo "Dok-skjema: ingen diff — docs/schema-ground-truth.md er allerede fersk ($DATE)."
  report_unexpected_diffs   # avvik er DB-arbeid, ikke doc-drift — meldes uansett
  exit 0
fi
if [ "$CHANGED" != "$DOC" ]; then
  git checkout -- . 2>/dev/null || true
  fail_closed "diff-guard: uventede filer endret ($CHANGED) — kun $DOC skal røres"
fi

# ── 6. Åpne docs-PR (aldri direkte push til main). Maks ÉN åpen dok-skjema-PR. ──
EXISTING_PR=$(gh pr list --repo "$REPO" --state open --json headRefName \
  --jq '[.[] | select(.headRefName | startswith("claude/dok-skjema-"))] | length' 2>/dev/null || echo 0)
if [ "${EXISTING_PR:-0}" -gt 0 ]; then
  echo "En åpen dok-skjema-PR finnes allerede — hopper over ny PR (maks én)."
  git checkout -- . 2>/dev/null || true
  report_unexpected_diffs
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -b "$BRANCH" || fail_closed "klarte ikke lage branch $BRANCH"
git add "$DOC"
git commit -m "docs(schema): ukentlig regenerering av skjema-snapshot ($DATE)

Regenerert fra prod ($PROD_REF) via den kanoniske spørringen i
docs/loops/dok-avstemmeren.md steg 1 (Management-API, read-only SELECT).
Idempotens- og kjernetabell-assertions grønne; tabell-antall $N_TABLES.

Refs #1078" || fail_closed "commit feilet"
git push origin "$BRANCH" || fail_closed "push av $BRANCH feilet"

PR_BODY="$TMP/prbody.md"
cat > "$PR_BODY" <<EOF
Ukentlig regenerering av den GENERERTE seksjonen i \`docs/schema-ground-truth.md\`
fra live prod-skjemaet (\`$PROD_REF\`).

**Bevis-spørring:** den kanoniske SELECT-en i \`docs/loops/dok-avstemmeren.md\`
steg 1, kjørt read-only via Supabase Management-API.

**Assertions grønne:** idempotens (to prod-kjøringer, kanonisk lik), tabell-antall
$N_TABLES ≥ 30, kjernetabellene games/scores/users/game_players har rls=true og
policies>0.

Automatisk åpnet av dok-skjema-workflowen (#1122). Eieren merger etter review —
seksjonen er maskin-generert, så diffen er ren fakta-oppdatering.

Refs #1078
EOF
PR_URL=$(gh pr create --repo "$REPO" --base main --head "$BRANCH" \
  --title "docs(schema): ukentlig skjema-regenerering ($DATE)" \
  --body-file "$PR_BODY") || fail_closed "gh pr create feilet"

# Discord-kortet fyrer ikke av seg selv for docs-only-PR-er (ci.yml paths-ignore
# → ingen workflow_run, #1301) — dispatch det eksplisitt. Kort-workflowen venter
# selv på at checkene lander. Best-effort: et tapt kort fanges av morgenbriefen,
# så en dispatch-feil skal ikke felle en ellers vellykket kjøring.
PR_NUMBER="${PR_URL##*/}"
gh workflow run discord-pr-card.yml --repo "$REPO" -f pr="$PR_NUMBER" ||
  echo "::warning::dispatch av discord-pr-card for PR #$PR_NUMBER feilet — kortet kommer via morgenbriefen"

report_unexpected_diffs
echo "Dok-skjema: docs-PR åpnet på $BRANCH."
