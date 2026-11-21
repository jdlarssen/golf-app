#!/usr/bin/env bash
# PreToolUse:Bash-vakt for Tørny.
#
# Håndhever CLAUDE.md-reglene som git-hooks IKKE kan nå: merge-strategi, force-
# push og issue-oppretting skjer server-side eller omgår git-hooks (--no-verify).
# Leser PreToolUse-JSON på stdin, inspiserer kommandoen, og svarer med ÉN
# hookSpecificOutput-JSON på stdout (eller ingenting → verktøyet kjører normalt):
#
#   • DENY   prod-connstring / nettklient mot prod-Supabase / skrivende supabase-
#            CLI mot prod / prod-nøklene (.env.local) lastet inn i en kommando /
#            skript med prod-flagg (#1074) — engangs-luke: touch .claude/approve-prod
#   • DENY   --no-verify og git commit -n — omgår commit-msg/pre-commit/pre-push
#   • DENY   core.hooksPath pekt bort fra .githooks, GIT_CONFIG_*, ALLOW_MAIN_PUSH=1
#   • DENY   nye aliaser for git/gh, og endring av .githooks/ og .git/config fra skallet
#   • DENY   &, nohup, setsid, disown — løsrevne prosesser TaskStop ikke når
#   • DENY   gh pr merge med annet enn rebase (--squash/-s, --merge/-m) eller --admin
#   • DENY   merge utenom gh pr merge (gh api/curl mot …/pulls/N/merge, …/merges,
#            GraphQL-mergen, GraphQL lest fra fil) og endring av branch-beskyttelsen
#   • DENY   gh pr merge på bruker-synlig PR uten staging-verified/needs-manual-qa (#1303)
#   • DENY   git push --force/-f/+ref/--mirror på selve push-leddet (lease er OK, #2713)
#   • REMIND gh issue create uten --milestone (mandatory milestone-regel)
#   • REMIND gh pr create         README-friskhet + Closes #N i body
#
# Workflow-triggerne leses fra kommandoen slik skallet ville lest den (p09):
# anførselstegn og backslash løses opp, så et flagg er et flagg uansett hvordan
# det er skrevet, mens tekst med mellomrom i anførselstegn (en commit-melding, en
# PR-body) står igjen som «Q» og aldri utløser noe (#1074 defekt a). Sender
# kommandoen tekst videre til et skall eller en tolk (bash -c, eval, | sh,
# node -e), leses også teksten som kommando, i flere lag. En variabel som settes
# i samme kommando, settes inn der den brukes. Dette er beste evne, ikke et
# bevis: omveier vakta ikke kan følge, finnes — regelen (I7) gjelder uansett.
# Prod-reglene leses både mot kommandoen som skrevet (der er ref-en i en quotet
# URL nettopp det vi vil fange) og mot den oppløste; bruk --body-file for prosa
# som må nevne prod-detaljer.
#
# Hver deny/ask/remind logges som én JSONL-linje til .claude/logs/ (#1074).
#
# Testbar frittstående: ekko en PreToolUse-payload inn på stdin og les JSON-en ut.

PROD_REF="glofubopddkjhymcbaph"

cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

# Defekt (a)-fiks: workflow-triggere vurderes uten quotet innhold, så prosa i
# -m/--body-strenger ikke utløser dem. Newlines flates ut først — sed er
# linjebasert, og quotede strenger i commit-/PR-bodies spenner over flere linjer.
# Innholds-sjekker (Closes #, --milestone) og prod-reglene bruker fortsatt $cmd.
cmd_stripped="$(printf '%s' "$cmd" | tr '\n' ' ' | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"

# ── Kommandoen slik skallet leser den (p09) ──────────────────────────────────
# strip_heredocs: heredoc-kropper ut (tekst, ikke kommando) — og FØR anførsels-
# tegnene løses opp, ellers åpner en apostrof i teksten («don't») et sitat som
# sluker kommandoene etter heredoc-en.
strip_heredocs() {
  awk '
    skip { t=$0; sub(/^[ \t]+/, "", t); if (t == word) skip=0; next }
    match($0, /<<-?[ \t]*["'"'"']?[A-Za-z_][A-Za-z0-9_]*/) {
      w=substr($0, RSTART, RLENGTH); sub(/^<<-?[ \t]*["'"'"']?/, "", w)
      word=w; skip=1; print substr($0, 1, RSTART-1); next
    }
    { print }'
}

# shell_words <keep>: løser opp '…', "…" og backslash tegn for tegn. Et sitat
# uten mellomrom og skalltegn limes inn som det er ("--force" → --force,
# --no-ver""ify → --no-verify, "+$B" → +$B). Et sitat med mellomrom eller skalltegn er tekst
# og blir «Q» — unntatt når det inneholder $( eller `, som skallet kjører. Med
# keep=1 limes ALT inn: da er ingenting skjult. Mellomrom og tab slås sammen til
# ett mellomrom; linjeskift står. $'…' leses som skallet leser det (\x2d, \055
# og vanlige escapes dekodes); $"…" er et vanlig "…".
shell_words() {
  awk -v keep="$1" '
    function emit(code) {
      if (keep || code || span ~ /^[A-Za-z0-9_@%+=:,.\/${}-]*$/) add(span); else add("Q")
    }
    function add(str) { out = out str; if (str != "") last = substr(str, length(str), 1) }
    function numval(digits, base,   j, v) {
      v = 0
      for (j = 1; j <= length(digits); j++)
        v = v * base + index("0123456789abcdef", tolower(substr(digits, j, 1))) - 1
      return v
    }
    BEGIN { RS = "\001"; ORS = "" }
    {
      s = $0; n = length(s); out = ""; q = ""; span = ""; last = ""
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (q == "s") {
          if (c == "\047") { emit(0); q = "" } else span = span c
          continue
        }
        if (q == "a") {
          if (c == "\\" && i < n) {
            i++; e = substr(s, i, 1); num = ""
            if (e == "x") {
              while (length(num) < 2 && i < n && substr(s, i + 1, 1) ~ /[0-9A-Fa-f]/) { i++; num = num substr(s, i, 1) }
              span = span (num == "" ? "x" : sprintf("%c", numval(num, 16)))
            } else if (e ~ /[0-7]/) {
              num = e
              while (length(num) < 3 && i < n && substr(s, i + 1, 1) ~ /[0-7]/) { i++; num = num substr(s, i, 1) }
              span = span sprintf("%c", numval(num, 8))
            } else if (e == "n") span = span "\n"
            else if (e == "t") span = span "\t"
            else span = span e
            continue
          }
          if (c == "\047") { emit(0); q = "" } else span = span c
          continue
        }
        if (q == "d") {
          if (c == "\\" && i < n) { i++; span = span substr(s, i, 1); continue }
          if (c == "\"") { emit(span ~ /\$\(|`/); q = "" } else span = span c
          continue
        }
        if (c == "\\" && i < n) { i++; c2 = substr(s, i, 1); if (c2 != "\n") add(c2); continue }
        if (c == "$" && i < n && substr(s, i + 1, 1) == "\047") { i++; q = "a"; span = ""; continue }
        if (c == "$" && i < n && substr(s, i + 1, 1) == "\"") continue
        if (c == "\047") { q = "s"; span = ""; continue }
        if (c == "\"") { q = "d"; span = ""; continue }
        if (c == " " || c == "\t") { if (last != " " && last != "\n" && last != "") add(" "); continue }
        add(c)
      }
      if (q == "s" || q == "a") emit(0)
      if (q == "d") emit(span ~ /\$\(|`/)
      print out
    }'
}

# expand_simple: de enkleste omveiene skallet selv løser opp. ${X:-verdi} blir
# verdien, og en variabel som settes i SAMME kommando (X=verdi; … $X) settes inn
# der den brukes. Beste evne: en variabel satt et annet sted ser vakta ikke.
expand_simple() {
  sed -E 's/\$\{[A-Za-z_][A-Za-z0-9_]*:?[-=+]([^}]*)\}/\1/g' | awk '
    function replace_all(text, needle, value,   at, res) {
      res = ""
      while ((at = index(text, needle)) > 0) {
        res = res substr(text, 1, at - 1) value
        text = substr(text, at + length(needle))
      }
      return res text
    }
    # $NAME, men ikke $NAMEX: tegnet etter navnet kan ikke være en del av et navn.
    function replace_bare(text, name, value,   at, res, needle, nxt) {
      res = ""; needle = "$" name
      while ((at = index(text, needle)) > 0) {
        nxt = substr(text, at + length(needle), 1)
        res = res substr(text, 1, at - 1) (nxt ~ /[A-Za-z0-9_]/ ? needle : value)
        text = substr(text, at + length(needle))
      }
      return res text
    }
    BEGIN { RS = "\001"; ORS = "" }
    {
      s = $0; rest = s; count = 0
      while (count < 20 && match(rest, /(^|[ ;&|(\n])[A-Za-z_][A-Za-z0-9_]*=[^ ;&|\n)]+/)) {
        pair = substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH)
        sub(/^[ ;&|(\n]/, "", pair)
        eq = index(pair, "=")
        names[++count] = substr(pair, 1, eq - 1); values[count] = substr(pair, eq + 1)
      }
      for (k = 1; k <= count; k++) {
        s = replace_all(s, "${" names[k] "}", values[k])
        s = replace_bare(s, names[k], values[k])
      }
      print s
    }'
}

# Alt innhold synlig: anførselstegn løses opp i tre runder, så et flagg i
# anførselstegn INNI tekst som sendes til et skall (bash -c '… "-f" …') også
# står igjen som et flagg.
cmd_all="$(printf '%s' "$cmd" | shell_words 1 | shell_words 1 | shell_words 1 | expand_simple)"

# Sender kommandoen tekst videre til et skall (bash -c, eval, | sh, bash <<EOF,
# env -S) eller en tolk (node -e, python -c)? Da er teksten kommando, og alt
# leses. Mønsteret tåler flagg mellom navnet og -c (bash --norc -c, bash -o
# pipefail -c) og leses både fra kommandoen som skrevet og med anførselstegn
# løst opp ("bash" -c).
cmd_flat="$(printf '%s' "$cmd" | tr '\n' ' ')"
cmd_all_flat="$(printf '%s' "$cmd_all" | tr '\n' ' ')"
SHELL_WRAP_RE='(^|[^[:alnum:]_.-])(ba|z|da|k|fi)?sh[[:space:]]+([^[:space:];&|]+[[:space:]]+)*-[A-Za-z]*c([[:space:]]|$)|(^|[^[:alnum:]_.-])eval[[:space:]]|\|[[:space:]]*(ba|z|da|k)?sh([[:space:]]|$)|(^|[^[:alnum:]_.-])(ba|z|da|k)?sh[[:space:]]*(-s[[:space:]]*)?<<|(^|[^[:alnum:]_.-])env[[:space:]]+([^[:space:];&|]+[[:space:]]+)*(-[A-Za-z]*S|--split-string)|(^|[^[:alnum:]_.-])su[[:space:]]+([^[:space:];&|]+[[:space:]]+)*-c([[:space:]]|$)'
CODE_WRAP_RE='(^|[^[:alnum:]_.-])(node|tsx|ts-node|python[0-9.]*|perl|ruby|deno|bun|php)[[:space:]]+([^[:space:];&|]+[[:space:]]+)*(-e|-c|-p|-r|--eval|--print)([[:space:]=]|$)'
shell_wrap=""
code_wrap=""
if printf '%s' "$cmd_flat" | grep -Eq "$SHELL_WRAP_RE" || printf '%s' "$cmd_all_flat" | grep -Eq "$SHELL_WRAP_RE"; then
  shell_wrap=1
fi
if printf '%s' "$cmd_flat" | grep -Eq "$CODE_WRAP_RE" || printf '%s' "$cmd_all_flat" | grep -Eq "$CODE_WRAP_RE"; then
  code_wrap=1
fi
if [ -n "$shell_wrap" ] || [ -n "$code_wrap" ]; then
  cmd_norm="$cmd_all"
else
  cmd_norm="$(printf '%s\n' "$cmd" | strip_heredocs | shell_words 0 | expand_simple)"
fi
# Ett ledd per linje (; & | og linjeskift skiller ledd).
norm_segments="$(printf '%s\n' "$cmd_norm" | sed -E 's/[0-9]*>&[0-9-]*/ /g; s/&>/ /g' | tr ';&|' '\n\n\n')"
# `git <globale flagg> <underkommando>` — også med full sti (/usr/bin/git).
GIT_LEAD='(^|[[:space:](){!`])([^[:space:]]*/)?git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+'

# Logg-prefiks: 80 tegn, med hemmeligheter redaktert FØR trunkering —
# userinfo i URL-er (postgres://user:pw@ → ://***@), verdier etter
# apikey/authorization/password/token, og JWT-lignende eyJ…-strenger.
prefix="$(printf '%s' "$cmd" | tr '\n' ' ' | sed -E \
  -e 's#://[^@[:space:]]+@#://***@#g' \
  -e 's/((apikey|Apikey|APIKEY|authorization|Authorization|AUTHORIZATION|password|Password|PASSWORD|token|Token|TOKEN)[=: ]+)[^[:space:]"]+/\1***/g' \
  -e 's/((bearer|Bearer|BEARER)[ ]+)[^[:space:]"]+/\1***/g' \
  -e 's/eyJ[A-Za-z0-9._-]+/***/g')"
prefix="$(printf '%.80s' "$prefix")"

log_event() { # rule decision
  local dir="${CLAUDE_PROJECT_DIR:-.}/.claude/logs"
  {
    mkdir -p "$dir" && jq -cn \
      --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg hook "bash-guard" --arg rule "$1" --arg decision "$2" --arg prefix "$prefix" \
      '{ts:$ts,hook:$hook,rule:$rule,decision:$decision,prefix:$prefix}' >> "$dir/guard-events.jsonl"
  } 2>/dev/null || true
}

emit_deny() { log_event "$1" "deny"; jq -cn --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
emit_ask()  { log_event "$1" "ask";  jq -cn --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'; exit 0; }
emit_ctx()  { log_event "$1" "remind"; jq -cn --arg c "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'; exit 0; }

# Engangs-godkjenning for prod (speiler mcp-guard.sh): sentinel < 10 min eller env.
# find -mmin har lik semantikk på BSD/macOS og GNU; stat-flaggene divergerer.
approved() {
  [ "${APPROVE_PROD:-}" = "1" ] && return 0
  local f="${CLAUDE_PROJECT_DIR:-.}/.claude/approve-prod"
  [ -f "$f" ] || return 1
  if [ -n "$(find "$f" -mmin -10 2>/dev/null)" ]; then
    rm -f "$f"
    return 0
  fi
  return 1
}

PROD_DENY_TEXT="Prod-brannmur (#1074): direkte DB-/API-trafikk mot prod-Supabase fra shell er blokkert. Sanksjonerte veier: staging-DB for testing, Supabase MCP get_logs/list_tables for lesing, npm run gen:types for typer. Eier-godkjent prod-operasjon? touch .claude/approve-prod og gjenta (engangs, 10 min)."

# ── DENY: prod-rettet shell-trafikk (#1074). Vurderes som ETT sjekkpunkt slik at
# en kommando som matcher flere mønstre bare konsumerer engangs-godkjenningen én gang. ──
prod_rule=""
prod_extra=""
# «.env.local» som eget filnavn (med eller uten sti og anførselstegn) — ikke
# .env.staging.local og ikke .env.local.example.
ENV_LOCAL='["'"'"']?([^[:space:]"'"'"'=]*/)?\.env\.local(["'"'"'[:space:];&|)]|$)'
# Reglene leses to ganger: mot kommandoen som skrevet (der en ref i en quotet URL
# skal treffes), og mot kommandoen med anførselstegn og backslash løst opp, så
# et filnavn eller flagg som er delt opp (".env"".local", --pro""d) er det samme.
prod_classify() { # tekst → setter prod_rule/prod_extra
  local t="$1"
  if printf '%s' "$t" | grep -Eq "postgres(ql)?://[^[:space:]]*${PROD_REF}"; then
    # postgres-connstring mot prod — psql read-only kan ikke klassifiseres trygt
    prod_rule="prod-connstring"
  elif printf '%s' "$t" | grep -Eq "(curl|wget|psql|pg_dump|pg_restore)" && printf '%s' "$t" | grep -q "${PROD_REF}"; then
    # Nettklient + prod-ref hvor som helst i kommandoen (også via en variabel).
    prod_rule="prod-http"
  elif printf '%s' "$t" | grep -Eq "(^|[^[:alnum:]_])(node|deno|bun|tsx|python[0-9.]*|ruby|perl|php|nc|ncat|openssl)([^[:alnum:]_]|$)" && printf '%s' "$t" | grep -q "${PROD_REF}\.supabase\.co"; then
    # Tolk + prod-URL: et skript på én linje er også en nettklient.
    prod_rule="prod-http"
  elif printf '%s' "$t" | grep -Eq -- "--env-file[= ]+${ENV_LOCAL}|(^|[[:space:];&|(])(source|\.)[[:space:]]+${ENV_LOCAL}|dotenv[^;&|]*[[:space:]]-e[[:space:]]+${ENV_LOCAL}|DOTENV_CONFIG_PATH=${ENV_LOCAL}|\\\$\((cat|grep|sed|awk)[^)]*\.env\.local"; then
    # .env.local holder prod-nøklene. Lastes den inn i en kommando, står
    # kommandoen mot prod uten at ref-en er synlig.
    prod_rule="prod-env-file"
    prod_extra=" .env.local peker på prod. Bruk .env.staging.local for testing."
  elif printf '%s' "$t" | grep -Eq -- "provision-review-account[^;&|]*--env[= ]+[\"']?prod|backfillResultSummaries[^;&|]*--prod([[:space:]\"';&|]|$)"; then
    prod_rule="prod-script"
    prod_extra=" Skriptet er bedt om å skrive til prod."
  elif printf '%s' "$t" | grep -Eq "(^|[[:space:];&|])(npx[[:space:]]+)?supabase[[:space:]]" && printf '%s' "$t" | grep -q "$PROD_REF" \
    && ! printf '%s' "$t" | grep -Eq "supabase[[:space:]]+(gen|inspect)[[:space:]]"; then
    # supabase-CLI mot prod, unntatt read-only gen/inspect (gen:types er lov)
    prod_rule="prod-supabase-cli"
    prod_extra=" supabase-CLI mot prod er kun lov for 'gen'/'inspect' (read-only)."
  fi
}
prod_classify "$cmd"
[ -z "$prod_rule" ] && prod_classify "$cmd_all"
if [ -n "$prod_rule" ]; then
  if approved; then
    log_event "$prod_rule" "allow-prod-approved"
  else
    emit_deny "$prod_rule" "$PROD_DENY_TEXT$prod_extra"
  fi
fi

# ── DENY: --no-verify (omgår commit-msg/pre-commit/pre-push) ──
# Tre veier inn: den gamle delstreng-sjekken (beholdt uendret), flagget slik
# skallet leser det (også forkortet — git godtar entydige forkortelser), og
# kortformen -n på git commit (git push -n er tørrkjøring og er lov).
no_verify=""
case "$cmd_stripped" in *--no-verify*) no_verify=1 ;; esac
printf '%s\n' "$norm_segments" | grep -E "${GIT_LEAD}" | grep -Eq -- '--no-v(e(r(i[a-z]*)?)?)?([[:space:])=]|$)' && no_verify=1
printf '%s\n' "$norm_segments" | grep -E "${GIT_LEAD}commit([[:space:]]|\$)" \
  | grep -Eq '(^|[[:space:]])-[A-Za-z]*n[A-Za-z]*([[:space:])]|$)' && no_verify=1
if [ -n "$no_verify" ]; then
  emit_deny "no-verify" "CLAUDE.md forbyr --no-verify (og kortformen git commit -n): det omgår commit-msg/pre-commit/pre-push-gatene (versjonering, Refs #N, Dexie-vakt, typecheck/lint/test). Fiks årsaken i stedet. Ekte nødssituasjon? La eier kjøre den manuelt."
fi

# ── DENY: git-hookene koblet ut eller pekt et annet sted (p09) ──
# core.hooksPath skal være .githooks (bindings §T9). Lesing og den ene
# sanksjonerte skrivingen er lov; alt annet som setter verdien — git -c, git
# config, GIT_CONFIG_*-variabler — nektes. ALLOW_MAIN_PUSH=1 er pre-push-hookens
# nødutgang og er eierens, ikke agentens (bindings §Enforcement).
hooks_off=""
printf '%s\n' "$norm_segments" | tr '[:upper:]' '[:lower:]' | grep -E "${GIT_LEAD}" | grep -F 'core.hookspath' \
  | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
  | grep -Evq '^git config( --(worktree|local|get))* core\.hookspath( \.githooks)?$' && hooks_off=1
printf '%s' "$cmd_norm" | grep -Eq -- 'GIT_CONFIG_(COUNT|KEY_|VALUE_|GLOBAL|SYSTEM|PARAMETERS)|--config-env' && hooks_off=1
if [ -n "$hooks_off" ]; then
  emit_deny "hooks-path" "Git-hookene skal ligge i .githooks: core.hooksPath kan ikke settes til noe annet, verken med git -c, git config eller GIT_CONFIG_*-variabler. Lov: «git config core.hooksPath» (lesing) og «git config --worktree core.hooksPath .githooks» (bindings §T9). Feiler en hook, fiks årsaken."
fi
if printf '%s' "$cmd_norm" | grep -Eq 'ALLOW_MAIN_PUSH=[^0[:space:]]'; then
  emit_deny "allow-main-push" "ALLOW_MAIN_PUSH=1 er eierens nødutgang forbi «aldri direkte push til main» og brukes ikke av agenter (bindings §Enforcement). Push grenen og åpne en PR."
fi

# ── DENY: aliaser for git og gh (p09) ──
# Et alias gir en kommando et nytt navn, og da ser ikke reglene under hva som
# faktisk kjøres. Å lese et alias er lov; å lage eller endre ett er det ikke.
if printf '%s\n' "$norm_segments" | grep -E "${GIT_LEAD}" \
    | grep -Eiq '(^|[[:space:]])alias\.[^[:space:]=]+(=|[[:space:]]+[^[:space:]])' \
  || printf '%s\n' "$norm_segments" | grep -Eq '(^|[[:space:](){!`])([^[:space:]]*/)?gh[[:space:]]+alias[[:space:]]+(set|import|delete)([[:space:]]|$)'; then
  emit_deny "alias" "Aliaser for git og gh lages ikke i en agentøkt: et alias skjuler hvilken kommando som kjøres. Skriv kommandoen fullt ut."
fi

# ── DENY: hookfilene og .git/config endret fra skallet (p09) ──
# .githooks/ er vaktene som kjører ved commit og push, og .git/config sier hvor
# de ligger. En endring i en hook hører hjemme i en PR (stien er eier-merge) og
# gjøres med redigeringsverktøyet, der den synes i diffen. Lesing er lov, og
# chmod +x på en ny hook er lov.
HOOK_FILES='(\.githooks|\.git/config|\.git/hooks)'
if printf '%s\n' "$norm_segments" | grep -Eq -- ">>?[[:space:]]*[^[:space:]]*${HOOK_FILES}" \
  || printf '%s\n' "$norm_segments" | grep -Eq -- "(^|[[:space:](){!\`])(tee|rm|mv|truncate|ln|install|unlink|rmdir|dd)[[:space:]]([^>]*[[:space:]=])?[^[:space:]>]*${HOOK_FILES}" \
  || printf '%s\n' "$norm_segments" | grep -Eq -- "(^|[[:space:](){!\`])(sed|perl)[[:space:]].*-[A-Za-z]*i.*${HOOK_FILES}" \
  || printf '%s\n' "$norm_segments" | grep -Eq -- "(^|[[:space:](){!\`])cp[[:space:]].*[[:space:]][^[:space:]]*${HOOK_FILES}[^[:space:]]*[[:space:]]*\$" \
  || printf '%s\n' "$norm_segments" | grep -Eq -- "(^|[[:space:](){!\`])chmod[[:space:]]+([^[:space:]]+[[:space:]]+)*(-[A-Za-z]*x[A-Za-z]*|[ugoa]*-[rwxXst]*x[rwxXst]*|[0-7]?[0246][0-7][0-7])[[:space:]].*(\.githooks|\.git/hooks)"; then
  emit_deny "hook-files" "Hookfilene (.githooks/) og .git/config endres ikke fra skallet. Skal en hook endres, gjør det med redigeringsverktøyet i en PR, der endringen synes i diffen (stien er eier-merge). Lesing og chmod +x på en ny hook er lov."
fi

# ── DENY: prosesser som løsrives fra økta (&, nohup, setsid, disown) ──────────
# En server startet med `&` eller i et subshell overlever økta og kan ikke
# stoppes med TaskStop; byggere får ikke drepe prosesser, så eieren måtte kjøre
# kill for hånd (Metro på 8090 og next-server på 3328, 25.10). Harnessets egen
# bakgrunn (Bash run_in_background: true) setter ingen & i kommandoen og slipper
# gjennom. `&&`, `>&`, `&>` og `|&` er ikke bakgrunn; `… & … & wait` er korte
# parallelle jobber som venter på seg selv og er lov.
# Heredoc-kropper ut først (samme awk som merge-sjekken under): «Tom & Jerry» i
# en commit-melding skrevet med <<EOF er tekst, ikke bakgrunn.
detach_scan="$(printf '%s\n' "$cmd" | awk '
  skip { t=$0; sub(/^[ \t]+/, "", t); if (t == word) skip=0; next }
  match($0, /<<-?[ \t]*["'"'"']?[A-Za-z_][A-Za-z0-9_]*/) {
    w=substr($0, RSTART, RLENGTH); sub(/^<<-?[ \t]*["'"'"']?/, "", w)
    word=w; skip=1; print substr($0, 1, RSTART-1); next
  }
  { print }' | tr '\n' ' ' | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" \
  | sed -E 's/&&/ /g; s/[0-9]*>&[0-9-]*/ /g; s/&>/ /g; s/\|&/ /g')"
detached=""
case "$detach_scan" in
  *"&"*) printf '%s' "$detach_scan" | grep -Eq '(^|[[:space:];&|])wait([[:space:];]|$)' || detached=1 ;;
esac
printf '%s' "$detach_scan" | grep -Eq '(^|[[:space:];&|(])(nohup|setsid|disown)([[:space:];)]|$)' && detached=1
# Tekst som sendes til et skall (bash -c "… &") er kommando: samme regel på den.
if [ -n "$shell_wrap" ]; then
  wrap_scan="$(printf '%s' "$cmd_all" | tr '\n' ' ' | sed -E 's/&&/ /g; s/[0-9]*>&[0-9-]*/ /g; s/&>/ /g; s/\|&/ /g')"
  case "$wrap_scan" in
    *"&"*) printf '%s' "$wrap_scan" | grep -Eq '(^|[[:space:];&|])wait([[:space:];]|$)' || detached=1 ;;
  esac
  printf '%s' "$wrap_scan" | grep -Eq '(^|[[:space:];&|(])(nohup|setsid|disown)([[:space:];)]|$)' && detached=1
fi
if [ -n "$detached" ]; then
  emit_deny "detached-process" "Prosesser som løsrives fra økta (&, nohup, setsid, disown, ( … ) &) er sperret: de kan ikke stoppes med TaskStop, og da må eieren drepe dem for hånd. Start servere (Metro, next dev/start, expo) med Bash-verktøyets run_in_background: true — uten & i kommandoen — og stopp dem med TaskStop når du er ferdig. Korte parallelle jobber er lov hvis kommandoen avsluttes med wait."
fi

# ── DENY: e-postadresser i noe som publiseres til GitHub (#1929) ──────────────
# Repoet er offentlig, og en adresse som først er postet kan ikke tas tilbake:
# GitHub beholder redigeringshistorikken til en kommentar, git beholder gamle
# commits. Derfor blokk, ikke advarsel.
#
# Skanner BÅDE den inline quotede bodyen (derfor $cmd, ikke $cmd_stripped) og
# fila som --body-file/--input peker på — lekkasjen i #1909 gikk gjennom
# --body-file, som en ren kommandostreng-sjekk aldri ville sett.
case "$cmd_stripped" in
  *"gh issue create"*|*"gh issue comment"*|*"gh issue edit"*|\
  *"gh pr create"*|*"gh pr comment"*|*"gh pr edit"*|*"gh pr review"*|\
  *"gh release create"*|*"gh gist create"*|*"gh api"*)
    scanner="${CLAUDE_PROJECT_DIR:-.}/.githooks/scan-emails.sh"
    if [ -x "$scanner" ]; then
      body_text="$cmd"
      for f in $(printf '%s' "$cmd" | tr '\n' ' ' \
                 | sed -nE 's/.*(--body-file|--input)[= ]+"?([^ "'"'"']+)"?.*/\2/p'); do
        [ -f "$f" ] && body_text="$body_text
$(cat "$f" 2>/dev/null)"
      done
      leaks="$(printf '%s' "$body_text" | "$scanner" 2>/dev/null)" || {
        emit_deny "email-leak" "E-postadresse i noe som skal publiseres til GitHub: $(printf '%s' "$leaks" | tr '\n' ' '). Repoet er OFFENTLIG, og en postet adresse kan ikke tas tilbake — GitHub beholder redigeringshistorikken til kommentarer. Bruk ROLLEN i stedet («review-kontoen», «admin-kontoen», «e2e-spilleren») — det er også det leseren trenger. Skal adressen virkelig kunne stå, legg et mønster i .githooks/email-allowlist.txt med begrunnelse. Se #1929."
      }
    fi ;;
esac

# ── gh pr merge: DENY squash (rebase-only), DENY bruker-synlig PR uten stagingbevis (#1303) ──
# Squash sjekkes først og uendret (substring-match). Stagingporten slår bare til
# når `gh pr merge` står som en EGEN kommando — i starten eller etter ; & | eller
# linjeskift — med heredoc-innhold fjernet og quotede strenger erstattet av Q.
# Da slipper echo/heredoc/PR-body-prosa som bare nevner mergen (16 av 25 logg-
# hendelser før #1303 var slike falske treff).
#
# Bruker-synlig = samme regel som knapp-kortet (lib/loops/autoMerge.ts
# isUserVisibleByCommits): ≥1 commit med feat|fix|perf-prefiks uten
# [no-changelog]. Regexen under holdes i takt med TS-kopien av
# tests/hooks/prMergeParity.test.ts — endre begge i samme commit.
#
# Fail-open til påminnelse: ukjent PR, annet repo/mappe, gh/nett/JSON-feil.
# BASH_GUARD_PR_JSON peker på en stub-fil med `gh pr view --json labels,commits`-
# utdata (fixture-harnessen, ingen nettavhengighet).
USER_VISIBLE_PREFIX_RE='^(?:feat|fix|perf)(?:\([^)]*\))?!?:'
PR_MERGE_REMIND_TEXT="Stagingbevis-porten (#1076/#1303): er PR-en bruker-synlig (feat/fix/perf-commit uten [no-changelog])? Da skal labelen staging-verified være satt før merge — hvis ikke, kjør staging-verify-skillet på PR-nummeret først (eller sett needs-manual-qa med begrunnelse i en kommentar). Docs/chore/refactor/test-PR-er passerer fritt."

# ── DENY: merge utenom `gh pr merge`, og endring av branch-beskyttelsen (p09) ──
# Mergen går gjennom `gh pr merge --rebase`, der strategi- og stagingsjekken
# under ser den. Samme merge via GitHubs API (gh api / curl mot …/pulls/N/merge
# eller …/merges, GraphQL-mutasjonene) går forbi begge og nektes. Det samme
# gjelder endring av beskyttelsen på en gren. Lesing (GET uten felt) er lov.
if printf '%s' "$cmd_all" | grep -Eq '(^|[^[:alnum:]_.-])(gh[[:space:]]+api|curl|wget)([[:space:]]|$)'; then
  api_flat="$(printf '%s' "$cmd_all" | tr '\n' ' ')"
  api_write=""
  printf '%s' "$api_flat" | grep -Eiq -- '(-X|--method|--request)[[:space:]=]*(PUT|POST|PATCH|DELETE)|(^|[[:space:]])(-f|-F|--field|--raw-field|--input|-d|--data[a-z-]*|--json)([[:space:]=]|$)' && api_write=1
  if printf '%s' "$api_flat" | grep -Eq 'mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest'; then
    emit_deny "api-merge" "Merge skjer bare med «gh pr merge <N> --rebase --delete-branch», der vakta kan sjekke strategi og stagingbevis. Merge via GraphQL-API-et er sperret."
  fi
  # GraphQL lest fra en fil kan vakta ikke lese: da vet den ikke om det er en merge.
  if printf '%s' "$api_flat" | grep -Eq '(^|[^[:alnum:]_])graphql([^[:alnum:]_]|$)' \
    && printf '%s' "$api_flat" | grep -Eq -- '=@|--input([[:space:]=]|$)|(-d|--data[a-z-]*)[[:space:]=]*@'; then
    emit_deny "api-graphql-file" "GraphQL-kall der spørringen leses fra en fil, er sperret: vakta kan ikke se om kallet er en merge. Skriv spørringen rett i kommandoen (-f query='…')."
  fi
  if [ -n "$api_write" ] && printf '%s' "$api_flat" | grep -Eq 'pulls/[^/[:space:]]+/+merge|repos/[^[:space:]/]+/[^[:space:]/]+/merges([^A-Za-z]|$)'; then
    emit_deny "api-merge" "Merge skjer bare med «gh pr merge <N> --rebase --delete-branch», der vakta kan sjekke strategi og stagingbevis. Merge via REST-API-et er sperret. Vil du bare se om PR-en er merget: gh pr view <N> --json state,mergedAt."
  fi
  if { [ -n "$api_write" ] && printf '%s' "$api_flat" | grep -Eq 'branches/[^[:space:]/]+/protection|/rulesets'; } \
    || printf '%s' "$api_flat" | grep -Eq '(create|update|delete)BranchProtectionRule|(create|update|delete)RepositoryRuleset'; then
    emit_deny "branch-protection" "Beskyttelsen på grenene (krav om grønn CI før merge) er eierens. Den endres ikke fra en agentøkt."
  fi
fi

# `gh pr merge` slik skallet leser den: full sti til gh → gh, og
# `gh pr -R <repo> merge` → `gh pr merge -R <repo>`.
merge_norm="$(printf '%s\n' "$cmd_norm" | sed -E 's#(^|[[:space:](){!`;&|])[^[:space:];&|]*/gh #\1gh #g; s#gh pr (-R|--repo)[ =]([^[:space:]]+) merge#gh pr merge -R \2#g')"
has_merge=""
case "$cmd_stripped" in *"gh pr merge"*) has_merge=1 ;; esac
case "$merge_norm" in *"gh pr merge"*) has_merge=1 ;; esac
case "$has_merge" in
  1)
    case "$cmd_stripped" in
      *"gh pr merge"*--squash*|*--squash*"gh pr merge"*) emit_deny "squash-merge" "Squash brukes ikke i Tørny (mister granulær audit-trail per commit). Bruk: gh pr merge --rebase --delete-branch. Se CLAUDE.md → «Branch + PR-flyt»." ;;
    esac
    # Bare rebase (p09): --squash/-s og --merge/-m, også klynget (-sd) og i
    # anførselstegn. --admin går forbi kravene på grenen og er eierens.
    merge_lines="$(printf '%s\n' "$merge_norm" | tr ';&|' '\n\n\n' | grep -E 'gh pr merge')"
    if printf '%s\n' "$merge_lines" | grep -Eq -- '(^|[[:space:]])(--squash|--merge|-[A-Za-z]*[sm][A-Za-z]*)([[:space:]=]|$)'; then
      emit_deny "squash-merge" "Tørny merger bare med rebase (squash og merge-commit mister granulær audit-trail per commit). Bruk: gh pr merge --rebase --delete-branch. Se CLAUDE.md → «Branch + PR-flyt»."
    fi
    if printf '%s\n' "$merge_lines" | grep -Eq -- '(^|[[:space:]])--admin([[:space:]=]|$)'; then
      emit_deny "merge-admin" "gh pr merge --admin går forbi kravene på grenen (grønn CI) og er eierens. Vent på grønn CI, eller be eieren merge."
    fi
    # Kommandoskillere → linjeskift. merge_norm har heredoc-kropper ute og
    # tekst i anførselstegn som Q (se shell_words).
    cmd_segments="$(printf '%s\n' "$merge_norm" | tr ';&|' '\n\n\n')"
    # Prefikser som fortsatt kjører mergen: ( { ! $( ` then/do/else, env/command/
    # sudo/time/exec/eval, bash -c og NAME=verdi. Fire runder holder for realistisk
    # stabling; avsluttende ) } ` fjernes så `$(… 5)` ikke gir PR-argumentet «5)».
    run_prefix='^[[:space:]]*(\$\(|[({!`]|(then|do|else|env|command|sudo|time|exec|eval)[[:space:]]|(ba|z|da|k)?sh[[:space:]]+(-[A-Za-z]+[[:space:]]+)*-[A-Za-z]*c[[:space:]]|[A-Za-z_][A-Za-z0-9_]*=\$\(|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]$(]*[[:space:]])'
    cmd_segments="$(printf '%s\n' "$cmd_segments" | sed -E \
      -e "s/${run_prefix}//" -e "s/${run_prefix}//" -e "s/${run_prefix}//" -e "s/${run_prefix}//" \
      -e 's/[)}`[:space:]]+$//')"
    merge_seg="$(printf '%s\n' "$cmd_segments" | grep -E '^[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)' | head -n1)"
    # Sikkerhetsnett: står mergen ukvotert i en form vi ikke gjenkjenner (og ikke
    # som echo/printf-tekst), får den minst dagens påminnelse — aldri mindre vern
    # enn før #1303.
    if [ -z "$merge_seg" ] && printf '%s\n' "$cmd_segments" | grep -E 'gh[[:space:]]+pr[[:space:]]+merge' \
      | grep -Evq '^[[:space:]]*(echo|printf|#)'; then
      emit_ctx "pr-merge-staging" "$PR_MERGE_REMIND_TEXT"
    fi
    if [ -n "$merge_seg" ]; then
      # Posisjonelt argument (nummer, URL eller branch); flagg med verdi hoppes over.
      pr_arg="" other_repo=""
      set -f
      set -- $merge_seg
      set +f
      shift 3
      while [ $# -gt 0 ]; do
        case "$1" in
          -R|--repo) [ "${2:-}" != "jdlarssen/golf-app" ] && other_repo=1; shift; [ $# -gt 0 ] && shift; continue ;;
          --repo=*) [ "${1#--repo=}" != "jdlarssen/golf-app" ] && other_repo=1 ;;
          -b|--body|-F|--body-file|-t|--subject|-A|--author-email|--match-head-commit) shift; [ $# -gt 0 ] && shift; continue ;;
          -*) : ;;
          *) [ -z "$pr_arg" ] && pr_arg="$1" ;;
        esac
        shift
      done
      case "$pr_arg" in
        https://github.com/*) case "$pr_arg" in https://github.com/jdlarssen/golf-app/*) : ;; *) other_repo=1 ;; esac ;;
      esac
      # cd inn i en annen mappe enn golf-app før mergen → ikke vår PR å sperre.
      cd_other="$(printf '%s\n' "$cmd_segments" | grep -E '^[[:space:]]*cd[[:space:]]' | grep -v 'golf-app' | head -n1)"
      if [ -n "$other_repo" ] || [ -n "$cd_other" ]; then
        emit_ctx "pr-merge-staging" "$PR_MERGE_REMIND_TEXT"
      fi
      if [ -n "${BASH_GUARD_PR_JSON:-}" ]; then
        pr_json="$(cat "$BASH_GUARD_PR_JSON" 2>/dev/null)"; pr_rc=$?
      elif [ -n "$pr_arg" ]; then
        pr_json="$(gh pr view "$pr_arg" --json number,labels,commits 2>/dev/null)"; pr_rc=$?
      else
        pr_json="$(gh pr view --json number,labels,commits 2>/dev/null)"; pr_rc=$?
      fi
      if [ "$pr_rc" -ne 0 ] || [ -z "$pr_json" ]; then
        # Uten PR-nummer og uten PR på gjeldende branch: dagens påminnelse.
        [ -z "$pr_arg" ] && emit_ctx "pr-merge-staging" "$PR_MERGE_REMIND_TEXT"
        emit_ctx "pr-merge-staging" "$PR_MERGE_REMIND_TEXT Klarte ikke sjekke labelen — verifiser selv."
      fi
      verdict="$(printf '%s' "$pr_json" | jq -r --arg re "$USER_VISIBLE_PREFIX_RE" '
        ([.labels[]?.name] | any(. == "staging-verified" or . == "needs-manual-qa")) as $cleared
        | ([.commits[]?
            | ((.messageHeadline // "") | gsub("^\\s+|\\s+$"; "") | test($re; "i"))
              and (((.messageHeadline // "") + "\n\n" + (.messageBody // "")) | contains("[no-changelog]") | not)]
           | any) as $visible
        | if $cleared then "cleared" elif $visible then "block" else "internal" end' 2>/dev/null)"
      case "$verdict" in
        block)
          emit_deny "pr-merge-staging" "Stagingbevis-sperren (#1303): PR-en er bruker-synlig (minst én feat/fix/perf-commit uten [no-changelog]) og mangler både staging-verified og needs-manual-qa. Gjør ett av to og kjør mergen på nytt: (1) kjør staging-verify-skillet på PR-nummeret — det setter staging-verified; eller (2) kan PR-en ikke staging-verifiseres i nettleseren (app-PR, prod-migrasjon, e-post), eller ba eieren om merge uten staging-test: sett labelen needs-manual-qa (gh pr edit <N> --add-label needs-manual-qa) og skriv begrunnelsen i en PR-kommentar, f.eks. «eier ba om merge uten staging-test». Se docs/agent-discipline/bindings.md §Enforcement." ;;
        cleared|internal)
          log_event "pr-merge-staging" "allow" ;;
        *)
          emit_ctx "pr-merge-staging" "$PR_MERGE_REMIND_TEXT Klarte ikke sjekke labelen — verifiser selv." ;;
      esac
    fi ;;
esac

# ── DENY: git push --force / -f, men IKKE --force-with-lease (som rebase-flyten bruker) ──
# Bare selve `git push`-leddet leses (#2713): kommandoen deles ved ; & | og linjeskift,
# og -f/--force/+refspec vurderes kun i ledd som er en git push. Før stod `rm -f x && git push`
# som force-push, og en ask i en bakgrunnsøkt står fast til eieren kobler seg på
# (#2347, 29.10). Et ekte force-push nektes i stedet for å spørre: ingen kan svare
# på en ask der, og eieren sa ja til nekt 31.10. Heredoc-kropper er borte og tekst
# i anførselstegn er «Q» før delingen (norm_segments), så en commit-melding som
# nevner «git push -f» er tekst — mens "--force", "+gren", /usr/bin/git og
# bash -c "git push -f" leses som det skallet kjører (p09). Forkortelsen --forc
# og --mirror (overskriver alt på remote) teller som force.
force_seg="$(printf '%s\n' "$norm_segments" | grep -E "${GIT_LEAD}push([[:space:]]|\$)" \
  | sed -E 's/--force-with-lease(=[^[:space:]]*)?//g; s/--force-if-includes//g; s/--follow-tags//g' \
  | grep -E -- '(^|[[:space:]])(--f[a-z-]*|--mirror|-[A-Za-z]*f[A-Za-z]*|\+[^[:space:]]+)([[:space:])]|$)' | head -n1)"
if [ -n "$force_seg" ]; then
  emit_deny "force-push" "git push --force/-f er nektet (CLAUDE.md: «Aldri force-push uten god grunn»). --force-with-lease fra rebase-flyten er OK og blokkeres ikke. Trenger grenen en omskriving: push til en NY gren (git push origin HEAD:refs/heads/<ny-gren>), eller be eieren kjøre force-pushen selv."
fi

# ── REMIND: gh issue create uten --milestone ──
case "$cmd_stripped" in
  *"gh issue create"*)
    case "$cmd" in
      *--milestone*) : ;;
      *) emit_ctx "issue-milestone" "Mandatory: hvert nytt issue MÅ ha en milestone (CLAUDE.md → «Milestone på alle nye issues»). Legg til --milestone \"<tittel>\", eller default til «Backlog — uplanlagt / scale-triggered» og si fra i svaret. Mojibake-felle: Tier 1/Tier 5-titlene matcher ikke på navn — sett da via nummer: gh api -X PATCH repos/jdlarssen/golf-app/issues/N -F milestone=<num>." ;;
    esac ;;
esac

# ── REMIND: gh pr create — README-friskhet + Closes #N ──
# Defekt (b)-fiks: substring-match (fanger «cd x && gh pr create»), som issue-regelen.
case "$cmd_stripped" in
  *"gh pr create"*)
    closes_note=""
    case "$cmd" in
      *"Closes #"*|*"closes #"*|*--body-file*|*"-F "*) : ;;
      *) closes_note=" Body ser ut til å mangle «Closes #N» — det er den autoritative auto-close-triggeren ved merge." ;;
    esac
    emit_ctx "pr-create" "You are running gh pr create — packaging a branch for review. Run git diff origin/main...HEAD and check whether anything README.md documents has changed: user-facing capabilities (Hva du far), the stack table, the local-dev or test commands, the cited test or migration counts, or the architecture notes (Hvordan det henger sammen). If so: update README.md, run the humanizer skill on any new or changed Norwegian copy (and the no-nb skill if you translated from English) per docs/copy-style.md, then commit and push it so it lands in THIS PR before you create it.${closes_note} Most PRs need no README change; only touch it when one of those documented facts actually changed." ;;
esac

# ── REMIND: gh issue comment N når tråden ALT har en closing-/leveransekommentar (#1907) ──
# Eierregel 2026-09-02 (etter #1884): én closing-kommentar per issue. Finnes en
# (## Teknisk / ## Funksjonell — typisk byggeøktas «Bygget på PR #M — venter på
# merge»), skal den KORRIGERES med PATCH, ikke dupliseres. Nudge, ikke deny:
# kontrakt-, port- og spørsmålskommentarer skal fortsatt kunne postes. Fail-open:
# uten issue-nummer, gh eller nett skjer ingenting. BASH_GUARD_ISSUE_COMMENTS_JSON
# peker på en stub-fil med kommentar-arrayet (fixture-harnessen, ingen nettavhengighet).
case "$cmd_stripped" in
  *"gh issue comment"*)
    issue_no="$(printf '%s' "$cmd_stripped" | sed -nE 's/.*gh issue comment[^0-9]*([0-9]+).*/\1/p')"
    if [ -n "$issue_no" ]; then
      if [ -n "${BASH_GUARD_ISSUE_COMMENTS_JSON:-}" ]; then
        comments_json="$(cat "$BASH_GUARD_ISSUE_COMMENTS_JSON" 2>/dev/null)"
      else
        comments_json="$(gh api "repos/{owner}/{repo}/issues/${issue_no}/comments?per_page=100" 2>/dev/null)"
      fi
      # Heading på LINJESTART — en kontrakt som nevner «`## Teknisk`» i en
      # setning er ikke en closing-kommentar (falsk positiv funnet i null-testen).
      closing_ids="$(printf '%s' "$comments_json" | jq -r 'if type == "array" then [.[] | select((.body // "") | test("(^|\n)## (Teknisk|Funksjonell)")) | .id] | join(", ") else "" end' 2>/dev/null)"
      if [ -n "$closing_ids" ]; then
        emit_ctx "issue-closing-duplicate" "Issue #${issue_no} har allerede en closing-/leveransekommentar (id ${closing_ids}). CLAUDE.md §Closing-kommentar (eierregel #1907): poster du en closing-kommentar nå, blir det en dublett. Gå heller gjennom den eksisterende og korrigér det som ikke lenger står seg — merge-status + SHA, prod-migrasjon, avvik — med: gh api -X PATCH repos/{owner}/{repo}/issues/comments/${closing_ids%%,*} --input <json-fil med body>. Andre kommentartyper (kontrakt, port, spørsmål, funn) er upåvirket."
      fi
    fi ;;
esac

exit 0
