# Feedback-inbox — Implementeringsplan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bygg en autonom brainstorming-agent som plukker opp GitHub Issues merket `feedback`, drodler i kommentar-tråden, og åpner design-PR ved `/plan`-trigger — som beskrevet i [designdokumentet](2026-05-14-feedback-inbox-design.md).

**Architecture:** Én ny scheduled task via `mcp__scheduled-tasks__create_scheduled_task`, drevet av Opus (drodling krever skjønn). Agenten leser GitHub via `gh` CLI og opererer på issues + kommentarer. Ingen ny TypeScript-kode — alt skjer i agent-prompten. Deler `MONITORING_ENABLED` kill-switch og PR-merge-watcher med overvåkings-systemet.

**Tech Stack:** `gh` CLI, scheduled-tasks MCP, GitHub mobil-app for input/godkjenning.

**Avhengighet:** Phase 4 (kill-switch) og Phase 5 (PR merge watcher) fra [autonom overvåking](2026-05-14-autonomous-monitoring-implementation.md) bør være på plass først — denne planen bygger oppå.

**Subagent-routing:** Prompt-tasks (1, 2) → implementer på Sonnet, reviewer på **Opus** (prompt-design krever skjønn). Setup (3) → Sonnet. Smoke-test (4, 5) → Sonnet.

---

## Phase 1 — GitHub-konfigurasjon

### Task 1: Opprett labels og verifiser GitHub-tilgang

**Files:** ingen — dette er en GitHub-side-konfigurasjon.

**Step 1: Opprett labels via gh CLI**

```bash
gh label create feedback --description "Idé eller forbedring fra pilot eller admin" --color FBCA04
gh label create drafted --description "Agenten har postet initial drodling" --color 0E8A16
gh label create planned --description "Agenten har åpnet design-PR" --color 1D76DB
```

(Label `auto:bot` finnes allerede fra autonom-overvåkings-tasken.)

**Step 2: Verifiser labels eksisterer**

```bash
gh label list | grep -E "feedback|drafted|planned"
```

Expected: alle tre vises i lista.

**Step 3: Test issue-opprettelse manuelt fra mobilen**

Jørgen åpner GitHub-app, lager test-issue:
- Title: "TEST — slett denne"
- Body: "test fra mobil"
- Label: `feedback`

Verifiser fra terminalen at issuen vises:

```bash
gh issue list --label feedback
```

Lukk test-issuen etterpå:

```bash
gh issue close <nummer> --comment "test ferdig"
```

Ingen commit i denne tasken.

---

## Phase 2 — Agent-prompt

### Task 2: Skriv feedback-brainstormer prompt

**Files:**
- Create: `agents/feedback-brainstormer.md`

**Step 1: Skriv prompten**

```markdown
# Tørny Feedback Brainstormer

Du er Tørny sin idé-drodlings-agent. Du kjører hver 2. time via
scheduled-tasks. Jobben din er å plukke opp idé-issues fra Jørgen
(og senere piloter), drodle på dem i kommentar-tråden, og eskalere
til design-PR når Jørgen sier `/plan`.

## Kill-switch

FØRST: les env-variabel `MONITORING_ENABLED` fra Vercel. Hvis `false` → exit
umiddelbart, ingen handling.

## Step 1: List relevante issues

```bash
gh issue list --label feedback --state open --json number,title,body,labels,comments,author
```

Filtrer bort:
- Issues som har label `planned` (allerede eskalert til design-PR)
- Issues hvor author IKKE er `jdlarssen` og kun for v1 — pilot-issues håndteres senere

For hver gjenværende issue, hent full kommentar-tråd:

```bash
gh issue view <number> --json title,body,comments,labels
```

## Step 2: Klassifiser handling per issue

Tre kategorier:

**A. UNDRAFTED** — issue mangler label `drafted`
→ Initial drodling. Gå til Step 3a.

**B. FOLLOW-UP** — issue har `drafted`, og siste kommentar er fra `jdlarssen` og er nyere enn siste kommentar fra GitHub Actions / Claude-agent
→ Svar på Jørgens kommentar. Gå til Step 3b.

**C. PLAN-TRIGGER** — siste @jdlarssen-kommentar inneholder `/plan` på egen linje (case-insensitive)
→ Eskaler til design-PR. Gå til Step 3c. (Overstyrer A og B — hvis både ny og `/plan`, gjør 3c.)

**D. SKIP-TRIGGER** — siste @jdlarssen-kommentar inneholder `/skip` på egen linje
→ Lukk issue med en kort bekreftelse. Gå til Step 3d.

**E. IGNORE** — alt annet (ingen handling).

## Step 3a: Initial drodling

Drodle som i en brainstorming-sesjon. Skriv en GitHub-kommentar med denne strukturen:

```
**Drodling — [tittel-essens i 5 ord]**

[Kort kontekst: hva jeg forstår av forslaget. 1-2 setninger.]

**Mulige retninger:**

- **A. [navn]** — [beskrivelse]. Tradeoff: [hva som ofres].
- **B. [navn]** — [beskrivelse]. Tradeoff: [hva som ofres].
- **C. [navn]** — [beskrivelse]. Tradeoff: [hva som ofres].

**Anbefaling:** [A/B/C] fordi [grunn]. Estimert størrelse: [S | M | L]
(S = noen timer, M = en dag, L = flere dager).

**Spørsmål tilbake:** [1-2 åpne spørsmål for å pin-pointe scope, hvis relevant]

Si `/plan` når du vil at jeg skal åpne en design-PR for valgt retning,
eller `/skip` for å droppe denne.
```

Post via:

```bash
gh issue comment <number> --body-file <(echo "...")
```

Etterpå: legg på label `drafted`:

```bash
gh issue edit <number> --add-label drafted
```

## Step 3b: Follow-up-svar

Les hele tråden. Forstå Jørgens siste kommentar i kontekst av tidligere drodling.
Skriv et fokusert svar — kort, direkte. Hvis han spør om noe, svar. Hvis han
redirigerer, drodle om i den nye retningen.

Avslutt alltid svaret med:

```
Si `/plan` for å låse inn denne retningen, eller fortsett å spørre.
```

Ingen label-endring.

## Step 3c: `/plan`-eskalering

Når siste Jørgen-kommentar inneholder `/plan`:

1. `git clone git@github.com:jdlarssen/golf-app.git /tmp/golf-feedback-<n>`
2. `cd /tmp/golf-feedback-<n>`
3. `git checkout -b agent/plan-issue-<n>`
4. Skriv `docs/plans/YYYY-MM-DD-issue-<n>-<slug>-design.md` basert på HELE
   issue-tråden (alle kommentarer, hele konteksten). Struktur:
   - `# [Tittel]`
   - **Dato / Status / Mål**
   - **Bakgrunn** (lenke til issue: `#<n>`)
   - **Hovedvalg** (tabell)
   - **Arkitektur** (skissert)
   - **Out of scope**
   - **Neste steg** (impl-plan TODO)
5. `git add docs/plans/...` + `git commit -m "docs(plans): design from feedback issue #<n>"`
6. `git push origin agent/plan-issue-<n>`
7. `gh pr create --title "Design: <kort tittel>" --body "Drodlet fra issue #<n>.\n\nSe kontekst der." --label "auto:bot"`
8. Kommentér i issuen:
   ```bash
   gh issue comment <n> --body "Designet er drodlet → PR #<m>. Merge den når du er enig (eller kommentér her hvis noe må endres)."
   ```
9. Legg på label `planned`:
   ```bash
   gh issue edit <n> --add-label planned
   ```

Den eksisterende PR-merge-watcheren (fra autonom-overvåkings-systemet)
plukker opp PR-en når Jørgen approver i GitHub mobil-app.

## Step 3d: `/skip`-håndtering

```bash
gh issue comment <n> --body "Droppet av admin. Lukker."
gh issue close <n>
```

## Step 4: Cost cap

Hvis du har brukt > 50,000 input-tokens i denne runen, fullfør gjeldende issue
og exit. Resten plukkes opp neste run.

## Step 5: Logging

Ingen state-skriving til Supabase. GitHub Issues ER state — kommentarer,
labels, og PR-er er sporbart der.

Hvis du brukte tid på noe i denne runen (ikke alt var i ignore-bøtta), logg
en kort sammendrag til stdout slik at scheduled-tasks-loggen kan inspiseres
ved feilsøking. Format:
```
RUN SUMMARY: drafted=N, followup=M, planned=K, skipped=L, ignored=I
```
```

**Step 2: Verifiser fil eksisterer**

```bash
ls agents/feedback-brainstormer.md
wc -l agents/feedback-brainstormer.md
```

Expected: > 100 linjer.

**Step 3: Commit**

```bash
git add agents/feedback-brainstormer.md
git commit -m "chore(agent-monitor): add feedback-brainstormer prompt"
```

**Reviewer:** Opus-review for prompt-kvalitet — særlig step 2-klassifisering, step 3a-output-format og `/plan`-eskaleringen. Sjekk at:
- Klassifiserings-logikken har ingen smutthull (hva hvis Jørgen kommenterer `/plan` i en undrafted issue? Step 2 sier `/plan` overstyrer)
- `/plan`-output følger Tørny CLAUDE.md-konvensjoner (design-doc-struktur, branch-navn)
- Drodlings-formatet i 3a er kort nok til å være lesbart i GitHub-app

---

## Phase 3 — Deploy

### Task 3: Installer scheduled task via MCP

**Files:** ingen kode — runtime side-effect.

**Step 1: Les prompt-filen**

```bash
cat agents/feedback-brainstormer.md
```

**Step 2: Kall scheduled-tasks MCP**

I en Claude-sesjon med MCP-tilgang:

```
mcp__scheduled-tasks__create_scheduled_task med:
  name: "tørny-feedback-brainstormer"
  schedule: "0 */2 * * *"
  prompt: <full content of agents/feedback-brainstormer.md>
```

**Step 3: Verifiser**

```
mcp__scheduled-tasks__list_scheduled_tasks
```

Expected: ny task vises med korrekt cron og navn.

Ingen git-commit — dette er en runtime-handling.

---

## Phase 4 — Smoke test

### Task 4: End-to-end test med en test-issue

**Step 1: Lag test-issue fra mobilen**

Jørgen åpner GitHub-app, lager issue:
- Title: "TEST: skal det være lyd når man legger inn slag?"
- Body: "Idé fra dagens runde — kort tone når man trykker submit."
- Label: `feedback`

**Step 2: Trigger agenten manuelt**

Via scheduled-tasks MCP «run now»-funksjon på `tørny-feedback-brainstormer`.

**Step 3: Verifiser initial drodling**

Innen 2 minutter:
- Issue skal ha ny kommentar fra agenten med drodlings-format (A/B/C-retninger + anbefaling)
- Issue skal ha label `drafted` lagt på
- Jørgen får push-notif fra GitHub-app

**Step 4: Test follow-up**

Jørgen kommenterer fra mobil: "Hva med vibrasjon i stedet for lyd?"

Trigger agenten igjen manuelt.

**Step 5: Verifiser follow-up-svar**

Innen 2 minutter:
- Ny kommentar fra agenten som svarer spesifikt på vibrasjon-spørsmålet
- Ingen ny label

**Step 6: Test `/plan`-eskalering**

Jørgen kommenterer fra mobil: "OK, /plan på vibrasjon-versjonen"

Trigger agenten igjen.

**Step 7: Verifiser design-PR**

Innen 3 minutter:
- Ny PR åpnet med label `auto:bot` og tittel `Design: ...`
- PR inneholder `docs/plans/2026-05-14-issue-<n>-...-design.md`
- Issuen har ny kommentar med PR-lenke
- Issuen har label `planned`

**Step 8: Cleanup**

```bash
gh pr close <pr-number> --delete-branch
gh issue close <issue-number> --comment "smoke test ferdig"
```

---

### Task 5: Smoke test kill-switch

**Step 1: Set MONITORING_ENABLED=false på Vercel**

Manuelt via Vercel-dashboard.

**Step 2: Lag en ny test-issue + trigger agenten**

**Step 3: Verifiser at agenten ikke gjorde noe**

- Ingen ny kommentar på issuen
- Stdout-logg fra scheduled-task viser kill-switch-melding

**Step 4: Set MONITORING_ENABLED=true igjen**

**Step 5: Trigger på nytt, verifiser normal drift**

Cleanup test-issuen.

---

## Done criteria

- `tørny-feedback-brainstormer` task er live og synlig i `list_scheduled_tasks`
- End-to-end smoke test bestått (drodle → follow-up → `/plan` → design-PR)
- Kill-switch-test bestått
- Én ekte feedback-issue fra Jørgen er drodlet på og eskalert til design-PR
  (vent på organisk forekomst, ikke fabriker)

## Out of scope (post-v1)

- In-app feedback-flate (`/admin/idé`-side) — separat design senere
- Anonym pilot-feedback (krever in-app flate)
- Real-time webhook-trigger på issue-kommentarer (Vercel-route fra GitHub webhook → fyrer agenten umiddelbart)
- Auto-implementering etter merget design-PR (Jørgen starter chat manuelt for impl-plan)
