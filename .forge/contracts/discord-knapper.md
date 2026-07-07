# Spec: Discord-knappene — toveis loop-styring fra mobilen

**Issue:** opprettes (milestone 13) · **Branch:** claude/discord-knapper (bygges i egen økt — krever eier-oppsettsteg midtveis)

## Problem

Eieren får nå varsler og brief i Discord (utgående, #1117/PR #1118), men svar krever fortsatt GitHub: merge, A/B-beslutninger, natt-kø-godkjenning. Målet: hele dagligdriften fra Discord — les melding, trykk knapp. Eier-mandat gitt 2026-07-08.

## Research Findings (scoutet i kodebasen + Discord-plattformkrav)

- `app/api/*` er allerede unntatt auth-porten (proxy.ts matcher: `(?!...api/...)`) → nytt endepunkt er offentlig-rutbart uten proxy-endring.
- Etablert route-mønster: `app/api/cron/start-scheduled-games/route.ts` — `process.env` direkte, Bearer-sjekk, `NextResponse`, `export const maxDuration`, LOG_PREFIX-konvensjon, INGEN `export const runtime` (cacheComponents forbyr det — kun `npm run build` fanger bruddet).
- **Discord-constraint:** vanlige kanal-webhooks kan IKKE sende komponenter (knapper) — knappe-meldinger må postes av bot-identiteten (`DISCORD_BOT_TOKEN`). Webhook-speilingen (tekst) består; meldinger som trenger knapper går via bot-API-et.
- Interactions-endepunktet må svare PING (type 1) → PONG (type 1) for Discords validering, og verifisere ed25519-signaturen (`X-Signature-Ed25519` + `X-Signature-Timestamp` over timestamp+rå-body) — ellers avviser Discord endepunktet. Node 22 har ed25519 i `crypto.verify` natively — ingen ny avhengighet.
- GitHub-siden: rebase-merge via `PUT /repos/{o}/{r}/pulls/{n}/merge` (`merge_method: rebase`); draft→ready krever GraphQL `markPullRequestReadyForReview`. Fine-grained PAT scopet til KUN golf-app med issues+pull_requests RW.

## Design

1. **`app/api/discord/interactions/route.ts` (ny, POST):**
   - Les RÅ body (signaturen er over rå bytes — ikke parse først), verifiser ed25519 mot `DISCORD_PUBLIC_KEY`; feil → 401.
   - `type: 1` (PING) → `{type: 1}`.
   - `type: 3` (MESSAGE_COMPONENT): avvis alt der `member.user.id !== DISCORD_OWNER_ID` (svar «kun eieren kan styre loopene», ephemeral). Parse `custom_id`:
     - `merge_pr:<n>` → GraphQL ready-for-review hvis draft → REST rebase-merge → svar med utfall + lenke.
     - `ready_issue:<n>` → legg `autonomy:ready`-label → svar «#n står i natt-køen».
     - `answer:<issue>:<A|B>` → post issue-kommentar «Eierbeslutning via Discord: <A/B>» → svar bekreftelse.
   - Alle GitHub-kall med `GITHUB_LOOP_PAT`; API-feil → ærlig feilsvar i Discord («fikk ikke merget: <grunn>»), aldri stille.
   - Interaction-svar innen 3 s (Discords frist) — bruk deferred response (type 5) + follow-up hvis GitHub-kallet kan bruke tid.
2. **`lib/loops/discordActions.ts`:** ren logikk (custom_id-parsing, GitHub-kall-byggere) — unit-testbar uten HTTP.
3. **Sender-siden (protokoll-oppdateringer, egne commits):** morgenbriefen og eskaleringer poster via bot-API når `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` finnes, med knapper på handlingslinjene («Godkjenn PR #N» → `merge_pr:N`; A/B-spørsmål → to knapper). Uten bot-token: fall tilbake til dagens webhook-tekst.
4. **Eier-oppsett (oppskrift postes på issuet):** Discord Developer Portal → New Application «Tørny-loopene» → kopier Application ID + Public Key; Bot-fane → token; inviter boten til serveren (kun Send Messages); Interactions Endpoint URL settes til `https://tornygolf.no/api/discord/interactions` ETTER at PR-en er deployet (Discord validerer med PING ved lagring); GitHub → fine-grained PAT (kun golf-app, Issues RW + Pull requests RW); alle verdier inn i Vercel env (`DISCORD_PUBLIC_KEY`, `DISCORD_OWNER_ID`, `GITHUB_LOOP_PAT`) + routine-env/Actions (`DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`).

## Edge Cases & Guardrails

- Signaturfeil, ukjent custom_id, ikke-eier: logges med LOG_PREFIX, ephemeral avvisning — aldri GitHub-kall.
- Merge-knappen respekterer repo-reglene: alltid rebase, aldri squash; rød CI → svar «CI er ikke grønn — ikke merget» (sjekk checks først).
- PAT-en er repo-scopet og roterbar; route-koden logger aldri tokenverdier.
- Replay: Discord-signaturen dekker timestamp; avvis eldre enn 5 min.
- Vercel-deploy-rekkefølge (route må være live før Discord-validering) er dokumentert i oppskriften.

## Key Decisions

- Native `crypto.verify` fremfor npm-avhengighet (Node 22, mindre flate).
- Eier-ID-allowlist i env fremfor rolle-sjekk — solo-server, enklest og strengest.
- Webhook beholdes for ren tekst; bot kun der knapper trengs.

**Claude's Discretion:** fil-/funksjonsnavn, deferred-response-detaljer, knappe-layout.

## Success Criteria

- [x] Unit-tester (Type A) for signaturverifisering (gyldig/ugyldig/utløpt) og custom_id-parsing/handler-valg med mocket GitHub-klient — `npx vitest run lib/loops app/api/discord`.
- [x] PING→PONG og ikke-eier-avvisning verifisert i test.
- [x] `npm run build` grønn (fanger runtime-export-fella) + full gates.
- [ ] Stagingbevis-porten (#1076) kjørt på PR-en: signert test-interaction mot staging-deploy utfører label-handling på et test-issue og svarer riktig — DETTE AKTIVERER OG LUKKER #1076.
- [ ] Ende-til-ende med eieren: ekte knappetrykk fra Discord-appen merger en ekte (ufarlig) PR — aktiveringskriterium, lukker issuet.

## Gates

- [ ] `npm run typecheck` · `npm test` · `npm run lint` · `npm run build` · `bash tests/hooks/guard.test.sh`

## Out of Scope

- Kontrakt-DRODLING via Discord (gråsone-dialogen forblir interaktiv — kun «🔨 ønskes»-label kan komme senere)
- Slash-kommandoer, flere brukere, andre servere
- Fjerning av webhook-speilingen (består som fallback)
