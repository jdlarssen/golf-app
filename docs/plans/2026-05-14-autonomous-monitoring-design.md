# Autonom overvåking av Vercel / Supabase / Resend

**Dato:** 2026-05-14
**Status:** Godkjent
**Mål:** Sett opp en autonom Claude-agent som overvåker prod, fikser trygge feil selv, og åpner PR for resten — slik at Jørgen kan godkjenne fra mobilen og pushe til prod uten å åpne IDE.

## Bakgrunn

Tørny er nå i prod (`v1.0.9`) med ekte spillere. Når noe feiler — server-action exception, mail-bounce, Supabase advisor-funn — bør det fanges, klassifiseres og fikses uten at Jørgen må sitte foran maskinen.

Vi har MCP-tilgang til Vercel (runtime logs, deploys), Supabase (postgres/auth-logger, advisors) og scheduled-tasks (cron-stil remote Claude-agenter). Resend gir email events via API. Alt nødvendig finnes allerede på free tier.

## Hovedvalg

| Valg | Beslutning |
|---|---|
| **Autonomi-nivå** | Hybrid: safe-list = direkte push, alt annet = PR med mobil-godkjenning |
| **Mobil-godkjenning** | GitHub mobil-appen (Approve i review-fanen) |
| **Cadence** | Hver time for monitor-agent, hver 15. min for PR-merge-watcher, daglig kl 08:00 for morgen-rapport |
| **Hvor agenten kjører** | `scheduled-tasks` MCP (Anthropic) — null GitHub Actions å vedlikeholde |
| **Modell** | Sonnet (sjekkliste-jobb, ikke skjønn) |
| **Notifikasjoner** | GitHub mobil-push for PRs + én Resend-mail kl 08:00 hvis det er noe å rapportere (stille natt = ingen mail) |

## Hvilke feil overvåkes

| Kilde | Hva |
|---|---|
| Vercel | Runtime errors (5xx, unhandled exceptions i server actions) siste 65 min |
| Supabase | Postgres-feil (failed queries, RLS denials), auth-feil (failed OTP, expired tokens) |
| Supabase advisors | Security + perf-lint-funn |
| Resend | Email events med `status ≠ delivered` (bounces, rejections) |

Bevisst utelatt for v1: slow requests, slow queries, sync-helse, spill-state-konsistens. Lett å legge til når vi ser hva som faktisk feiler.

## Safe-list (auto-push uten PR)

1. **Resend-retry/backoff-justering** — rate-limit eller transient 5xx fra Resend → legg til/justér retry-logikk i `lib/mail/*.ts`. Blast-radius: én mail får én ekstra sjanse.
2. **Copy-typos i norsk brukertekst** — ren tekst-endring i `.tsx`/`.ts`-strenger som matcher norske ord. Aldri identifikatorer eller logikk.
3. **Lint-warning fixes** — `prefer-const`, `no-unused-vars`, og lignende auto-fixable ESLint-funn.
4. **Defensive null-checks** — hvis stack-trace peker entydig på `Cannot read property of undefined`-linje, og fixen er `if (!x) return` eller `?.`-operator. Aldri "fix" som endrer happy-path-oppførsel.

### Begrensninger per safe-list-commit

- Maks 1 fil endret
- Maks 10 linjer endret
- Må kunne forklare fixen i én setning
- Hvis to safe-list-fixes i samme run: gjør én, observer prod 1 cycle (1 time), gjør neste
- Hvis fixen kommer tilbake innen 1 time med samme `fingerprint` → auto-pause, ikke prøv igjen

## Alltid PR (aldri auto-push)

- Alt i `lib/scoring/` (regel: krever ny test først)
- Alt i `supabase/migrations/` eller RLS-policies
- Alt i `proxy.ts` eller auth-flyten
- Alt i `lib/sync/`
- Alt som krever ny eller endret test
- Hvis agenten ikke er **>90% sikker** på root cause

## Arkitektur

Tre separate scheduled tasks, ikke én monolitt — fordi cadence er ulik og fordi en feil i én ikke skal ta ned de andre.

### 1. Hourly monitor (cron `0 * * * *`)

```
SAMLE (parallelle MCP-kall):
├─ Vercel runtime logs (siste 65 min)
├─ Supabase pg/auth logs (siste 65 min)
├─ Supabase advisors
└─ Resend email events (siste 65 min, status ≠ delivered)

Hvis null findings → exit umiddelbart, ingen state-skriving.

TRIAGE:
For hver feil-cluster:
├─ Beregn fingerprint (hash av source + normalisert error)
├─ Sjekk om fingerprint allerede finnes med resolved_at = null → skip
├─ Klassifiser: safe_fix / pr_worthy / needs_judgment
└─ Skriv til agent_findings

HANDLING:
├─ safe_fix → branch + commit + push til main + bump version
├─ pr_worthy → branch + commit + push + gh pr create
└─ needs_judgment → bare logg, surfaces i morgen-rapport
```

En heartbeat-rad skrives til `agent_runs` på 00:00-runen hvert døgn så vi vet agenten lever (selv på stille netter).

### 2. PR merge watcher (cron `*/15 * * * *`)

```
List åpne PRs merket auto:bot
For hver PR:
├─ Hvis approved av jdlarssen → squash-merge til main
├─ Hvis lukket uten merge → marker fingerprint som "avvist", legg i lærdom
└─ Ellers → vent
```

### 3. Morning report (cron `0 8 * * *`)

```
Les agent_findings fra siste 24 timer
Hvis tom → exit (ingen mail)
Ellers → send Resend-mail med tre seksjoner:
├─ Jeg fikset (auto-pushed med commit-lenker)
├─ Venter på deg (åpne PRs)
└─ Trenger vurdering (needs_judgment-funn)
```

## Datamodell

Ny migrasjon `0023_agent_monitoring.sql` — to tabeller, ingen RLS-policies (kun service_role-tilgang):

- `agent_runs(id, ran_at, agent_kind, duration_ms, findings_count, notes)`
- `agent_findings(id, run_id, detected_at, source, severity, fingerprint, summary, raw_payload, action_taken, action_ref, resolved_at)`

`fingerprint` for deduplisering. `raw_payload` (jsonb) lar oss re-investigere etter at Vercel-loggene er borte (1h retention).

## Mail-format (morgen-rapport)

```
Fra: Tørny Agent <agent@tornygolf.no>
Emne: Nattlig oppsummering — N fixet, M venter på deg

God morgen!

🤖 Jeg fikset (auto-push):
- HH:MM — [kort beskrivelse]. vX.Y.Z ([commit-lenke])

⏳ Venter på din godkjenning (PR):
- HH:MM — [kort beskrivelse]. ([PR-lenke])

🤔 Trenger din vurdering (ikke fixet):
- [kort beskrivelse]

Stille natt på alle andre fronter. N errors logget i går, M brukere påvirket.
```

Tre seksjoner droppes hvis tomme.

## Sikkerhets-mekanismer

1. **Kill-switch:** env-variabel `MONITORING_ENABLED` på Vercel. Når `false` → agent exiter ved oppstart. Settes fra Vercel-app på mobil, ingen deploy nødvendig.
2. **Cost cap:** maks 50k input-tokens per run. Hvis overskredet → commit det du har, exit.
3. **Auto-pause ved gjentakelse:** samme `fingerprint` auto-pushet < 1 time siden → ikke fix igjen, legg i morgen-rapport.
4. **Revert-spor:** alt logges med commit-sha eller PR-nummer. `git revert <sha>` på siste agent-commit ruller tilbake uten å miste andre endringer. Dokumenteres i `docs/launch-checklist.md`.

## Free tier-kompatibilitet

| Tjeneste | Krav | Free tier holder |
|---|---|---|
| Vercel | runtime logs siste 1h | Ja (Hobby), derav 1h cadence |
| Supabase | logs API + advisors | Ja (Free tier) |
| Resend | 3000 mail/mnd, events API | Ja (daglig rapport + invitasjons-mail < 100/mnd) |
| Anthropic | scheduled-tasks MCP | Bruker Jørgens Claude-abonnement |

## Hva som *ikke* er en del av v1

- Webhook-trigger (Resend webhook eller Vercel deploy-hook som vekker agenten umiddelbart) — fin oppgradering hvis 1h-cadence viser seg å være for tregt
- Push-notifs i Tørny-PWA i stedet for mail — overkill for et internt verktøy
- Slow request / slow query-deteksjon — vanskelig å definere autonomt uten støy
- Sync-helse og spill-state-konsistens-sjekker — legger til når vi vet hva som faktisk feiler

## Neste steg

Implementeringsplan i `docs/plans/2026-05-14-autonomous-monitoring-implementation.md` (kommer).
