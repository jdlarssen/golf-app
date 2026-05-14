# Feedback-inbox via GitHub Issues

**Dato:** 2026-05-14
**Status:** Godkjent
**Mål:** La Jørgen fange idéer og pilot-tilbakemeldinger raskt på mobilen, og få en autonom Claude-agent til å drodle på dem i bakgrunnen — uten å starte en chat-sesjon hver gang.

## Bakgrunn

Tørny er i pilot-fase post-`v1.0`. Idéer og forbedrings-forslag dukker opp ute på banen og fra pilot-spillere. Å starte en chat-sesjon for hver er friksjon. GitHub Issues + mobil-appen gir oss en eksisterende inbox-flate Jørgen allerede har installert (brukes til PR-godkjenning i autonom-overvåkings-systemet).

Dette er et separat design fra [autonom overvåking](2026-05-14-autonomous-monitoring-design.md), men deler kill-switch og scheduled-tasks-infrastruktur.

## Hovedvalg

| Valg | Beslutning |
|---|---|
| **Input-kanal** | GitHub Issues merket `feedback`, opprettet via GitHub mobil-app |
| **Output-kanal** | Kommentarer i samme issue-tråd |
| **Samtale-modus** | Ja — agenten svarer på Jørgens oppfølgings-kommentarer (B fra brainstorm) |
| **Eskalering** | `/plan`-kommentar → agenten åpner PR med design-doc; `/skip` lukker issue |
| **Cadence** | Hver 2. time (`0 */2 * * *`) |
| **Hvor agenten kjører** | `scheduled-tasks` MCP — samme infra som overvåkings-agentene |
| **Modell** | Opus — drodling krever skjønn, ikke sjekkliste |
| **Kill-switch** | Deler `MONITORING_ENABLED` env-var med overvåkings-agentene |
| **Notifikasjoner** | GitHub mobil-app sender push for nye kommentarer (innebygd, ingen Resend trengs) |

## Flyt

```
JØRGEN (på banen):
  GitHub mobil-app → tornygolf-repo → New Issue
  ├─ Tittel: kort beskrivelse
  ├─ Body: gjerne bare en setning
  └─ Label: feedback     (én ekstra tap)

AGENT (hver 2. time):
  gh issue list --label feedback --state open
  For hver issue:
    ├─ Hvis ikke label `drafted`:
    │   ├─ Les title + body
    │   ├─ Drodle: 2-3 mulige løsninger + anbefaling + størrelse
    │   ├─ Post kommentar med drodling
    │   └─ Legg på label `drafted`
    ├─ Hvis label `drafted` + ny kommentar fra @jdlarssen siden siste agent-kommentar:
    │   ├─ Les hele tråden (kontekst)
    │   ├─ Svar på Jørgens spørsmål / re-drodle
    │   └─ Post kommentar (ingen label-endring)
    └─ Hvis siste kommentar er fra Jørgen og inneholder /plan eller /skip:
        ├─ /plan → skriv docs/plans/<slug>-design.md + åpne PR
        │         Kommentér i issuen med PR-lenke
        │         Legg på label `planned`
        └─ /skip → lukk issue med kommentar "droppet av admin"

JØRGEN (på morgenkaffen):
  GitHub-app sender push-notif om ny kommentar
  Leser drodling, evt. svarer i tråden eller sier /plan
```

## Agent-prompt struktur

Én scheduled task med prompt i `agents/feedback-brainstormer.md`.

Prompt-sammendrag:

1. **Kill-switch:** sjekk `MONITORING_ENABLED`, exit hvis `false`
2. **Liste:** `gh issue list --label feedback --state open --json number,title,labels,comments`
3. **Filter:** dropper issues som er `planned` eller lukket; behandler kun de hvor handling er nødvendig (nye undrafted, eller drafted med ny @jdlarssen-kommentar siden siste agent-kommentar)
4. **Per issue:**
   - **Initial drodling:** drodle som i en brainstorming-sesjon — gather context, foreslå 2-3 retninger med tradeoffs, anbefal én, anslå størrelse (S/M/L). Post som kommentar. Sett label `drafted`.
   - **Follow-up:** les hele tråden, svar på siste @jdlarssen-kommentar. Hvis kommentaren slutter med `/plan` → eskaler.
   - **`/plan`-eskalering:** lag design-doc-PR (se under). Sett label `planned`.
   - **`/skip`-håndtering:** lukk issue med kommentar.
5. **Cost cap:** maks 50k input-tokens per run. Hvis nådd, fullfør gjeldende issue og exit. Resten plukkes opp neste run.
6. **Heartbeat:** ikke nødvendig — Jørgen ser direkte i GitHub om agenten har vært aktiv.

## `/plan`-eskalering

Når agenten ser `/plan` i siste Jørgen-kommentar:

1. `git clone` repo til midlertidig dir
2. Lag branch `agent/plan-issue-{N}`
3. Skriv `docs/plans/YYYY-MM-DD-issue-{N}-{slug}-design.md` basert på hele issue-tråden. Bruk samme struktur som overvåkings-design-doc (Goal / Hovedvalg / Arkitektur / Out of scope).
4. Commit med `docs(plans): design from feedback issue #N`
5. Push, åpne PR med label `auto:bot` + body som lenker tilbake til issuen
6. Kommentér i issuen: «Designet er drodlet → [PR #M](url)»
7. Sett label `planned` på issuen
8. PR-merge-watcher (eksisterende fra overvåkings-systemet) plukker opp PR-en når Jørgen approver

Etter at design-PR er merget, lager Jørgen impl-planen ved å starte en chat-sesjon («skriv impl-plan på <slug>-design.md»). Det skiljet er bevisst — design er ofte verdt å drodle på automatisk, implementering trenger oftere et raskt fram-og-tilbake.

## Hva som *ikke* er en del av v1

- **In-app feedback-flate** (B fra brainstorm) — egen `/admin/idé`-side i Tørny, lagrer til `feedback_items`-tabell. Bygges separat når GitHub-flyten begynner å føles begrensende eller når piloter trenger å sende inn idéer uten å ha GitHub-konto.
- **Real-time webhook-trigger** — Jørgens kommentar fyrer en webhook som vekker agenten innen sekunder. Fin oppgradering hvis 2h føles for tregt.
- **Anonym pilot-feedback** — krever B-flata, ikke aktuell før den finnes.
- **Auto-implementering** — `/plan` er det lengste agenten går. Implementering er fortsatt menneske-initiert via chat.

## Neste steg

Implementeringsplan: `docs/plans/2026-05-14-feedback-inbox-implementation.md`.
