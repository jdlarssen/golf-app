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
- **Postgres-feil siste 24 t** (`GET .../analytics/endpoints/logs`):
  ERROR/FATAL/PANIC talt per SQLSTATE-kode. Spørringen er ClickHouse-SQL mot
  `logs`-tabellen med `source = 'postgres_logs'`, og den henter bare kode og
  antall. Vinduet sendes eksplisitt med `iso_timestamp_start` og
  `iso_timestamp_end`, nøyaktig 24 t og kuttet til helt minutt. Uten dem
  leser API-et bare siste minutt.

Før 2026-09 var tellingen trolig blind (#2238). Det gamle kallet (BigQuery-SQL
mot det forrige logg-endepunktet) sendte ikke noe vindu og leste derfor bare
siste minutt, og ingen av signal-issuene fram til da hadde en postgres-telling.
Fra 2026-09-25 virket ikke kallet i det hele tatt, fordi Supabase hadde flyttet
loggene til ClickHouse.

**Personvern-regel (ufravikelig):** issues inneholder kun tellinger,
SQLSTATE-koder og advisory-nøkler, aldri rå logglinjer (de kan inneholde
brukerdata). Spørringen henter bare kode og antall, så et varsel om lesefeil
kan heller ikke få logglinjer med seg: det viser høyst 200 tegn av API-ets
feilsvar. Detalj-graving skjer read-only i interaktive økter via Supabase MCP.

## Baseline (`docs/loops/prod-vakta-baseline.txt`)

Én nøkkel per linje (#-linjer er kommentarer), av to slag:

- Advisory-`cache_key`: bevisste valg, f.eks. RLS på uten policies på admin-
  og agent-tabellene (tilsiktet service-role-lockdown).
- `pg:<SQLSTATE>` (f.eks. `pg:23505`): en type postgres-feil som er
  diagnostisert og godtatt. Den telles og vises i rapporten, men gir ikke
  varsel alene. Feil uten kode får nøkkelen `pg:-`.

Begge slag legges inn via PR med begrunnelse i commit-body, aldri ved stille
aksept. Forsvinner objektet eller feilkilden, fjerner du linja.

## Utfall per kjøring

| Situasjon | Utfall |
|---|---|
| Alt stille | Grønn exit med én logglinje, som også viser antall feil av kjente typer. Ingen issue |
| Nye advisories og/eller nye typer postgres-feil | Dedupet issue «Prod-vakt: signaler i prod-telemetrien» (label `prod-vakt` + `bug`, milestone 9). Nye koder står med antall, kjente koder på en egen linje. Kjente koder alene gir ikke issue |
| Telemetrien kunne ikke leses, eller svaret har feil form | Dedupet issue «Prod-vakt: fikk ikke lest telemetri» og rød kjøring. Varselet og jobbloggen viser HTTP-koden og et utdrag av API-svaret. Uovervåket prod er et funn, ikke støy |
| Workflowen selv krasjer | failure-steget filer «CI-vakt: prod-vakt-workflowen rød», men bare når skriptet ikke alt har filet eller funnet sitt eget issue. Én lesefeil gir ett issue |

## v2-kandidater (bygges når v1 har vist seg / behovet er bevist)

- **Auth-feillogger** (OTP-/innloggingsfeil) — krever verifisert
  auth_logs-spørring; utsatt for å holde første kjøring enkel.
- **Vercel runtime-feil** — krever at eier lager read-only VERCEL_TOKEN som
  Actions-secret; workflowen skipper Vercel-delen til den finnes.
- **Performance-advisors** — støyrisiko; vurderes etter noen uker med v1.
