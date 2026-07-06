@AGENTS.md
@docs/agent-discipline/core.md

# Tørny — golf-turneringsapp

Mobil-først PWA for å arrangere golf-turneringer. Skalerer fra 4 kompiser til klubb-skala (~150 deltakere). Per d.d. støtter appen over 20 spillemodi: slagspill, stableford, matchplay-familien (singles, fourball, foursomes m.fl.), lag- og scramble-format (Texas, Florida, Ambrose, shamble, best ball) og spill som Wolf, Nassau og Skins. Alle kjører på WHS netto-handicap.

**Produksjon:** [tornygolf.no](https://tornygolf.no) (også `tørny.no`)
**Repo:** github.com/jdlarssen/golf-app
**Hosting:** Vercel (Hobby tier)
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

Alt backlog-arbeid spores i [GitHub Issues](https://github.com/jdlarssen/golf-app/issues), ikke i markdown-filer.

#### Milestone på alle nye issues (mandatory)

Hvert `gh issue create` MÅ ha `--milestone` (bash-guard-hooken minner på det). Velg mot flyt-kompasset; passer ingen → default `Backlog — uplanlagt / scale-triggered` og si fra i meldingen. **Mojibake-felle:** Tier 1/Tier 5-titlene har korrupte tegn lagret, så `--milestone "<tittel>"` matcher ikke — sett via nummer: `gh api -X PATCH repos/jdlarssen/golf-app/issues/N -F milestone=<num>` (nummer fra `gh api .../milestones`).

#### Brukerflyt-forankring (mandatory, før alt annet)

Brukerflytene er sannhetskilden for hva som er core. `docs/flows/*-fremtid.svg` = fremtidig kjerne-flyt vi bygger mot; `docs/user-flows.md` = tekst-referanse. Før du løser et issue:

1. **Sjekk at issuet hører hjemme i en flyt.** Er featuren ikke representert i fremtids-flytene, still spørsmålet «trenger vi den?» og ta det med brukeren før du bygger — et eldre issue isolert er ikke mandat nok. Flytene definerer prioritet, ikke issue-alderen.
2. **Prioriter mot flytene.** Når du velger hva som skal gjøres, vei det mot hvilken flyt det gjør optimal. Funksjonelle hull i kjernesløyfa (opprett → bli med → spill → avslutt) går foran polish.
3. **Hold flytene levende.** Endrer arbeidet en flyt, oppdater diagrammet (regenerer PNG per `docs/flows/README.md`) i samme PR — ellers bygger vi noe som ikke står i kartet.

Presedens: #318 (sømløs invitasjons-innlogging) ble satt til side fordi fremtids-flyten ikke inkluderte den — self-reg dekket retningen. Verifiser mot flyten, ikke mot et to-dager-gammelt issue.

#### Branch + PR-flyt (default post-v1.0)

Alt arbeid via PR — **aldri direkte push til `main`**. Hooks håndhever dette: `.githooks/pre-push` blokkerer push til main; `.claude/hooks/bash-guard.sh` blokkerer `--no-verify`, `gh pr merge --squash` og `git push --force`; `.githooks/commit-msg` krever `Refs #N` i body.

1. Jobb på worktree-branchen (eller en beskrivende ny branch fra `main`).
2. Atomiske commits, alle med `Refs #N` i body. Subagent-prompter må inkludere issue-nr + Refs-instruks.
3. Push + PR:
   ```bash
   git push origin <branch>
   gh pr create --base main --title "<tittel>" --body "Closes #N

   <tagline fra CHANGELOG>"
   ```
   `Closes #N` i PR-body er den autoritative auto-close-triggeren.
4. Bruker-synlige endringer: verifiser berørt flyt på `torny-staging` FØR merge (se «Testing — staging, aldri prod»).
5. Merge: `gh pr merge --rebase --delete-branch` (squash brukes ikke — mister granulær audit-trail).

#### Forge-arbeidsflyt (kontrakt-først)

Kontrakt-først-disiplinen for `/forge:auto` (hva hovedchatten gjør når issue/kontrakt ikke er spesifisert) og hvordan `/forge:contract`-kontrakter postes som issue-kommentar er flyttet til [`docs/forge-workflow.md`](docs/forge-workflow.md). Kjernen: **aldri start `/forge:auto`-løkken uten enten en eksisterende kontrakt-fil eller en kontrakt-kommentar på et åpent issue** — les docs-fila før du kjører `/forge:auto` uten spesifisert issue, eller når `/forge:contract` lager en kontrakt.

#### Closing-kommentar (ALLTID)

Når en issue lukkes, MÅ hovedchatten poste en kommentar med `gh issue comment N --body ...`. Kommentaren har to seksjoner:

- **`## Teknisk`** — hvilke filer/komponenter endret, hvilken approach, evt. avvik fra issue-design, PR-link + commit-SHA-er.
- **`## Funksjonell`** — hva brukeren ser i appen nå, på vanlig norsk, action-orientert. Samme tone som CHANGELOG-taglines («Du kan nå …», «Når X skjer, sier appen nå …»).

Gjelder også når subagenter har gjort selve implementasjonen — hovedchatten skriver closing-kommentaren, ikke subagenten.

#### Avvik fra issue-design

Skal eksplisitt nevnes under «Teknisk» i closing-kommentaren — ikke skjul kutt, scope-endringer eller utsatte deler.

#### Nye funn underveis

Funn som ikke hører hjemme i nåværende issue: opprett ny issue via `gh issue create` (med riktig `type:` + `area:` + scope-labels **+ milestone**, jf. «Milestone på alle nye issues»), spør bruker om det skal gjøres nå eller bare nevnes. Aldri smyge urelaterte fixes inn i nåværende PR.

#### Reviewer-funn (mandatory)

Når code-quality-reviewer, spec-reviewer eller annen subagent rapporterer findings som IKKE landerer i samme PR, MÅ hovedchatten opprette dem som GitHub Issues via `gh issue create` (med milestone, jf. «Milestone på alle nye issues») **før PR-merge**. Verbal rapport alene er ikke nok — funn forsvinner ut av kontekstvinduet etter neste sesjon. Adresserte funn (f.eks. JSDoc-stramming i siste commit) nevnes i closing-kommentaren under «Teknisk» i stedet. Ikke filer rene stil-meninger som issues — kun substantielle refactor/test/docs/edge-case-funn.

#### Ingen ceremoni utenom selve PR-en

Ingen start-kommentar, ingen self-assign, ingen `in-progress`-label, ingen `gh issue develop`-call (PR-en gir auto-link til issue-en). Solo dev → minimer ceremoni.

### Versjonering / CHANGELOG

Hver bruker-synlig commit (`feat`/`fix`/`perf`) MÅ bumpe `package.json`-versjonen. Footeren (`AppVersionFooter.tsx`) viser versjonen i prod ved neste deploy. **Bruker-synlig** endring → også én linje i `CHANGELOG.md` (`feat` → en Funksjon-rad, `fix`/`perf` → en Feilrettinger-linje). **Intern** endring som likevel shippes som `fix` (test-only, refactor, tooling) → ingen CHANGELOG-linje; skriv `[no-changelog]` i commit-body-en.

**Håndheves av `.githooks/commit-msg`** — den blokkerer feat/fix/perf-commits som mangler bump (eller mangler CHANGELOG uten `[no-changelog]`), OG hvis bump-typen er feil: **feat → minor/major, fix/perf → patch** (major kun ved breaking `!`/`BREAKING CHANGE`).

- **Bump:** `npm version patch|minor|major --no-git-tag-version`, stage `package.json` + `package-lock.json` (+ `CHANGELOG.md` hvis bruker-synlig), commit på nytt med samme melding.
- **Ikke bruker-synlig?** Bytt prefix til `docs/refactor/test/chore/style/ci/build` — de passerer fritt.
- **CHANGELOG-format:** [`docs/changelog-conventions.md`](docs/changelog-conventions.md) (les FØR ny oppføring). Tynt to-seksjons-feed (Funksjoner / Feilrettinger), én linje per endring; ingen Teknisk-blokk (den bor i issue-closing-kommentaren), ingen humanizer påkrevd.
- Aldri `--no-verify` for å omgå hooken (bash-guard blokkerer den uansett).

### Språk-kvalitet i bruker-rettet copy

Ny/endret norsk bruker-copy (i `.tsx`/`.ts`, mail-templates i `lib/mail/`, feilmeldinger, banner-/knapp-/helper-tekster): kjør `humanizer:humanizer`-skillet før commit. `.githooks/pre-commit` advarer (blokkerer ikke) på kjente AI-tells i nye `.tsx`/`.ts`-linjer; full pattern-katalog + `no-nb`-konvertering i [`docs/copy-style.md`](docs/copy-style.md). Markdown-filer skannes ikke.

**Bevisst bevart (ignorer hook-advarsel for disse):** brand-taglinen `Tørny — fyr opp golfturneringen` (per `### Brand`), mail-subject «Resultatet er klart — ${gameName}» (5 snapshot-tester låser strengen), «Sekretariat»-stemmen i admin-flater, engelske achievement-navn (Turkey/Solid/Snowman).

### Testing — staging, aldri prod

**Tørny er i ekte bruk i prod (fra 2026-06-20). Test ALDRI ved å skrive til prod.** All testing — automatisk og manuell klikk-gjennom — skjer mot `torny-staging` (Supabase-ref `snwmueecmfqqdurxedxv`). Den gamle «production-only testing»-konvensjonen er opphevet.

**Bruker-synlige fikser MÅ verifiseres på staging før merge** (erstatter den manuelle prod-QA-en). De automatiske portene — `tsc` + `lint` + `vitest` (pre-push + CI) pluss e2e-`@gate`-en mot staging — fanger type-/skjema-drift, testet logikk og de tre kjerne-flytene (slag→lever→godkjenn, cup-smoke, liga-smoke), men IKKE at den spesifikke fiksen oppfører seg riktig ende-til-ende. Den siste milen er en staging-klikkrunde av den berørte flyten.

**Kjør appen mot staging (oppsett ligger klart i repoet):**

- **Node 22 kreves** (`source ~/.nvm/nvm.sh && nvm use 22`) — appen krasjer på Node 20 (supabase-js krever native WebSocket).
- `.env.staging.local` (gitignorert) har staging-URL + anon + `SUPABASE_SERVICE_ROLE_KEY` + `E2E_ADMIN_EMAIL`/`E2E_PLAYER_EMAIL`. Din vanlige `.env.local` (prod) røres ikke.
- Boot via `preview_start("torny-staging")` (launch-config i `.claude/launch.json`); driv med `preview_*`-verktøyene.
- **Autonom login** (ingen e-post/SMTP): mint kode via service-role REST `POST $NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/generate_link` → `email_otp` → fyll login-skjemaet (`input[type=email]` → «Send meg kode» → `input[name=token]` → «Logg inn»). Admin = `E2E_ADMIN_EMAIL`, spiller = `E2E_PLAYER_EMAIL`.
- **Prod-vakt:** en staging-mintet kode validerer kun mot staging — bekreft det (og at data er staging-formet) før du skriver noe.

**DB-/skjema-endringer:** påfør staging først via Supabase MCP, verifiser, DERETTER prod (0107-mønsteret). Aldri uverifiserte migrasjoner rett på prod. (`gen:types` leser prod-skjemaet read-only — greit; prod er fasiten for det som er deployet.)

### Feilhåndtering / bugs

- **Ingen quick-fixes.** Bruker har eksplisitt sagt: alle bugs krever systematisk debugging FØR fix
- Bruk `superpowers:systematic-debugging`-skill ved bug-rapport
- Legg til diagnostikk (console.log eller inline rendering) FØR du foreslår løsning

### Test-disiplin (mandatory)

**Full referanse:** `docs/test-discipline.md`. Les den før du rører tester. Område-spesifikke regler ligger i `AGENTS.md`-filer per `lib/`-mappe der stilen avviker fra default.

**Fire test-typer — én per spørsmål:**

- **A. Pure logic** (`lib/scoring/`, `lib/format/`, validators) — klassisk TDD, assertion-rik. `it.each` for parametriserte cases. Mock kun ved system-grenser.
- **B. Rendered output** (`lib/mail/`, framtidige PDF/CSV) — approval-snapshot på `subject` + `text` + extracted body. ÉN chrome-lås per template. Strukturelle kontrakter (RFC-headere, URL-encoding, error-propagation) i ÉN delt fil, aldri duplisert per modul.
- **C. Data-rendering UI** (leaderboards, podiums) — **maks én render-test per komponent**. Aldri re-asserter tall fra Type A. Default ved upassende eksisterende tester: foreslå sletting (krever brukerens go-ahead).
- **D. E2E** (`e2e/`) — golden path + 1–2 edge-cases. Aldri assert på norsk copy; bruk `data-testid`/role.

**Beslutningstre ved ny endring:**

- **Ny feature:** Type A først (TDD) → Type B hvis output → maks én Type C hvis UI → én Type D for golden path. STOPP. Spør hvis du tenker «bare én test til».
- **Bug-fix fra prod:** Capture log/payload som fikstur FØRST (Approved Logs), så test-feil, så fix.
- **Copy-endring:** Endre source-streng → `npx vitest -u` → review diff visuelt. **Aldri** legg til nye tester.
- **Refactor som rører tester (>3 filer):** Check Alignment — vis skjelett på ÉN fil først, vent på eksplisitt go-ahead, deretter batch resten. Atomic commit per fil. Hvis du oppdager scope-utvidelse underveis: STOPP og spør.

**Universelt forbudt:**

- Kopier-lim av mock-oppsett mellom filer (signal om at det skal være shared helper)
- «Mens jeg var her»-tester som ikke kan forsvares mot endringens scope
- `--no-verify` for å omgå pre-commit-/commit-msg-hook
- Mer enn 3 `toContain`-kall på samme variabel i én test — bruk snapshot

**Eksisterende test-suite er ikke i samsvar.** Cleanup-arbeid spores i et eget GitHub-issue. Inntil det er prioritert: reglene gjelder kun nye endringer, ikke retroaktivt på eksisterende tester.

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

⚠️ Realtime krever eksplisitt `supabase.realtime.setAuth()` med JWT — auto-propagering virker ikke for WebSocket-kanalen (kjent quirk).

**Mail-debug:** Kode-mail går via Supabase Auth (sjekk Auth Logs). Invite/gameFinished/scorecardSubmitted går via Resend (sjekk Resend dashboard + Vercel runtime logs for `[endGame]` / `[submitScorecard]` / `[admin/spillere]`-prefiks). Alle tre Resend-helpers er best-effort med `Promise.allSettled` + `console.error` — feil blokkerer ikke brukerflyten.

### Offline-sync

Lokal-først via Dexie. `writeScore()` → IndexedDB → sync-kø → `upsert_score_if_newer` RPC. Last-write-wins via `client_updated_at`. Sync-worker drainer kø på online-event, focus, og 30-sek-interval. Realtime sub for live updates fra flight-medlemmer.

⚠️ Dexie database heter `'golf-app'` (historisk) — IKKE rename, det invaliderer eksisterende brukeres lokale data.

### RLS

Strengt håndhevet i Postgres. Spillere ser:
- Sine egne scores
- Samme-flight scores under aktivt spill
- ALLE scores etter `games.status = 'finished'`

Helper functions er `SECURITY DEFINER` for å unngå rekursjons-feller.

### Server-actions og caching

`lib/games/getGameWithPlayers.ts` — `unstable_cache`-wrappet helper med tag `game-${id}` og admin-client for RLS-bypass (cookies fungerer ikke inne i cache-callbacks). Authz beholdes på call-site via `me = players.find(...)` → `notFound()`.

Alle game-side-konsumenter leser fra cachen (hull-page, scorecard, submit, approve, game-home, leaderboard). Mutasjons-server-actions kaller `revalidateTag(\`game-${id}\`, 'max')` (Next.js 16 to-arg-form; single-arg er deprecated). Auto-start-fallback i game-home server-component bruker `after(() => revalidateTag(..., { expire: 0 }))` siden `revalidateTag` kaster under render-fase.

`courses(...)` / `tee_boxes(...)` joins er IKKE cachet — caching ville krevd cross-game fan-out på course-edits. Konsumenter som trenger join-data fetcher det som slim direkte-call parallelt med cached helper.

📋 **Backlog:** [GitHub Issues](https://github.com/jdlarssen/golf-app/issues). `TODO.md` er en stub som peker dit — alle nye oppgaver opprettes som issues, ikke i markdown.

## Nøkkelfiler å kjenne til

Discoverable kataloger (`ls components/ui/`, `ls lib/`, etc.) er ikke listet her — kun ikke-åpenbare feller eller konvensjoner som forsvinner uten påminning:

- `lib/scoring/` — scoring-bibliotek (40 unit-tester; ikke rør uten ny test først, per Scoring-logikk)
- `lib/sync/` — Dexie-DB heter `'golf-app'` historisk; **rename = sletter brukernes lokale data**
- `proxy.ts` (ikke `middleware.ts`) — Next.js 16-konvensjonen for middleware
- `app/legal/privacy/page.tsx` — offentlig side; bypass auth-gate via egen `proxy.ts`-matcher
- `lib/games/getGameWithPlayers.ts` — `unstable_cache` med tag `game-${id}`; se «Server-actions og caching»
- `lib/mail/inviteNotification.ts` + `gameFinishedNotification.ts` + `scorecardSubmittedNotification.ts` — tre Resend-helpers, alle best-effort med `Promise.allSettled`
- `app/admin/games/[id]/slett/` + `app/admin/spillere/[id]/slett/` + `app/profile/slett-konto/` — destruktive flyter har dedikerte konfirmasjons-sider; aldri inline-toggle eller `<details>`-popout
- `lib/games/status.ts` — `GameStatus`-union + `STATUS_LABELS` (single source of truth for status-tekster)

[GitHub Issues](https://github.com/jdlarssen/golf-app/issues) er backlog. `docs/launch-checklist.md` er admin-sjekkliste. `docs/email-templates.md` har Supabase Auth-malene. `docs/test-discipline.md` er full referanse for test-typer. `docs/changelog-conventions.md` er CHANGELOG-format. `docs/copy-style.md` er pattern-katalog for bruker-rettet copy. `docs/agent-discipline/` er event-triggede agent-prosedyrer (core.md lastes automatisk øverst i denne fila; prosedyrene leses ved trigger).
