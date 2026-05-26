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

Alt backlog-arbeid spores i [GitHub Issues](https://github.com/jdlarssen/golf-app/issues), ikke i markdown-filer.

#### Branch + PR-flyt (default post-v1.0)

Etter `v1.0.0` (2026-05-13) går alt arbeid via PR — **ikke direkte push til `main`**. Vercel deployer PR-branchen til preview-URL, gir et sjekkpunkt før prod-merge.

1. **Branch:** worktree-branchen er normalt ditt arbeidssted. Hvis du starter en ny fra `main`, gi den et beskrivende navn (f.eks. `issue-19-netto-helper-tekst`).
2. **Commits underveis:** atomiske commits på branchen, alle med `Refs #N` i body. Subagent-prompter må inkludere issue-nummer + Refs-instruks. `Closes #N` i siste commit-body er greit, men det er PR-body-en som er den autoritative auto-close-trigger-en.
3. **Push + PR-create:**
   ```bash
   git push origin <branch>
   gh pr create --base main \
     --title "<conventional-commit-style tittel>" \
     --body "Closes #N

   <tagline fra CHANGELOG-oppføring>"
   ```
4. **Vercel preview-deploy:** Vercel deployer PR-branchen automatisk til en preview-URL. Spot-sjekk i Safari hvis endringen er visuelt synlig.
5. **Merge:** `gh pr merge --rebase --delete-branch` — rebase holder linear `main`-historie og bevarer atomic-commit-disiplinen. **Squash brukes ikke** (mister granulær audit-trail per commit).
6. **Auto-close:** `Closes #N` i PR-body lukker issue-en ved merge. Bekreft med `gh issue view N --json state` hvis usikker.

#### /forge:auto-disiplin (kontrakt-først)

Når brukeren invoker `/forge:auto` uten å spesifisere konkret issue/kontrakt, MÅ hovedchatten følge denne flyten:

1. **Finn åpne issues med eksisterende kontrakt.** To kilder å sjekke:
   - **Primært:** `gh search issues --repo jdlarssen/golf-app 'is:open is:issue "Forge-kontrakt tilgjengelig" in:comments'` — gjenkjenner kontrakt-kommentar-headeren fra `/forge:contract`-disiplinen.
   - **Sekundært (sanity-check):** `ls .forge/contracts/` for `<number>-*.md`-filer på nåværende branch, krysset mot åpen-status via `gh issue view N --json state`.
2. **Hvis funnet:** Hvis det er ett kandidat-issue → kjør `/forge:auto` på den. Hvis flere → vis kort liste med issue-nummer + tittel + branch-navn, spør brukeren hvilken som skal kjøres.
3. **Hvis ingen funnet:** Kjør `/forge:contract` istedenfor. Spør brukeren hvilket åpent issue kontrakten skal skrives for, eller forslå basert på `gh issue list --state open` (filtrert til ikke-`epic` + ikke-`blocks-club-scale`-tunge kandidater).

Hvorfor: `/forge:auto` er ment for autonom utførelse mot en allerede gjennomtenkt spec. Å starte den uten kontrakt betyr at gray-area-diskusjonen skipps og bygge-løkken kjører på antagelser — det er nettopp dette `/forge:contract` skal forhindre. Kontrakt-først-disiplinen sikrer at hver `/forge:auto`-runde har et reelt sannhets-anker.

Aldri start `/forge:auto`-bygge-løkken uten enten (a) en eksisterende kontrakt-fil, eller (b) en kontrakt-kommentar på et åpent issue. Hvis brukeren eksplisitt spesifiserer et issue uten kontrakt: bekreft at de vil hoppe over `/forge:contract`-diskusjonen før du starter bygging.

#### Kontrakt-kommentar (når /forge:contract lager en)

Når `/forge:contract` produserer en kontrakt i `.forge/contracts/<N>-<slug>.md`, MÅ hovedchatten poste den til korresponderende issue via `gh issue comment N --body-file <path>` i samme runde som kontrakten skrives. Format:

```markdown
## 📋 Forge-kontrakt tilgjengelig

Det finnes en eksisterende forge-kontrakt for dette issuet på branchen `<branch-navn>`.

<details>
<summary><strong>Kontrakt: <kontrakt-tittel> — klikk for å vise</strong></summary>

<full markdown-innhold fra .forge/contracts/<N>-<slug>.md>

</details>
```

Hvorfor: kontrakter lever i branch-spesifikke `.forge/contracts/`-mapper og er usynlige for noen som ser på issue-en i nettleseren. Posting på issue-en gjør at scope og beslutninger er tilgjengelig der konteksten finnes, og at fremtidige sesjoner ikke gjør duplikat-arbeid.

Bruk `<details>`-wrapper så issue-siden ikke drukner i veggen av tekst. Bygg comment-body i en temp-fil og post med `--body-file` (kontrakter er 15–30KB, for store til shell-escaping).

Hvis kontrakten revideres senere i samme sesjon: post oppdatert versjon som ny kommentar — ikke editer den gamle. Audit-trail er viktigere enn ren issue-historikk.

#### Closing-kommentar (ALLTID)

Når en issue lukkes, MÅ hovedchatten poste en kommentar med `gh issue comment N --body ...`. Kommentaren har to seksjoner:

- **`## Teknisk`** — hvilke filer/komponenter endret, hvilken approach, evt. avvik fra issue-design, PR-link + commit-SHA-er.
- **`## Funksjonell`** — hva brukeren ser i appen nå, på vanlig norsk, action-orientert. Samme tone som CHANGELOG-taglines («Du kan nå …», «Når X skjer, sier appen nå …»).

Gjelder også når subagenter har gjort selve implementasjonen — hovedchatten skriver closing-kommentaren, ikke subagenten.

#### Avvik fra issue-design

Skal eksplisitt nevnes under «Teknisk» i closing-kommentaren — ikke skjul kutt, scope-endringer eller utsatte deler.

#### Nye funn underveis

Funn som ikke hører hjemme i nåværende issue: opprett ny issue via `gh issue create` (med riktig `type:` + `area:` + scope-labels), spør bruker om det skal gjøres nå eller bare nevnes. Aldri smyge urelaterte fixes inn i nåværende PR.

#### Reviewer-funn (mandatory)

Når code-quality-reviewer, spec-reviewer eller annen subagent rapporterer findings som IKKE landerer i samme PR, MÅ hovedchatten opprette dem som GitHub Issues via `gh issue create` **før PR-merge**. Verbal rapport alene er ikke nok — funn forsvinner ut av kontekstvinduet etter neste sesjon. Adresserte funn (f.eks. JSDoc-stramming i siste commit) nevnes i closing-kommentaren under «Teknisk» i stedet. Ikke filer rene stil-meninger som issues — kun substantielle refactor/test/docs/edge-case-funn.

#### Ingen ceremoni utenom selve PR-en

Ingen start-kommentar, ingen self-assign, ingen `in-progress`-label, ingen `gh issue develop`-call (PR-en gir auto-link til issue-en). Solo dev → minimer ceremoni.

### Versjonering / CHANGELOG

**Regel:** Hver commit som endrer bruker-synlig oppførsel MÅ bumpe `package.json` versjonen og legge til oppføring i `CHANGELOG.md` — i samme commit som selve endringen. Footer i appen (`AppVersionFooter.tsx`) henter automatisk versjonen via `next.config.ts` → `NEXT_PUBLIC_APP_VERSION`, så bumpen blir synlig i prod ved neste deploy.

**Hvilken type bump:**
- **PATCH (`vX.Y.Z+1`)** — bug-fix, copy-justering, perf-forbedring, design-polish. Bruker kan gjøre nøyaktig det samme som før, bare bedre.
- **MINOR (`vX.Y+1.0`)** — ny bruker-synlig feature shipped til prod (ny side, ny knapp, ny spillmodus, ny innstilling).
- **MAJOR (`vX+1.0.0`)** — bryter datamodell eller fundamental UX, krever bruker-kommunikasjon. Pre-1.0.0 (`0.x.y`) brukes som alpha — vi er ikke stabil ennå, så minor-bumps kan inneholde mindre brytende endringer.

**Skip bump for:** rene docs-commits (`docs(...)`), refaktorering uten oppførselsendring (`refactor(...)`), test-only-commits, og `chore(...)` som ikke påvirker brukeren. CHANGELOG-oppføring kan også skippes da.

**Hvordan bumpe:**
- `npm version patch --no-git-tag-version` (eller `minor`/`major`) — oppdaterer `package.json` + `package-lock.json` uten å lage separat tag/commit
- Eller rediger `package.json` direkte (one-liner)
- Inkluder bump-en + CHANGELOG-oppdatering i SAMME commit som feature/fix-en

**CHANGELOG-format:** Tre-lags struktur (tema-heading + tagline-blockquote + Teknisk-details), tagline-veiledning, humanizer-skillet på taglines, og minor-serie-wrapping er dokumentert i [`docs/changelog-conventions.md`](docs/changelog-conventions.md) — les FØR ny oppføring. HTML-kommentar øverst i `CHANGELOG.md` peker dit; `.githooks/commit-msg` peker dit også når den blokkerer.

**Håndheving via git commit-msg-hook (`.githooks/commit-msg`):** regelen er ikke valgfri — hooken blokkerer alle `feat(...)`/`fix(...)`/`perf(...)`-commits som ikke samtidig stager `package.json` (med endret version-felt) og `CHANGELOG.md`. Hooken er aktivert automatisk på `npm install` (via `postinstall` som setter `core.hooksPath=.githooks`). Hvis hooken blokkerer:

1. Hvis commiten faktisk er bruker-synlig: kjør `npm version patch --no-git-tag-version` (eller `minor`/`major`), legg til CHANGELOG-oppføring, stage alle tre filer, og commit på nytt med samme melding.
2. Hvis commiten IKKE er bruker-synlig: bytt prefix til `docs(...)`, `refactor(...)`, `test(...)`, `chore(...)`, `style(...)`, `ci(...)` eller `build(...)`.
3. Aldri bruk `--no-verify` for å omgå hooken — det bryter disiplinen og gjør at footeren henger etter prod-state.

Skip-typene over (`docs/refactor/test/chore/style/ci/build`) passerer fritt — hooken slår kun ut på bruker-synlige prefikser.

### Språk-kvalitet i bruker-rettet copy

Når du legger til eller endrer norske strenger som vises til brukeren — i `.tsx`/`.ts`-filer, mail-templates (`lib/mail/`), feilmeldinger, banner-tekster, knappe-tekster, helper-tekster — kjør `humanizer:humanizer`-skillet (fra `floka-marketplace`) på det du har skrevet før commit. Pre-commit-hooken `.githooks/pre-commit` advarer (men blokkerer ikke) ved kjente AI-tells i nye linjer i `.tsx`/`.ts`-filer. Markdown-filer skannes ikke.

**Full pattern-katalog + engelsk-konvertering (`no-nb`-skill) + code-switching-eksempler:** [`docs/copy-style.md`](docs/copy-style.md). `.githooks/pre-commit` peker dit når den advarer.

**Hva hooken fanger mekanisk:**
- «X-spillet»-redundans (`slagspill-spillet` → `slagspillet`, `matchplay-spillet` → `matchen`, `par-stableford-spillet` → `par-stableford-runden`)
- «Vennligst»-overforbruk
- «Tap»-anglism (`Tap kort` → `Trykk kort`)
- Em-dash-kjeder (`X — Y — Z` → splitt med punktum/komma/parens)

**Bevisst bevart (false-positives å ignorere ved hook-advarsel):**
- Brand-tagline `Tørny — fyr opp golfturneringen` (kanonisk per `### Brand`)
- Mail-subject «Resultatet er klart — ${gameName}» (5 snapshot-tester låser eksakt streng)
- «Sekretariat»-stemmen i admin-flater
- Engelske achievement-navn (Turkey/Solid/Snowman — bevisste sportstermer)

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

[GitHub Issues](https://github.com/jdlarssen/golf-app/issues) er backlog. `docs/launch-checklist.md` er admin-sjekkliste. `docs/email-templates.md` har Supabase Auth-malene. `docs/test-discipline.md` er full referanse for test-typer. `docs/changelog-conventions.md` er CHANGELOG-format. `docs/copy-style.md` er pattern-katalog for bruker-rettet copy.
