@AGENTS.md
@docs/agent-discipline/core.md

# Tørny — golf-turneringsapp

Mobil-først PWA for å arrangere golf-turneringer. Skalerer fra 4 kompiser til klubb-skala (~150 deltakere). Per d.d. støtter appen over 20 spillemodi: slagspill, stableford, matchplay-familien (singles, fourball, foursomes m.fl.), lag- og scramble-format (Texas, Florida, Ambrose, shamble, best ball) og spill som Wolf, Nassau og Skins. Alle kjører på WHS netto-handicap.

**Produksjon:** [tornygolf.no](https://tornygolf.no) (også `tørny.no`)
**Repo:** github.com/jdlarssen/golf-app
**Hosting:** Vercel (Hobby tier) — funksjonene kjører i Stockholm (`arn1`, satt i `vercel.json`), samme by som Supabase (`eu-north-1`). Ikke fjern `regions` uten å måle: standardverdien er Washington.
**Database/Auth:** Supabase (Free tier, EU-region)
**Mail:** Resend SMTP via verifisert domene `tornygolf.no`

## Brukere

- **Admin (Jørgen):** Lager baner, oppretter spill, sender invitasjoner, avslutter spill. `users.is_admin = true`.
- **Spillere:** Inviterte brukere som registrerer seg, taster slag, leverer scorekort. `is_admin = false`.

Sluttbrukeren har **null programmeringserfaring**. Tilbakemeldinger må være på norsk, instruksjoner må være kopier-lim-klare eller GUI-baserte. Aldri be brukeren lese kode.

## How we work together

These five clauses govern how you collaborate with me. They take precedence over default behavior; follow them unless project instructions say otherwise. (Canonical copy lives in the global `~/.claude/CLAUDE.md`; if the two ever drift, that one wins.)

1. **Ask, don't assume.** If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements. When running unattended, pick the most reasonable interpretation, proceed, and record the assumption rather than blocking.

2. **Match effort to difficulty.** Implement the simplest solution for simple problems, better solutions for harder problems. Do not over-engineer or add flexibility that isn't needed yet.

3. **Stay in your lane, but speak up.** Don't touch unrelated code — but do surface bad code or design smells you discover with me so we can address them as a separate issue.

4. **Flag uncertainty explicitly.** If you're unsure about something, see clause 1. If it makes sense, conduct a small, localised, low-risk experiment and bring the hypothesis and results to me to discuss. Confidence without certainty causes more damage than admitting a gap.

5. **Suggest better ways.** I'm always open to ideas on better ways to do things. Don't hesitate to suggest a better approach, or one with long-lasting impact over a tactical fix.

## Samarbeidsmodell — hvem gjør hva

Hva eieren gjør i nettleser-UI-er, hva du gjør, og malen for instrukser i en tredjeparts-UI: `docs/collaboration.md`. SQL og migrasjoner påfører du selv via Supabase MCP, staging først; prod kun etter eksplisitt eier-godkjenning i økten (prod-brannmuren #1074).

### Aldri gjør disse (uten eksplisitt godkjenning)

- Foreslå eller utføre `git push --force`
- Slette branches eller commits
- Endre `lib/scoring/` uten ny test først
- Rename Dexie-databasen (heter `'golf-app'` av historisk grunn — endring sletter brukernes lokale data)
- Skifte ut Resend/Supabase/Vercel for andre tjenester uten å diskutere
- Bestille ting brukeren må betale for (domener, abonnementer)

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind v4 (custom palette i `app/globals.css`)
- Fraunces (serif headings/tall) + Inter (sans body) via `next/font/google`
- Supabase JS v2 + `@supabase/ssr` (cookie-basert auth)
- Dexie (IndexedDB wrapper) for offline-sync
- Vitest + Testing Library + Playwright
- Service Worker hand-rolled (`public/sw.js`)

⚠️ **Next.js 16 har breaking changes** — se `AGENTS.md`. Sjekk `node_modules/next/dist/docs/` ved usikkerhet. Spesielt: middleware-konvensjonen heter `proxy.ts` (ikke `middleware.ts`).

## Konvensjoner

### Språk

- **Brukerrettet tekst:** Norsk (bokmål)
- **Kode, identifikatorer, kommentarer, commits:** Engelsk

### Git

- Bruk repo-identitet (`t7pvhqdtcf@privaterelay.appleid.com`, `jdlarssen`) — IKKE overstyr forfatter
- Atomiske commits, ett logisk fokus per commit
- Aldri `--no-verify`, aldri force-push uten god grunn
- Vercel deployer automatisk på push til `main`

### Regler som leses ved utløser

📋 **Backlog:** [GitHub Issues](https://github.com/jdlarssen/golf-app/issues). `TODO.md` er en stub som peker dit — alle nye oppgaver opprettes som issues, ikke i markdown.

- **Milestone på alle nye issues** og **brukerflyt-forankring:** flytene (`docs/flows/*-fremtid.svg`, `docs/user-flows.md`) er sannhetskilden for hva som er core; sjekk `docs/hva-er-nok.md` før feature-issues. → `docs/issue-workflow.md`
- **Branch + PR-flyt:** alt via PR, aldri direkte push til `main`. Grønne PR-er uten produktvalg merges automatisk; produktvalg, prod-migrasjoner, auth, destruktive flyter, noe som koster penger, merge-porten og native-appen venter på eieren. → `docs/pr-workflow.md`
- **Forge:** aldri start `/forge:auto`-løkken uten en kontrakt-kommentar på et åpent issue. → `docs/forge-workflow.md`
- **Closing-kommentar og null-vekst:** én per issue, `## Teknisk` + `## Funksjonell`, linja `Nye issues: 0`; funn fikses i PR-en eller står under «Observert, ikke rørt». → `docs/issue-workflow.md`
- **Versjonering / CHANGELOG:** `feat`/`fix`/`perf` legger én notatfil under `.changes/`; aldri bump `package.json` eller rediger `CHANGELOG.md`. Intern `fix` får `[no-changelog]` i commit-body-en. → `.changes/README.md`
- **Språk-kvalitet:** kjør `humanizer:humanizer` på ny norsk bruker-copy før commit. → `docs/copy-style.md`
- **Testing — staging, aldri prod:** Tørny er i ekte bruk; test aldri ved å skrive til prod. Test mot `torny-staging` (Supabase-ref `snwmueecmfqqdurxedxv`); bruker-synlige fikser verifiseres der før merge. → `docs/staging-testing.md`
- **Test-disiplin:** fire test-typer, én per spørsmål (A logikk, B rendret output, C data-UI, D e2e); les beslutningstreet før du rører tester. → `docs/test-discipline.md`
- **Arbeidsflyt:** planer kjøres via `superpowers:subagent-driven-development`; byggeøkter startes via orkestratoren. → `docs/agent-discipline/bindings.md` §Utførelse
- **Stil og Brand:** forest-and-champagne (`app/globals.css`), `tabular-nums`, tap-targets ≥44px. → `docs/style-and-brand.md`

### Feilhåndtering / bugs

- **Ingen quick-fixes.** Bruker har eksplisitt sagt: alle bugs krever systematisk debugging FØR fix
- Bruk `superpowers:systematic-debugging`-skill ved bug-rapport
- Legg til diagnostikk (console.log eller inline rendering) FØR du foreslår løsning

## Arkitektur

- **Datamodell:** 41 tabeller i `public` (målt 2026-09-13 — vedlikeholdes av dok-avstemmeren #1078); kjernen er `users`, `courses`, `games` + `game_players`, `scores`, `invitations`. Oversikt: `docs/schema-ground-truth.md`; migrasjoner i `supabase/migrations/` (live DB er fasit, jf. AGENTS.md trap 1).
- **Scoring-logikk:** ren TypeScript i `lib/scoring/`; endring krever ny test først (fasit: `npx vitest run lib/scoring`).
- **Auth-flyt:** OTP-kode i mail, ingen magic-link, fordi URL-en brøt iOS PWA-innlogging. → `docs/auth-flow.md`
- **Offline-sync:** lokal-først via Dexie; realtime-fella (`setAuth()` uten argument, #1366). → `lib/sync/AGENTS.md`
- **RLS:** Postgres-RLS er den ekte authz-en; et ferdig spill er ikke world-read (#1542). → `lib/supabase/AGENTS.md`
- **Server-actions og caching:** `getGameWithPlayers` cacher med tag `game-${id}`; mutasjoner kaller `revalidateTag`. → `lib/games/AGENTS.md`

⚠️ Dexie database heter `'golf-app'` (historisk) — IKKE rename, det invaliderer eksisterende brukeres lokale data.

## Nøkkelfiler å kjenne til

Discoverable kataloger (`ls components/ui/`, `ls lib/`, etc.) er ikke listet her — kun ikke-åpenbare feller eller konvensjoner som forsvinner uten påminning:

- `lib/scoring/` — scoring-bibliotek (assertion-rik unit-suite; ikke rør uten ny test først, per Scoring-logikk)
- `lib/sync/` — Dexie-DB heter `'golf-app'` historisk; **rename = sletter brukernes lokale data**
- `proxy.ts` (ikke `middleware.ts`) — Next.js 16-konvensjonen for middleware
- `app/[locale]/legal/privacy/page.tsx` — offentlig side; auth-gaten hoppes over i kode via `PUBLIC_PATH_PATTERN` i `proxy.ts` (matcher-eksklusjonen er borte — matcheren må treffe ruta for locale-redirect og OG-bilde)
- `lib/games/getGameWithPlayers.ts` — `unstable_cache` med tag `game-${id}`; se «Server-actions og caching»
- `lib/mail/inviteNotification.ts` + `gameFinishedNotification.ts` + `scorecardSubmittedNotification.ts` — tre Resend-helpers, alle best-effort med `Promise.allSettled`
- `app/[locale]/admin/games/[id]/slett/` + `app/[locale]/admin/spillere/[id]/slett/` + `app/[locale]/profile/slett-konto/` — destruktive flyter har dedikerte konfirmasjons-sider; aldri inline-toggle eller `<details>`-popout
- `lib/games/status.ts` — `GameStatus`-union + `STATUS_LABELS` (single source of truth for status-tekster)

## Kart — hvor resten bor

Utløsertabellen står i `core.md` (lastet øverst). Les fila når utløseren inntreffer.

- `docs/agent-discipline/` — prosedyrene per utløser; `bindings.md` kobler dem til repoet
- `docs/auth-flow.md` — OTP-innlogging, invitasjoner, mail-debug
- `docs/bug-prevention.md` — de fem fellene, med hendelsene bak
- `docs/changelog-conventions.md` — CHANGELOG-format
- `docs/collaboration.md` — hvem gjør hva, mal for tredjeparts-UI
- `docs/copy-style.md` — mønsterkatalog for norsk bruker-copy
- `docs/email-deliverability.md` — runbook for e-postlevering til Outlook/Hotmail
- `docs/email-templates.md` — Supabase Auth-malene
- `docs/forge-workflow.md` — kontrakt-først for `/forge:auto`
- `docs/hva-er-nok.md` — ferdiggrensen: fryst, parkert, vekke-triggere
- `docs/issue-workflow.md` — milestone, flyt-forankring, closing-kommentar, null-vekst
- `docs/launch-checklist.md` — admin-sjekkliste
- `docs/pr-workflow.md` — PR-form, draft-først, auto-merge, produktvalg-markøren
- `docs/schema-ground-truth.md` — skjema-snapshot (live DB vinner)
- `docs/staging-testing.md` — staging-oppsett, autonom login, prod-vakt
- `docs/style-and-brand.md` — palett, typografi, tagline, brand-stemme
- `docs/test-discipline.md` — test-typene A–D og beslutningstreet
- `docs/uat-empty-states-and-scheduled-status.md` — UAT-sjekkliste for tomtilstander og planlagt status
- `docs/user-flows.md` — brukerflytene i tekst

AGENTS.md per område: `AGENTS.md` (Next.js 16, fem feller) · `lib/games/AGENTS.md` (spill-cache) · `lib/mail/AGENTS.md` (Type B) · `lib/scoring/AGENTS.md` (Type A, test først) · `lib/supabase/AGENTS.md` (skriveregler, RLS) · `lib/sync/AGENTS.md` (sync, realtime) · `native/app/AGENTS.md` (native-appen)
