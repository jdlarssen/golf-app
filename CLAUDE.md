@AGENTS.md

# Tørny — golf-turneringsapp

Mobil-først PWA for å arrangere golf-turneringer. Skalerer fra 4 kompiser til klubb-skala (~150 deltakere). Per d.d. støttes **best ball netto** (lavest sum av beste netto-resultat per hull per lag).

**Produksjon:** [tornygolf.no](https://tornygolf.no) (også `tørny.no`)
**Repo:** github.com/jdlarssen/golf-app
**Hosting:** Vercel (Hobby tier)
**Database/Auth:** Supabase (Free tier, EU-region)
**Mail:** Resend SMTP via verifisert domene `tornygolf.no`

## Brukere

- **Admin (Jørgen):** Lager baner, oppretter spill, sender invitasjoner, avslutter spill. `users.is_admin = true`.
- **Spillere:** Inviterte brukere som registrerer seg, taster slag, leverer scorekort. `is_admin = false`.

Sluttbrukeren har **null programmeringserfaring**. Tilbakemeldinger må være på norsk, instruksjoner må være kopier-lim-klare eller GUI-baserte. Aldri be brukeren lese kode.

## Samarbeidsmodell — hvem gjør hva

Denne arbeidsdelingen har vist seg å fungere bra. Hold deg til den.

### Brukeren gjør (manuelt i nettleser-UIer)

- **Supabase Dashboard:** kjører SQL i SQL Editor (alt jeg leverer som SQL — bruker limer inn), konfigurerer Auth UI (mal-subjects/body, URL Configuration, SMTP-settings), oppretter brukere i Authentication-fanen
- **Vercel Dashboard:** legger til Custom Domain, env-variabler, godkjenner deploys hvis nødvendig
- **Resend Dashboard:** verifiserer domene, kopierer API-keys, sjekker mail-logger
- **Domene-registrar (Domeneshop, Cloudflare, etc.):** legger til DNS-records jeg gir
- **Mail-klient:** mottar test-mailer, deler skjermbilder eller logg-data
- **Telefon/nettleser:** tester appen visuelt, deler skjermbilder
- **Beslutninger:** navn, brand-stil, hvilke features som skal prioriteres, hvilke alternativ å velge mellom

### Du (Claude) gjør (alt annet)

- **All kode:** Edit/Write/Bash for filendringer, npm-kommandoer
- **Git:** stage, commit (med atomic-disiplin), push til main — Vercel deployer automatisk
- **DNS-diagnostikk:** dig/curl via Bash for å sjekke propagering
- **SQL-skriving:** lager migrasjonsfiler i `supabase/migrations/`, men EKSEKVERER aldri SQL direkte mot Supabase (du har ikke tilgang)
- **Diagnostikk:** legger til console.logs eller inline-debug i koden, leser server-side errors fra Vercel via brukerens skjermbilder
- **Plan, design, brainstorming:** med skills som `superpowers:brainstorming`, `superpowers:writing-plans`, etc.
- **Subagent-koordinering:** dispatcher implementer/reviewer-subagenter for store endringer
- **Forklare hvordan og hvorfor:** lange forklaringer er OK når det hjelper bruker å beslutte

### Når noe må gjøres i et UI hos en tredjepart

Følg denne malen i meldingen til brukeren:

1. **Hvor:** «Gå til Supabase → Authentication → URL Configuration» (eksakt navigasjons-bredkrumstier)
2. **Hva å endre:** tabeller eller eksakt tekst å lime inn, gjerne i kode-blokker
3. **Hva du forventer å se etter:** «Skal si Success. No rows returned» eller «Grønn hake ved domenet»
4. **Hva du gjør hvis det ikke ser slik ut:** ta skjermbilde, lim inn her

Aldri si bare «sett dette i Supabase» — alltid med eksakt sti og kopier-lim-klare verdier.

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

### Feilhåndtering / bugs

- **Ingen quick-fixes.** Bruker har eksplisitt sagt: alle bugs krever systematisk debugging FØR fix
- Bruk `superpowers:systematic-debugging`-skill ved bug-rapport
- Legg til diagnostikk (console.log eller inline rendering) FØR du foreslår løsning

### Arbeidsflyt — subagenter vs direkte

- **Substansielle oppgaver** (ny phase, ny side fra null, refaktorering over flere filer, ny komponent med tester): dispatch implementer-subagent via `Agent`-tool. Etterpå: spec-reviewer + code-quality-reviewer per workflow i `superpowers:subagent-driven-development`-skill. Holder hovedchat-konteksten ren.
- **Småfikser** (typo, en-linje-bug, justering av kopi): rediger direkte. Subagent er overkill.
- **Debugging og utforskning:** direkte (les filer, sjekk DNS, kjør curl). Subagent kun hvis det er tydelig avgrenset feltarbeid.
- **TDD for ren logikk** (scoring, sync, math): subagent-disiplin. Skriv test → feile → implementer → grønn → commit.

Ved tvil: hvis oppgaven kan beskrives ferdig i én prompt og forventes å produsere 5+ filer eller mer enn 100 LOC — bruk subagent.

### Stil

- Forest-and-champagne palett (definert i `app/globals.css`):
  - Primary: `#1B4332` (deep forest)
  - Accent: `#C9A961` (champagne gold) — kun til vinnere/highlights
  - Bg: `#F8F6F0` (linen)
  - + dark-mode varianter
- Typografi: `font-serif` (Fraunces) for hierarki + tall, `font-sans` (Inter) for UI
- Tall i tabeller/leaderboards: ALLTID `tabular-nums`
- UI primitives: bruk eksisterende i `components/ui/` — ikke duplisér
- Mobile-first, tap-targets ≥44px

### Brand

- **Tagline (canonical):** «Tørny — fyr opp golfturneringen på minutter»
- **Subordinate form** (ved siden av BrandMark, for å unngå navn-repetisjon): «Fyr opp golfturneringen på minutter»
- **Brand-stemme:** Sporty kompis-energi. Action-verb framfor passiv beskrivelse. Norske idiomer framfor «smart»-engelsk.
- **BrandMark-subtitle** («Turnering» under logo) er logo-lockup, **ikke** tagline — endres ikke uten visuell redesign.

## Arkitektur

### Datamodell

8 tabeller i `public`:
- `users` (utvider auth.users)
- `courses` + `course_holes` + `tee_boxes`
- `games` + `game_players`
- `scores`
- `invitations`

Migrasjoner: `supabase/migrations/0001`–`0007`.

### Scoring-logikk

Ren TypeScript i `lib/scoring/`:
- `courseHandicap.ts` — WHS-formel
- `strokeAllocation.ts` — slag per hull
- `bestBall.ts` — netto + best-ball + lag-total
- `tiebreaker.ts` — 5-tiers cascade

40 unit-tester, alle grønne. TDD-disiplin var streng her — endring krever ny test først.

### Auth-flyt

Magic link only (ingen passord). `signInWithOtp` brukes både for innlogging og admin-invitasjoner. Auth state via cookies (`@supabase/ssr`). Proxy (`proxy.ts`) refresher session.

⚠️ Realtime krever eksplisitt `supabase.realtime.setAuth()` med JWT — auto-propagering virker ikke for WebSocket-kanalen (kjent quirk).

### Offline-sync

Lokal-først via Dexie. `writeScore()` → IndexedDB → sync-kø → `upsert_score_if_newer` RPC. Last-write-wins via `client_updated_at`. Sync-worker drainer kø på online-event, focus, og 30-sek-interval. Realtime sub for live updates fra flight-medlemmer.

⚠️ Dexie database heter `'golf-app'` (historisk) — IKKE rename, det invaliderer eksisterende brukeres lokale data.

### RLS

Strengt håndhevet i Postgres. Spillere ser:
- Sine egne scores
- Samme-flight scores under aktivt spill
- ALLE scores etter `games.status = 'finished'`

Helper functions er `SECURITY DEFINER` for å unngå rekursjons-feller.

## Status per session-handoff

**Phase 0–12 + 12.5: ferdig.** Phase 13 (launch readiness) er i progress.

✅ **Fungerer end-to-end:**
- Magic link login med branded mail (forest-and-champagne stil)
- Egen domene tornygolf.no live
- Hele turnerings-flyten (opprett → spill → lever → leaderboard)
- Offline-sync, realtime, PWA, peer-godkjenning, admin-overstyring
- Premium-stil på hovedflater

⏸ **Ventende:**
- **Smoke-test med ekte kompis** (ikke gjort ennå)
- **Supabase mail-template subject:** står som «Logg inn på Tørny» i UI men sendes som «Your Magic Link» — sannsynligvis Supabase Auth cache (15+ min). Body fungerer korrekt.
- **Site URL i Supabase:** oppdatert til tornygolf.no i UI men `redirect_to` i magic-link bruker fortsatt vercel.app-URL — samme cache-problem
- Designpass på resterende sider (scorecard, submit, approve, leaderboard/holes, complete-profile, profile, admin/{courses,invitations,games}-listen)

📋 **Backlog:** se `TODO.md`

## Nøkkelfiler å kjenne til

- `TODO.md` — backlog (sortert etter kategori)
- `docs/launch-checklist.md` — admin-sjekkliste for lanseringsdagen
- `docs/email-templates.md` — alle 5 mail-maler å lime inn i Supabase Auth
- `docs/plans/2026-05-10-golf-best-ball-app-design.md` — opprinnelig design
- `docs/plans/2026-05-10-golf-best-ball-app-implementation.md` — implementeringsplan (13 faser)
- `app/globals.css` — palett og typografi-tokens
- `components/ui/` — design system (Card, Button, Input, Banner, PageHeader, AppShell, BrandMark)
- `lib/scoring/` — scoring-bibliotek (ikke rør uten ny test)
- `lib/sync/` — offline-sync (Dexie + worker + realtime)
- `supabase/migrations/` — 7 SQL-migrasjoner

## Vanlige neste-steg-oppgaver

Hvis bruker kommer tilbake til et tema, sjekk om dette stemmer:

1. **«La oss teste med en kompis»** → guide gjennom invitasjon i Admin → Invitasjoner, hjelpe med eventuelle leveringsproblemer
2. **«Design oppgradering»** → bruker har planlagt å bruke claude.ai/design med design system. Setup beskrevet i forrige chat.
3. **«Ny spilltype»** → stableford / matchplay / scramble / solo. Krever ny scoring-modul i `lib/scoring/`, nytt UI-flow. Datamodellen skalerer.
4. **«Klubb-tier med flere admin/grupper»** → krever `groups` + `group_members`-tabeller, RLS-justering. Betydelig oppgave.
5. **«Mail kommer ikke fram»** → systematisk debug. Sjekk Supabase Auth Logs + Resend Logs. Resend sandbox ble løst ved domene-verifisering.

## Bruker-preferanser fra tidligere sesjon

- Foretrekker norske navn med vokal-dropping (a la Flickr, Tumblr) — derav «Tørny»
- Verdsetter premium-følelse men også «sporty energi»
- Ikke har bedriftsregistrering — kjøper domener som privatperson
- Bruker iPhone (Safari)
- Har macOS — bruker `pbcopy` for clipboard
- Har lokal git config satt opp for sin GitHub-konto (jdlarssen)
