# Spec: La anonyme browse offentlige turneringer før login (#1185)

## Problem

`/finn-turneringer` redirecter uinnloggede til `/login?next=/finn-turneringer`
(`app/[locale]/finn-turneringer/page.tsx:50-53`), og `proxy.ts` slipper ikke ruta gjennom
for anonyme. Turnerings-oppdagelse er dermed usynlig uten konto. UX Peak-prinsipp
**resiprositet**: gi verdi før du ber. En fremmed som får høre om Tørny skal kunne SE at
det finnes åpne turneringer å bli med i — før login-veggen. Flyt 2 (bli med / oppdage spill).

## Research Findings

- **Ruta gates to steder:** (1) `proxy.ts:22-23` `PUBLIC_PATH_PATTERN` mangler `finn-turneringer`,
  så proxy redirecter anonyme til `/login` (`proxy.ts:61-75`) før siden kjører; (2) siden selv
  redirecter når `getProxyVerifiedUserId()` er null (`finn-turneringer/page.tsx:50-53`). Begge må endres.
- **Offentlig synlighet er alt definert:** `lib/games/publicSignupVisibility.ts:22-28`
  `isPubliclyViewable(game)` = `status==='scheduled'` AND `registration_mode ∈ {open, manual_approval}`
  AND `signups_closed_at == null` — EKSAKT «spill med åpen selv-påmelding / offentlig plakat» (#1022).
  Ren, unit-testet funksjon.
- **Anon-lesing skjer via admin-client, ikke RLS:** både `getGameByShortId.ts:1-20` og
  `getDiscoverableGames.ts:7-15` bruker `getAdminClient()` (service role) for å bypasse games'
  medlemskaps-gatede SELECT-policy. Sikkerhetsgrensen er **felt-whitelist i SELECT**. → Anon-listingen
  trenger INGEN ny RLS-policy/RPC.
- **`getDiscoverableGames` gjenbrukes IKKE for anon:** krever `userId`, ekskluderer joined/requested,
  fletter klubb-/venne-spill, og inkluderer `draft` (upublisert, skal ikke vises anonymt). → Ny slank
  anon-helper som lister KUN `isPubliclyViewable`-spill.
- **`HomeDiscoverySection` gjenbrukes IKKE for anon:** kort-CTA-er («Meld meg på»/«Be om å bli med») er
  auth-krevende server-actions. Anon trenger read-only-kort som lenker til plakaten.
- **Offentlig landing finnes:** `app/[locale]/signup/[shortId]/PublicLandingView.tsx` + `page.tsx`
  (#1022) rendrer offentlig spill-info + «Bli med»→login. Anon-kort kan lenke til `/signup/{short_id}`
  og la den siden håndtere login-round-trippen. `discover`-namespace (`messages/no.json:4312`) har
  copy, men tom-tilstanden er innlogget-vinklet — anon trenger login-vinklet variant.

## Prior Decisions

- **Eier (denne økten) — bakes inn som Key Decision:** anonyme ser KUN spill med åpen selv-påmelding
  (nøyaktig `isPubliclyViewable` = de som alt har offentlig plakat via `/signup/[shortId]`). INGEN ny
  data-eksponering — bare gjort finnbart uten lenke. Pågående/ferdige spill + spillerlister IKKE med.
  CTA = «Logg inn for å bli med» (eller direkte til plakaten, som håndterer login selv).
- **#357:** etablerte ruta + «påmeldingsmåten ER synligheten» (open+manual_approval oppdagbar, invite_only
  privat) — prior art for plassering. **#1022:** `isPubliclyViewable` + offentlig landing + felt-whitelist
  som sikkerhetsgrense; anon-lista eksponerer MINDRE enn plakaten (kun metadata, ingen roster). **#199:**
  short_id + registration_mode-grunnmuren. **#559:** ugyldig lenke → login, ikke 404 (behold for direkte-URL).

## Design

**1. Proxy-whitelist** (`proxy.ts:22-23`): legg `finn-turneringer` inn i `PUBLIC_PATH_PATTERN`s
andre alternativ-gruppe → `^\/(legal|signup|spectate|baner|embed|demo|finn-turneringer)(\/|$)`.
Da hopper proxy auth-arbeidet og lar next-intl-routingen kjøre (som for `signup`/`baner`).

**2. Ny slank anon-helper** (`lib/games/getPublicDiscoverableGames.ts`, NY): admin-client-query
som lister spill der `isPubliclyViewable` er sant — `status='scheduled'`, `registration_mode ∈
{open, manual_approval}`, `signups_closed_at IS NULL` — med felt-whitelist (`id, name, short_id,
scheduled_tee_off_at, registration_mode, courses(name)`, samme trygge sett som
`DiscoverableOpenGame`). Sortert på tee-off. INGEN roster, INGEN persondata. Ren predikat-logikk
kan gjenbruke/parallellere `isPubliclyViewable`-kriteriene (samme regel, ett hjem).

**3. Side-forgrening** (`finn-turneringer/page.tsx`): når `userId` er null, IKKE redirect — render
en anonym visning:
- Offentlig chrome (BrandMark + LocaleSwitcher, samme mønster som `PublicLandingView`/login).
- Liste av `getPublicDiscoverableGames()`-spill som read-only-kort → hvert lenker til
  `/signup/{short_id}` (offentlig plakat, håndterer login selv).
- Tydelig «Logg inn for å bli med»-CTA (→ `/login?next=/finn-turneringer`).
- Tom-tilstand for anonyme (se Edge Cases).
Innlogget gren er UENDRET (dagens `getDiscoverableGames` + `HomeDiscoverySection`).

## Edge Cases & Guardrails

- **Passert tee-tid / teet av:** startet spill er `status='active'`, alt ekskludert av predikatet
  (kun `scheduled`; auto-start-cron #502 flytter scheduled→active). Restrisiko: `scheduled`-spill hvis
  tee-tid akkurat passerte før cron fyrer — Claude's Discretion: la stå (plakaten gater selv) eller
  filtrer `scheduled_tee_off_at < now()`. Velg det minst villedende.
- **Fullt spill:** ingen `max_players`-gate i predikatet; påmeldings-actionen håndterer fullhet ved
  forsøk. Anon-lista lister det i v1 — ikke bygg fullhets-beregning her uten eier-signal.
- **Tom liste + ingen persondata:** login-vinklet tom-tilstand (aldri blank side); anon-select-en
  select-er ALDRI roster/e-post/hcp — kun spill-metadata + banenavn (strengere enn plakaten). Verifiser
  0 navn i HTML.
- **Direkte-URL til privat/ukjent spill** er urørt (går via `/signup/[shortId]`, #559 bevart) — dette
  legger kun til en LISTE. Innlogget `/finn-turneringer` skal fungere eksakt som før.

## Key Decisions

- **Anonym liste = `isPubliclyViewable`-spill, intet mer** (eier). Gjenbruk predikatet fra #1022 —
  ingen ny synlighets-regel, ingen ny data-eksponering.
- **Admin-client + felt-whitelist, INGEN ny RLS-policy/RPC** — samme mønster som `getGameByShortId`/
  `getDiscoverableGames`. (Ingen DB-migrasjon; hvis en policy likevel skulle vise seg nødvendig:
  staging først, prod etter eier-godkjenning — men mål er å unngå det helt.)
- **Kort lenker til `/signup/[shortId]`** (offentlig plakat håndterer login) + en global «Logg inn»-CTA.
- **Egen anon-visning, ikke gjenbruk av `HomeDiscoverySection`** (dens CTA-er krever auth).

**Claude's Discretion:**
- Om anon-kortene skal være en ny liten komponent eller en lettvekts-variant av `OpenGameCard` med
  `href`-CTA i stedet for action-CTA.
- Filtrering av passert tee-tid (behold vs skjul) — velg det minst villedende.
- Eksakt anon-copy (liste-tittel, kort-CTA-tekst, tom-tilstand, login-CTA) — humaniseres.
- Om anon-siden også får en diskret «Slik funker Tørny»-linje mot `demo`/landing (kun hvis lavt-kost).

## Success Criteria

- [x] Uinnlogget `GET /finn-turneringer` → 200 (ikke login-redirect), viser liste av åpne turneringer — staging. → staging (v1.200.1): anon `curl` + rendered view viser BrandHero + «Åpne turneringer» + kort «ANON-QA-1185 Testturnering · Byneset North». Ingen login-redirect.
- [x] Anon-lista = KUN `isPubliclyViewable`-spill; `invite_only`/`draft`/`active`/stengt vises ALDRI —
      verifisert mot #1022-fixturene (open/scheduled vises, invite_only/stengt ikke). → `lib/games/getPublicDiscoverableGames.test.ts` «predikat-gate dropper alt som ikke er isPubliclyViewable» (mock lekker invite_only/draft/active/closed, kun open+manual overlever).
- [x] Anon-HTML lekker INGEN persondata (0 navn/e-post/hcp) — grep. → staging: seedet offentlig spill med 2 ekte spillere («Test Admin», «Test Spiller»). `grep` mot anon /finn-turneringer-HTML: begge navn = 0 treff. Plakaten `/signup/tpc5xxxa` viser derimot «Test A»/«Test S» — anon-lista er strengere enn plakaten, som designet.
- [x] Kort lenker til `/signup/{short_id}`; global «Logg inn»-CTA → `/login?next=/finn-turneringer`;
      tom liste → login-vinklet tom-tilstand. → `AnonDiscoverySection.tsx` (SmartLink→/signup/[shortId]), `page.tsx:73/90` loginCta + `page.tsx:81-95` login-vinklet tom-tilstand.
- [x] Innlogget `/finn-turneringer` uendret (ingen regresjon) — staging-klikkrunde. → staging: innlogget admin (OTP) ser BackLink + «FINN TURNERINGER»-kicker + PageHeader + HomeDiscoverySection med action-CTA («Be om å bli med»). ⚠️ AVVIK: proxy-whitelistingen fjernet `x-torny-user-id`-headeren, så `getProxyVerifiedUserId()` ga null og innloggede fikk anon-visningen. Fanget i denne klikkrunden, fikset (commit `bcba26e1`): leser nå bruker via server-klient (cookies), som `/signup/[shortId]`.
- [x] INGEN ny RLS-policy/RPC/DB-migrasjon (admin-client + felt-whitelist er grensen) — bekreftet i diff. → `git show --stat` rører ingen `supabase/`; helper bruker `getAdminClient()`.

## Gates

- [x] `npx tsc --noEmit` + `npm run lint` grønn (endrede filer). → tsc exit 0; eslint exit 0.
- [x] `npx vitest run lib/games` (ny anon-helper + evt. predikat-test) grønn. → 5/5 nye + getDiscoverableGames grønn.
- [x] `npm run build` grønn (ruta bygger, proxy-regex gyldig). → build printet full rute-tre + Proxy (Middleware), ingen feil.
- [x] catalogParity grønn (ny anon-copy no + en); humanizer kjørt. → catalogParity + apostropheParity grønn (26 tester); humanizer-skill kjørt på anon-copy.
- [x] Bruker-synlig → staging-klikkrunde av flyt 2 (anonym browse → plakat → login) før merge. → anon-lista rendret; kort → plakat `/signup/tpc5xxxa` (public-landing rendret); plakatens «Bli med» → `/login?next=`. Innlogget regresjon fanget + fikset (se over).
- [x] E2E som rører flyten: assert på `data-testid`/role, ALDRI norsk copy. → `e2e/discover/anon-finn-turneringer.spec.ts` (1 passed): uinnlogget /finn-turneringer ingen login-redirect, `anon-finn-turneringer`-wrapper + `anon-login-cta`→/login. Driver på data-testid.
- [x] `feat` → MINOR-bump + CHANGELOG Funksjoner-linje. → 1.199.0 → 1.200.0; CHANGELOG «1.200 · Bla i åpne turneringer før du logger inn».

## Files Likely Touched

- `proxy.ts` — `finn-turneringer` inn i `PUBLIC_PATH_PATTERN`.
- `app/[locale]/finn-turneringer/page.tsx` — anon-gren (ingen redirect for null userId).
- `lib/games/getPublicDiscoverableGames.ts` (+ evt. test) — NY slank anon-helper, felt-whitelist.
- (evt.) ny anon-liste-komponent eller `OpenGameCard`-variant med `href`-CTA.
- `messages/no.json` + `messages/en.json` — anon-copy (liste-tittel, tom-tilstand, login-CTA).
- `package.json` + `CHANGELOG.md`.
- (evt.) `docs/flows/02-bli-med-i-spill-fremtid.svg` + PNG hvis anon-inngangen endrer flyt-pathen.

## Out of Scope

- Eksponering av spillerlister / pågående / ferdige spill for anonyme (eier: ikke med).
- Ny RLS-policy for anon direkte-lesing av `games` (admin-client dekker behovet).
- Søk/filter/sortering på anon-lista (#369, framtid).
- Selve påmeldings-handlingen for anonyme (går via `/signup/[shortId]`s eksisterende login-round-trip).
- OG-bilde / plakat for `/finn-turneringer` (plakaten bor på det enkelte spillet, #1022).
- Endring av `getDiscoverableGames` (innlogget-flyten) utover ingenting.
