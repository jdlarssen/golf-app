# Prod-vakta — prod-telemetri inn i loopene (epic #1073, loop 8)

Tetter ferie-gapet: appen er i ekte bruk, og runtime-feil skal ikke vente på at
en kompis sender eieren melding. En daglig GitHub Actions-cron leser
prod-telemetri **read-only** og gjør signaler om til issues — som CI-vakta og
interaktive økter deretter diagnostiserer og fikser.

## Arkitektur (to trinn, med vilje)

1. **Signal-fangst (`.github/workflows/prod-vakt.yml` + `.github/scripts/prod-vakt.sh`):**
   kjører i Actions fordi prod-tokenen (SUPABASE_ACCESS_TOKEN) allerede bor
   trygt i Actions-secrets — den skal ALDRI inn i routine-miljøer (de er
   synlige for alle som kan redigere miljøet). Daglig 03:30 UTC, før
   Morgenbriefen, slik at funn rekker inn i dagens brief.
2. **Diagnose og fiks:** åpne `prod-vakt`-issues plukkes opp av CI-vaktas
   timelige kjøringer (docs/loops/ci-vakta.md → «Prod-vakt-issues») og av
   interaktive økter. Fiksing av bugs har stående eier-fullmakt; alt uklart
   eskaleres på norsk.

## Hva som leses (v1)

- **Security-advisors** (`GET /v1/projects/{ref}/advisors/security`) — diffes
  mot baseline-fila (under). Kun NYE nøkler er signal.
- **Postgres-feil siste 24 t** (`GET .../analytics/endpoints/logs.all` med
  count-spørring på ERROR/FATAL/PANIC) — kun TELLINGEN rapporteres.

**Personvern-regel (ufravikelig):** issues inneholder kun tellinger og
advisory-nøkler — aldri rå logglinjer (de kan inneholde brukerdata).
Detalj-graving skjer read-only i interaktive økter via Supabase MCP.

## Baseline (`docs/loops/prod-vakta-baseline.txt`)

Én advisory-`cache_key` per linje (#-linjer er kommentarer). Nøkler her er
BEVISSTE valg (f.eks. RLS-på-uten-policies på admin-/agent-tabellene =
tilsiktet service-role-lockdown). Nye advisories som viser seg å være bevisste
→ legg nøkkelen hit via PR med begrunnelse i commit-body — aldri stille
aksept. Fjernes et objekt, rydd nøkkelen.

## Utfall per kjøring

| Situasjon | Utfall |
|---|---|
| Alt stille | Grønn exit med én logglinje — ingen issue |
| Nye advisories og/eller feiltellinger > 0 | Dedupet issue «Prod-vakt: signaler i prod-telemetrien» (label `prod-vakt` + `bug`, milestone 9) |
| Telemetri kunne ikke leses | Dedupet issue «Prod-vakt: fikk ikke lest telemetri» + rød kjøring — uovervåket prod er et funn, ikke støy |
| Workflowen selv krasjer | failure-steget filer «CI-vakt: prod-vakt-workflowen rød» |

## v2-kandidater (bygges når v1 har vist seg / behovet er bevist)

- **Auth-feillogger** (OTP-/innloggingsfeil) — krever verifisert
  auth_logs-spørring; utsatt for å holde første kjøring enkel.
- **Vercel runtime-feil** — krever at eier lager read-only VERCEL_TOKEN som
  Actions-secret; workflowen skipper Vercel-delen til den finnes.
- **Performance-advisors** — støyrisiko; vurderes etter noen uker med v1.
