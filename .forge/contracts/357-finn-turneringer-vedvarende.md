# Spec: «Finn turneringer» — vedvarende inngang + manual_approval

Issue: #357 (`enhancement`, `area:ui`). Flyt: «Bli med i et spill» (`docs/flows/02-bli-med-i-spill-fremtid.svg`).

## Problem
Discovery-seksjonen («Funn turneringer», #257) rendres **kun** i hjem-empty-state for ikke-skapere (`app/page.tsx`, gated på `isEmptyState && !canCreateGame`). Har spilleren ≥1 spill, finnes ingen vei fra Hjem til å oppdage/melde seg på nye spill — en blindvei i kjernesløyfa «bli med». I tillegg viser `getDiscoverableGames` i dag bare `registration_mode = 'open'`, så `manual_approval`-spill (be om å bli med) er usynlige selv om de er ment å være offentlig oppdagbare. Beslutning fra flyt-2-gjennomgangen: **påmeldingsmåten ER synligheten** — `open` + `manual_approval` er oppdagbare, `invite_only` er privat. Ingen egen synlighets-bryter.

## Research Findings
Ingen ekstern bibliotek-research nødvendig — funksjonen gjenbruker 100 % etablerte in-repo-mønstre: admin-client server-query (`getDiscoverableGames`), Next.js 16 server-component-side, signup-ruten (`/signup/[shortId]` håndterer allerede begge modi), og UI-primitives (`Card`, `LinkButton`, `Section`, `SmartLink`). DeepWiki er ikke tilkoblet; intet nytt API å verifisere.

## Prior Decisions
- **#355 (bunn-nav):** Bunn-nav-en har **tre faste faner** (Hjem/Innboks/Profil). En 4. fane er eksplisitt #392 (Klubbhuset) sitt territorium. → «Finn turneringer» blir **ikke** en bunn-nav-fane; den er en inngang på Hjem.
- **#346 / «én vei til rom»:** Én vedvarende inngang per flyt. Discovery får én Hjem-inngang, ikke spredt over flere flater.
- **#257:** Eksisterende `getDiscoverableGames` + `HomeDiscoverySection` er fundamentet — utvides, ikke erstattes. Bruker admin-client for å bypass game-rads SELECT-policy (non-member skal kunne SE open-spill).
- **Flyt 2 «påmeldingsmåten ER synligheten»:** `open`+`manual_approval` → oppdagbar; `invite_only` → privat. Gjenbruk `registration_mode`, ingen ny kolonne.

## Design
**Tre-delt endring.**

1. **Data (`lib/games/getDiscoverableGames.ts`):**
   - Bytt `.eq('registration_mode', 'open')` → `.in('registration_mode', ['open', 'manual_approval'])`.
   - Legg `registration_mode` til SELECT og til `DiscoverableOpenGame`-typen (`'open' | 'manual_approval'`), så kortet kan velge CTA.
   - Behold alt annet: ekskludering av spill brukeren alt er med i / har pending+approved forespørsel til, `status in ('draft','scheduled')`, sortering på tee-off, og `limit`. Bump `limit` fra 10 → 50 (dedikert side viser «alle»; 10 var vilkårlig). Pending-requests-delen er uendret.

2. **Dedikert side (`app/finn-turneringer/page.tsx`, NY):**
   - Server-component. Innlogging gates av `proxy.ts`. Henter `getDiscoverableGames(userId)`.
   - Standard side-chrome som søsken-sidene (f.eks. `/spillformer`): `TopBar` med tilbake-pil + tittel «Finn turneringer» (verifiser mønster i build).
   - Rendrer listene via **gjenbrukt `HomeDiscoverySection`** (åpne spill + mine forespørsler).
   - **Tom-tilstand** (ingen oppdagbare spill og ingen forespørsler): vennlig norsk melding, f.eks. «Ingen åpne turneringer akkurat nå. Be en arrangør om en invitasjon, eller stikk innom senere.»

3. **Hjem-inngang (`app/page.tsx`):**
   - I has-games-grenen (etter `isEmptyState`-returen), i `<nav>`-lista: legg til en «Finn turneringer»-`Section`/`Card` (samme stil som «Spillformer»-kortet) som lenker til `/finn-turneringer`. Plasseres etter «Spillformer».
   - **Gating:** vis kun for `!canCreateGame` (spillere) — paritet med dagens discovery-gating; admin har Sekretariatet, betrodde opprettere går til /opprett-spill.
   - Empty-state-grenen beholder dagens inline `HomeDiscoverySection` (velkomst-øyeblikket — vis spillene direkte). Uendret.

4. **CTA per modus (`app/HomeDiscoverySection.tsx`):**
   - Tråd `registration_mode` inn i `OpenGameCard`. `open` → «Meld meg på». `manual_approval` → «Be om å bli med». Begge lenker til `/signup/${short_id}` (siden ruter selv på modus).

## Edge Cases & Guardrails
- **`invite_only` skal ALDRI vises** — verken på Hjem eller siden. Query-filteret er eneste kilde; dekkes av unit-test.
- **Allerede med / allerede forespurt:** fortsatt ekskludert (eksisterende `excludedIds`-logikk). Ikke regresjon.
- **Admin / betrodde opprettere:** ser ikke Hjem-kortet. Selve `/finn-turneringer`-ruten er nåbar for alle innloggede (uskadelig om en admin åpner den direkte) — vi gater inngangen, ikke ruten, for å holde det enkelt.
- **Tom liste:** siden viser vennlig tom-tilstand, ikke en blank side.
- **`course_name`/`scheduled_tee_off_at` null:** allerede håndtert i `OpenGameCard` («Bane ikke valgt», ingen tid). Behold.

## Key Decisions
- **Plassering = dedikert side via Hjem-kort** (bruker-valg 2026-06-02) — holder Hjem fokusert på egne spill, 1 tap, naturlig hjem for søk/filter senere (#369). Alternativ «inline seksjon» forkastet (lengre Hjem, live-liste under egne spill).
- **CTA-tekst:** `manual_approval` → «Be om å bli med» (issue-ordlyd), `open` → «Meld meg på».
- **Ikke en bunn-nav-fane** (reservert #392).

**Claude's Discretion:**
- Eksakt copy på tom-tilstand + om Hjem-kortet får en kort underliggende tekst.
- Om `getDiscoverableGames` skal ta en valgfri `limit`-param eller bare bumpes til 50 (foretrekk det enkleste som ikke bryter empty-state-bruken).
- Render-test plassering (på `HomeDiscoverySection` eller siden) — én test som dekker CTA-per-modus-svitsjen.
- Verifiser om flyt-2-fremtidsdiagrammet allerede inkluderer discovery-inngangen; oppdater + regenerer PNG kun hvis pathen faktisk endrer seg (per `docs/flows/README.md`).

## Success Criteria
- [ ] `getDiscoverableGames` returnerer både `open` og `manual_approval` (aldri `invite_only`), hver med sin `registration_mode` — verifisert i `getDiscoverableGames.test.ts`.
- [ ] En ikke-admin med ≥1 spill ser en vedvarende «Finn turneringer»-inngang på Hjem som lenker til `/finn-turneringer` (≤1 tap) — Playwright + `app/page.tsx`-ref.
- [ ] `/finn-turneringer` lister oppdagbare spill med riktig CTA per modus (`open`→«Meld meg på», `manual_approval`→«Be om å bli med»), og ekskluderer spill brukeren alt er med i / har forespurt — render-test + Playwright.
- [ ] `invite_only`-spill vises aldri i discovery — unit-test asserter eksklusjon.
- [ ] `/finn-turneringer` har vennlig tom-tilstand når ingenting er oppdagbart — observert/Playwright.
- [ ] Admin/betrodde opprettere ser ikke Hjem-kortet (paritet med dagens `!canCreateGame`) — `app/page.tsx`-ref + observert.
- [ ] Dagens Hjem-empty-state-discovery fungerer fortsatt (samme datakilde, ingen regresjon) — Playwright/unit.

## Gates
- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run lib/games/getDiscoverableGames.test.ts` + render-test passerer
- [ ] `npm run lint` passerer (endrede filer)
- [ ] `npm run build` passerer (ny rute kompilerer)
- [ ] Playwright (preview-tools) verifiserer kriterium 2, 3, 5 i nettleser
- [ ] `feat(...)`-commit bumper `package.json` (MINOR) + `CHANGELOG.md` (commit-msg-hook håndhever)

## Files Likely Touched
- `lib/games/getDiscoverableGames.ts` — inkluder `manual_approval`, returner `registration_mode`, bump limit.
- `lib/games/getDiscoverableGames.test.ts` — utvid Type A: manual_approval inkludert, invite_only ekskludert, mode returnert.
- `app/HomeDiscoverySection.tsx` — tråd `registration_mode` → CTA-label per modus.
- `app/finn-turneringer/page.tsx` — NY dedikert side (TopBar, gjenbruk `HomeDiscoverySection`, tom-tilstand).
- `app/page.tsx` — «Finn turneringer»-inngangskort i has-games-nav, gated `!canCreateGame`.
- (ny render-test-fil for CTA-per-modus)
- `package.json` + `CHANGELOG.md` — MINOR-bump + oppføring.

## Out of Scope
- 4. bunn-nav-fane / Klubbhuset (#392).
- Søk/filter/sortering på discovery-siden (framtid, #369).
- Wizard-tydelighet på påmeldingsvalg (#367 — parnet, eget issue; uten det defaulter nye spill til `invite_only` så lista kan være tom).
- Default-policy for `registration_mode` (flyt-4-beslutning).
- Ny E2E-spec — golden path dekkes av Playwright-verifisering i evaluator + unit/render-tester.
- Realtime-oppdatering av discovery-lista.
