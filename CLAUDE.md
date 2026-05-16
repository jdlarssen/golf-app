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

### GitHub Issues — arbeidsflyt (mandatory)

Alt backlog-arbeid spores i [GitHub Issues](https://github.com/jdlarssen/golf-app/issues), ikke i markdown-filer. Når du jobber på en issue:

1. **Commits:** Inkluder `Refs #N` i commit-body for alle commits som bidrar mot issue-en. Bruk `Closes #N` i body på siste commit som faktisk lukker den — GitHub auto-lukker issue-en når den landerer på `main`. Dette gjelder også subagenter som committer: prompten må inkludere issue-nummeret og instruks om å bruke `Refs`/`Closes` i body.
2. **Closing-kommentar (ALLTID):** Når en issue lukkes (auto eller manuelt), MÅ hovedchatten poste en kommentar på issue-en med `gh issue comment N --body ...`. Kommentaren har to seksjoner:
   - **`## Teknisk`** — hvilke filer/komponenter endret, hvilken approach, evt. avvik fra issue-design, commit-SHA-er.
   - **`## For Jørgen`** — hva brukeren ser i appen nå, på vanlig norsk, action-orientert. Samme tone som CHANGELOG-taglines («Du kan nå …», «Når X skjer, sier appen nå …»).
3. **Ingen start-kommentar, ingen self-assign, ingen `in-progress`-label.** Solo dev → minimer ceremoni.
4. **Avvik fra issue-design** skal eksplisitt nevnes under «Teknisk» — ikke skjul kutt eller endringer.
5. **Nye funn underveis** som ikke hører hjemme i nåværende issue: opprett ny issue via `gh issue create` (med riktig `type:` + `area:` + scope-labels), spør bruker om det skal gjøres nå eller bare nevnes. Aldri smyge urelaterte fixes inn i nåværende commit.
6. **Reviewer-funn (mandatory):** når code-quality-reviewer, spec-reviewer eller annen subagent rapporterer findings som IKKE landeres i samme commit, MÅ hovedchatten opprette dem som GitHub Issues via `gh issue create` før push til main. Verbal rapport alene er ikke nok — funn forsvinner ut av kontekstvinduet etter neste sesjon. Adresserte funn (f.eks. JSDoc-stramming i siste commit) nevnes i closing-kommentaren under «Teknisk» i stedet. Ikke filer rene stil-meninger som issues — kun substantielle refactor/test/docs/edge-case-funn.

### Versjonering / CHANGELOG

**Regel:** Hver commit som endrer bruker-synlig oppførsel MÅ bumpe `package.json` versjonen og legge til entry i `CHANGELOG.md` — i samme commit som selve endringen. Footer i appen (`AppVersionFooter.tsx`) henter automatisk versjonen via `next.config.ts` → `NEXT_PUBLIC_APP_VERSION`, så bumpen blir synlig i prod ved neste deploy.

**Hvilken type bump:**
- **PATCH (`vX.Y.Z+1`)** — bug-fix, copy-justering, perf-forbedring, design-polish. Bruker kan gjøre nøyaktig det samme som før, bare bedre.
- **MINOR (`vX.Y+1.0`)** — ny bruker-synlig feature shipped til prod (ny side, ny knapp, ny spillmodus, ny innstilling).
- **MAJOR (`vX+1.0.0`)** — bryter datamodell eller fundamental UX, krever bruker-kommunikasjon. Pre-1.0.0 (`0.x.y`) brukes som alpha — vi er ikke stabil ennå, så minor-bumps kan inneholde mindre brytende endringer.

**Skip bump for:** rene docs-commits (`docs(...)`), refaktorering uten oppførselsendring (`refactor(...)`), test-only-commits, og `chore(...)` som ikke påvirker brukeren. CHANGELOG-entry kan også skippes da.

**Hvordan bumpe:**
- `npm version patch --no-git-tag-version` (eller `minor`/`major`) — oppdaterer `package.json` + `package-lock.json` uten å lage separat tag/commit
- Eller rediger `package.json` direkte (one-liner)
- Inkluder bump-en + CHANGELOG-oppdatering i SAMME commit som feature/fix-en

**CHANGELOG-format:** Tre-lags struktur i `CHANGELOG.md`, designet for å være lesbar for både utvikler og produkteier (Jørgen er stakeholder, ikke utvikler):

1. **Per-minor-serie tema-heading** (`## 0.X.y — [navn på temaet]`) med 1–2 setningers sammendrag av hva som ble gjort i den serien. Tre nyeste minor-seriene står åpne; eldre minor-serier wrappes i et `<details>`-element (med `<summary><strong>0.X.y — [tema] (N entries) — klikk for å vise</strong></summary>`) slik at fila kan scrolles raskt.
2. **Per-versjon entry** (`### [X.Y.Z] - YYYY-MM-DD`) ledes med én **bold stakeholder-tagline** på vanlig norsk — hva endringen betyr for brukeren, ikke hva som ble endret i koden.
3. **Teknisk historikk** i et `<details><summary>Teknisk</summary>...</details>`-element under tagline-en, med [Keep a Changelog](https://keepachangelog.com/no/)-underseksjoner (`#### Added`, `#### Changed`, `#### Fixed`, `#### Removed`) og prosa-bullet points. (For entries som ligger inne i en allerede-collapset minor-serie kan du droppe den indre `<details>`-en — den ytre tar seg av kollapsen.)

Nyeste øverst, norsk på alt brukerrettet. Når du legger til en ny entry: skriv tagline-en *først*. Hvis du sliter med å forklare hva som endret seg på Jørgen-språk («Du kan nå …», «Forhindrer at …», «Hvis X skjer, sier appen nå …»), er det et tegn på at endringen kanskje ikke fortjener egen entry — sjekk skip-listen.

Når en minor-serie passerer tre-nyeste-grensen (nytt minor lander), pakk den eldste åpne serien inn i `<details>`.

**Veien til v1.0.0:** bumpene fortsetter som `0.x.y` til (a) `/admin/invitations`-status fungerer korrekt, (b) smoke-test med ekte kompis bestått, (c) Supabase Site-URL/mail-subject-cache løst. Når alle tre er på plass: bump til `1.0.0` med en samle-CHANGELOG-entry «Første stabile release».

**Håndheving via git commit-msg-hook (`.githooks/commit-msg`):** regelen er ikke valgfri — hooken blokkerer alle `feat(...)`/`fix(...)`/`perf(...)`-commits som ikke samtidig stager `package.json` (med endret version-felt) og `CHANGELOG.md`. Hooken er aktivert automatisk på `npm install` (via `postinstall` som setter `core.hooksPath=.githooks`). Hvis hooken blokkerer:

1. Hvis commiten faktisk er bruker-synlig: kjør `npm version patch --no-git-tag-version` (eller `minor`/`major`), legg til CHANGELOG-entry, stage alle tre filer, og commit på nytt med samme melding.
2. Hvis commiten IKKE er bruker-synlig: bytt prefix til `docs(...)`, `refactor(...)`, `test(...)`, `chore(...)`, `style(...)`, `ci(...)` eller `build(...)`.
3. Aldri bruk `--no-verify` for å omgå hooken — det bryter disiplinen og gjør at footeren henger etter prod-state.

Skip-typene over (`docs/refactor/test/chore/style/ci/build`) passerer fritt — hooken slår kun ut på bruker-synlige prefikser.

### Feilhåndtering / bugs

- **Ingen quick-fixes.** Bruker har eksplisitt sagt: alle bugs krever systematisk debugging FØR fix
- Bruk `superpowers:systematic-debugging`-skill ved bug-rapport
- Legg til diagnostikk (console.log eller inline rendering) FØR du foreslår løsning

### Arbeidsflyt — subagenter vs direkte

**Plan-eksekvering: alltid subagent-drevet.** Når det finnes et implementeringsplan-dokument (typisk `docs/plans/*-implementation.md`), kjøres den via `superpowers:subagent-driven-development`-skillet — fresh subagent per task, review mellom tasks. Ikke spør brukeren hvilket alternativ — valget er gjort.

**Modell-routing per subagent:** Sett `model`-parameteren eksplisitt på hvert `Agent`-kall — ikke arv Opus i blinde.
- **sonnet** for implementer-subagenter (følger ferdigskrevet plan), spec-compliance-reviewer (regel-følging), fix-subagenter med klare instrukser. Mekanisk arbeid med detaljert spec.
- **opus** for code-quality-reviewer (krever skjønn om tradeoffs), final whole-branch-review, brainstorming-co-pilot.
- **haiku** for trivielle lookups (sjelden verdt en subagent).

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

- **Tagline (canonical):** «Tørny — fyr opp golfturneringen på et par minutter»
- **Subordinate form** (ved siden av BrandMark, for å unngå navn-repetisjon): «Fyr opp golfturneringen på et par minutter»
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

**OTP-kode** (6–8 sifre i mail, ingen URL-er). Bytte fra magic-link skjedde 2026-05-13 fordi magic-link-URL-en brøt iOS PWA-innlogging på to måter samtidig: (a) PKCE-handoff feilet når Mail.app åpnet lenken i Safari istedenfor PWA-shellen (cookie-jar-mismatch), (b) mail-scannere konsumerte one-time-token-en før brukeren rakk å klikke. Begge forsvinner når det ikke finnes URL å klikke.

Login-flyten er to-stegs på samme `/login`-side (styrt av `?step=` search-param):
1. `sendCode`-action: gateer `shouldCreateUser` på `email_is_invited` RPC, kaller `signInWithOtp` → Supabase sender kode-mail
2. `verifyCode`-action: `verifyOtp({type: 'email'})` → setter session-cookie, markerer `invitations.accepted_at` (via RLS-policy 0012), redirecter til `next` eller `/`

Invitasjoner: admin/invite-flyten inserter rad i `public.invitations` og sender en separat **notifikasjons-mail via Resend** (`lib/mail/inviteNotification.ts`). Selve kode-mail-en sendes først når invitéen kommer til `/login` og ber om kode — to mailer per invitasjon (notifikasjon + kode), én UX-flyt for alle.

Auth state via cookies (`@supabase/ssr`). Proxy (`proxy.ts`) refresher session.

Gammel `/auth/callback`-route er strippet til en redirect mot `/login?error=link_expired` for stale magic-link-mailer i flight — slettes 2026-06-13.

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

**v1.0-launch-sesjon 2026-05-14.** Står på `v1.0.9` — første stabile release shipped, med 9 patches på post-launch polish basert på prod-testing.

✅ **Nytt i v1.0-leveransen:**
- **Reveal-mode** — admin velger ved spill-opprett om netto-tall skjules under runden og avsløres når spillet avsluttes. Default `live` = dagens oppførsel.
- **Scorekort-former** — sirkel/dobbel/trippel for under-par, firkant/dobbel/trippel/kvadruppel for over-par. Brukt på 5 skjermer (hull-skjerm, scorekort-oversikt, lever, approve, hull-leaderboard).
- **Navne-reveal** — under runden `nickname ?? name`, på finished-flater `Karl "Knølkis" Jensen` via `formatRevealName(name, nickname)`.
- **Live brutto leaderboard** — `RevealBruttoView` for reveal-aktiv: lag-totaler basert på brutto best-ball, per-spiller-brutto-sums, vs-par-delta per rad, ingen handicap-info.
- **Hull-skjerm leaderboard-ikon** (PokalIcon) med `?return=hole&n=N` for return-to-hole-nav.
- **Auto-reveal via realtime** — `PreRoundLeaderboardRealtime` lytter på `games` UPDATEs i tillegg til `scores` INSERTs, så leaderboardet veksler automatisk fra brutto-view til netto-reveal når admin avslutter.
- **Hull-for-hull-oversikt redesign** — vertikalt stack per spiller med initial (J, H, ...) foran scoren, brutto-shape + netto + vs-par-pille. Kontributørens initial er **fet** = «brukt netto». Lagets best-ball + vs-par-pille til høyre. Totalt-baren har vs-par inline med totalsum.
- **Scorekort-oversikt** har droppet per-rad `+slag`-kolonnen (passer nå på normal iPhone). Total «Slag fått: N» surfaces i fotnoten.
- **«Leaderboard»-link på spill-hjem** for aktive spill — lukker discoverability-gapet etter scorekort-levering når hull-skjermen redirecter bort.

**Migrasjoner shipped denne sesjonen:**
- `0021_score_visibility` — `games.score_visibility text not null default 'live' check (in ('live', 'reveal'))`, låses mens status `active`/`finished`
- `0022_realtime_games` — `alter publication supabase_realtime add table public.games` for at klienter kan lytte på `status='finished'`-event

**Nye filer:**
- `lib/games/visibility.ts` — `revealState(visibility, status)` + `shouldHideNetto(state)`
- `lib/scoring/scoreShape.ts` — mapper score til shape-kategori (cap på trippel under, kvadruppel over)
- `lib/names/formatRevealName.ts` — `Karl "Knølkis" Jensen`-format
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall, `size: 'sm' | 'md' | 'lg'`, strek 1.0–1.5px, `lineHeight: px`-sentrering, `tabular-nums`
- `app/games/[id]/leaderboard/RevealBruttoView.tsx` — eget view for `reveal-active`-state med tease-tekst

**Designdoc + plan i `docs/plans/`:** `2026-05-14-v1-launch-design.md` (godkjent), `2026-05-14-v1-launch-implementation.md` (25-task TDD-plan, alle 25 sjekket inn).

⏸ **Ventende (post-v1.0):**
- **Multi-player scorekort-oversikt** — vise lag-medlemmer side om side med initialer øverst i hver kolonne (vs. dagens single-player-flate). Krever brainstorming — se [#17](https://github.com/jdlarssen/golf-app/issues/17).
- **3 pre-eksisterende lint-warnings** (`historikk/page.tsx:53` prefer-const, `InstallBanner.tsx:18` setState-in-effect, `SyncBanner.tsx:78` impure-call-in-render) — alle fra commits før v1.0-arbeidet, ikke blokkerende men bør fikses
- **Perf-instrumentering** (`console.time/timeEnd`) i hull-page + game-home — pilot er ferdig (memory `project_active_perf_instrumentation`)
- **End-to-end-test av mail-flow** (gameFinished + scorecardSubmitted) — sjekk Resend-dashboard
- **Designpass** på resterende sider (complete-profile, admin/courses + admin/games-listen)
- **Hull-page layout-lift** (`game` + `game_players` til layout.tsx via React.cache) — estimert –300ms ([#18](https://github.com/jdlarssen/golf-app/issues/18))
- **TopBar med action-slot** for `/admin/courses` og `/admin/games`-listen

📋 **Backlog:** [GitHub Issues](https://github.com/jdlarssen/golf-app/issues). `TODO.md` er en stub som peker dit — alle nye oppgaver opprettes som issues, ikke i markdown.

## Nøkkelfiler å kjenne til

- [GitHub Issues](https://github.com/jdlarssen/golf-app/issues) — backlog (tagget etter type + område + scope). `TODO.md` er stub som peker dit.
- `docs/launch-checklist.md` — admin-sjekkliste for lanseringsdagen
- `docs/email-templates.md` — alle 5 mail-maler å lime inn i Supabase Auth
- `docs/plans/2026-05-10-golf-best-ball-app-design.md` — opprinnelig design
- `docs/plans/2026-05-10-golf-best-ball-app-implementation.md` — implementeringsplan (13 faser)
- `app/globals.css` — palett og typografi-tokens
- `components/ui/` — design system (Card, Button, Input, Banner, PageHeader, AppShell, BrandMark, TopBar, HistoryBackLink, StatusChip)
- `components/ui/TopBar.tsx` — sticky top-bar (chevron + valgfri kicker), brukt på 19 sider. `back="history"` for `/legal/privacy` som kan nås fra hvor som helst
- `components/pwa/` — install-flyten: `InstallBanner` (på `/`), `InstallButton` (på `/profile`), `InstallInstructionsModal` (iOS-trinn-for-trinn), `InstallPromptCapture` (mountet i layout for å fange `beforeinstallprompt`)
- `lib/pwa/install-state.ts` + `lib/pwa/detect.ts` + `hooks/useInstallPrompt.ts` — plattform-detection og state-singleton for PWA-install
- `lib/scoring/` — scoring-bibliotek (ikke rør uten ny test)
- `lib/sync/` — offline-sync (Dexie + worker + realtime)
- `lib/games/status.ts` — `GameStatus`-union + `STATUS_LABELS` (single source of truth)
- `lib/admin/gameErrorMessages.ts` — shared error-message-maps for admin/games-flyten (kopi-variasjon mellom new-game og existing-game er dokumentert i JSDoc)
- `supabase/migrations/` — 20 SQL-migrasjoner
- `lib/mail/inviteNotification.ts` — Resend-mail-helper for invitasjons-notifikasjoner
- `lib/mail/gameFinishedNotification.ts` — Resend-mail til spillere når admin avslutter spillet («Resultatet er klart»)
- `lib/mail/scorecardSubmittedNotification.ts` — Resend-mail til admin når spiller leverer scorekort
- `components/sync/SyncBanner.tsx` — sticky-top banner for kø-stuck/error med retry-knapp + friendly-error-mapping
- `app/profile/historikk/page.tsx` + `app/profile/slett-konto/` + `app/profile/export/route.ts` — GDPR-self-service-flyten
- `app/admin/games/[id]/slett/` + `app/admin/spillere/[id]/slett/` + `app/profile/slett-konto/` — destruktive flyter med dedikerte konfirmasjons-sider
- `app/legal/privacy/page.tsx` — offentlig personvern-side (lenket fra AppVersionFooter), bypass auth-gate via `proxy.ts`-matcher

## Vanlige neste-steg-oppgaver

Hvis bruker kommer tilbake til et tema, sjekk om dette stemmer:

1. **«La oss teste med en kompis»** → guide gjennom invitasjon i Admin → Invitasjoner. Invitéen får først en notifikasjons-mail («Du er invitert»), så ber de selv om kode på /login og får 8-sifret kode på mail. Sjekk at `accepted_at` flippes når de logger inn første gang.
2. **«Design oppgradering»** → bruker har planlagt å bruke claude.ai/design med design system. Setup beskrevet i forrige chat.
3. **«Ny spilltype»** → stableford / matchplay / scramble / solo. Krever ny scoring-modul i `lib/scoring/`, nytt UI-flow. Datamodellen skalerer.
4. **«Klubb-tier med flere admin/grupper»** → krever `groups` + `group_members`-tabeller, RLS-justering. Betydelig oppgave.
5. **«Mail kommer ikke fram»** → systematisk debug. Sjekk Supabase Auth Logs (kode-mail) + Resend dashboard (notifikasjons-mail) + Vercel runtime logs. Tre Resend-mail-typer finnes nå: invite, gameFinished, scorecardSubmitted (alle i `lib/mail/`). Alle er best-effort med Promise.allSettled + console.error — sjekk Vercel logs for `[endGame]` / `[submitScorecard]` / `[admin/spillere]` prefiks ved feil.
6. **«Bytt til v1.0.0»** → launch-readiness-kriteriene er allerede oppfylt (2026-05-13). Brukeren venter på sine egne endringer først. Når klar: MAJOR-bump med samle-CHANGELOG-entry «Første stabile release».

## Bruker-preferanser fra tidligere sesjon

- Foretrekker norske navn med vokal-dropping (a la Flickr, Tumblr) — derav «Tørny»
- Verdsetter premium-følelse men også «sporty energi»
- Ikke har bedriftsregistrering — kjøper domener som privatperson
- Bruker iPhone (Safari)
- Har macOS — bruker `pbcopy` for clipboard
- Har lokal git config satt opp for sin GitHub-konto (jdlarssen)
