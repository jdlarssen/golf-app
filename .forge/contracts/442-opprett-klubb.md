# Spec: Opprett klubb — eierskap + klubb-scoped oppdagbarhet (#442)

**Issue:** [#442](https://github.com/jdlarssen/golf-app/issues/442) · `enhancement` · `blocks-club-scale`
**Milestone:** Klubb-skala (epic) · **Branch:** `claude/zealous-dirac-be94d4`
**Substrat:** #49 (`groups` + `group_members`, migrasjon 0074) — shipped.

## Problem
Tørny har siden #49 et medlemskaps-fundament (`groups`, `group_members`, `group_role`, RLS,
`is_group_member`/`is_group_admin`-helpere) — men **ingen UI og ingen kobling til spill**. En klubb
er ment å være den navngitte, styrte containeren ting kan *høre til*; kjerneverdien som skiller en
klubb fra en venneliste er **oppdagbarhet**: turneringer opprettet i en klubb er synlige og åpne for
klubbens medlemmer. Denne saken bygger opprett-klubb-flyten (eier = oppretter), medlemsstyring, og
låser opp `group_id`-på-spill + klubb-scoped «Finn turneringer» som ble bevisst utsatt i #49.

## Eier-beslutninger (2026-06-05)
- **Klubb-tak = 2** klubber *opprettet* (eid) per bruker. Brems mot spøkelse-klubber; trivielt å heve
  i #50. (Ingen tak på hvor mange klubber man er *medlem* av.)
- **Medlemskap = nøkkelen:** et klubb-medlem ser OG kan melde seg på alle klubbens turneringer —
  også de som ellers er `invite_only`. Å være medlem ER invitasjonen. Dette er hele poenget.
- **Klubb-valg i veiviseren:** opprett-spill får et valgfritt «Hvem er dette for?»-steg
  (Ingen klubb / dine klubber). Klubb-siden kan dyplenke inn med klubben forhåndsvalgt.
- **Begge medlems-veier:** eier legger til på e-post (eksisterende brukere) **og** deler en
  klubb-lenke der folk ber om å bli med og eier godkjenner.

## Prior Decisions (fra eksisterende kontrakter)
- **#49:** `group_members.role` (owner/admin/member) finnes; `is_group_member`/`is_group_admin` er
  `security definer stable set search_path=''`, EXECUTE revoked fra anon/public. Owner-bootstrap ble
  flagget som åpent problem (et nytt medlem kan ikke self-grante `owner` under RLS) → **løses her med
  en SECURITY DEFINER `create_club`-RPC.** Speil 0071-helper-stil + 0016-trigger-stil for INSERT.
- **#357:** `getDiscoverableGames(userId)` bruker admin-client for å bypass game-rads SELECT-policy
  (non-member skal kunne SE open-spill). Klubb-scoping utvider denne, erstatter den ikke.
- **#392:** Klubbhuset (`/admin` for admin, `PlayerKlubbhus`-grenen for ikke-admin) er det naturlige
  hjemmet. Tile-grid brancher allerede på rolle. «Klubber» blir en ny inngang der.
- **#199/#368:** Signup-ruten (`/signup/[shortId]`) håndterer alle modi; `registerForOpenGame`
  (direkte `game_players`-insert via admin-client) og `requestApproval` finnes. `invite_only` tar
  imot request-via-lenke. Klubb-medlem skal få **direkte-join** på klubb-spill uansett modus.
- **Destruktive handlinger** (repo-regel): dedikert konfirmasjons-rute, aldri inline-toggle/`<details>`.

## Research Findings (in-repo mønstre å speile)
- `generate_game_short_id()` (0041): 8-char base36, retry-til-unik, format-check `^[0-9a-z]{8}$`,
  UNIQUE. **Speiles som `generate_group_short_id()`** for klubb-lenke.
- `game_registration_requests` (0042): `registration_request_status` enum
  (pending/approved/rejected/withdrawn), `is_game_creator_or_admin()`-helper, RLS (self-insert pending /
  admin-update / self-withdraw), `unique(game_id,user_id)`. **`group_join_requests` speiler dette
  1:1** (uten lag-felter; gjenbruk `registration_request_status`-enumet).
- `notifications.kind` er **text + CHECK-constraint** (ikke DB-enum) → ny kind = drop/re-add CHECK
  (mønster 0044) + `NotificationKind`-union + zod-schema i `lib/notifications/types.ts`. `notify()`
  er best-effort (`shouldAlsoSendMail`-retur for mail-backup).
- Server-action-konvensjon (`app/admin/courses/new/actions.ts`, `app/invite/actions.ts`): auth →
  validér → insert via request-scoped client (RLS) eller admin-client (når authz er sjekket i kode)
  → `revalidateTag` → redirect med status-kode i query-param. Best-effort notify via `Promise.allSettled`.

## Design

### A. Schema (migrasjon 0075 — høyeste applyte er 0074)
1. **`games.group_id`** — `uuid references public.groups(id) on delete set null`, nullable; index.
   Et spill hører valgfritt til én klubb. `on delete set null` så sletting av klubb ikke dreper spill.
2. **`groups.short_id`** — speil games-mønsteret: `generate_group_short_id()`, backfill eksisterende
   `'Tørny'`-gruppe, deretter `not null` + `default` + format-check + `unique` + index.
3. **`group_join_requests`** — speil `game_registration_requests` (uten team-felter): `id`, `group_id`
   (→ groups, cascade), `user_id` (→ users, cascade), `status` (`registration_request_status`,
   default pending), `message text` (≤200, valgfri), `decided_at`, `decided_by_user_id`, `created_at`,
   `unique(group_id, user_id)`, indekser på (group_id,status) + (user_id). RLS:
   - SELECT: `user_id = auth.uid() OR is_group_admin(group_id)`
   - INSERT: `user_id = auth.uid() AND status = 'pending'` (gruppe må eksistere)
   - UPDATE (avgjør): `is_group_admin(group_id)`; (self-withdraw): `user_id=auth.uid() AND pending→withdrawn`
4. **SECURITY DEFINER-RPCer** (speil 0071-stil: `set search_path=''`, fullt skjema-kvalifisert,
   revoke anon/public + grant authenticated):
   - `create_club(p_name text) returns uuid` — `auth.uid()` påkrevd; trim+ikke-tom navn;
     **cap-sjekk:** `count(groups where created_by = auth.uid()) >= 2` → `raise exception 'club_cap_reached'`;
     insert group (+ short_id), insert `group_members(group_id, uid, 'owner')`, return group-id.
     **Dette løser owner-bootstrap atomisk.**
   - `add_club_member_by_email(p_group_id uuid, p_email text) returns text` — `is_group_admin` påkrevd;
     slå opp `users.id` på `lower(email)`; `not_found` hvis ingen; ellers insert membership
     `on conflict do nothing`; returner `'added' | 'not_found' | 'already_member'`.
   - `decide_join_request(p_request_id uuid, p_approve boolean) returns text` — `is_group_admin` på
     requestens group; approve → insert membership (on conflict do nothing) + status='approved'+decided;
     reject → status='rejected'+decided; returner ny status.
5. **Notifications:** ny kind `club_join_request` (eier varsles ved forespørsel). Drop/re-add
   `notifications_kind_check`. (`club_join_decided` til søker = **Claude's discretion**, nice-to-have.)
6. **Apply via MCP `apply_migration`** (additiv + ureferert til kode deployes — innenfor «test i prod»-
   avtalen, jf. #49). Regenerer `lib/database.types.ts`. Verifiser med `execute_sql`.

### B. Opprett klubb + Klubber-hjem (Klubbhuset-inngang)
- **`/klubber`** (NY) — listen over klubber jeg er medlem av (navn + min rolle-badge) + «Opprett
  klubb»-dør (skjult/disabled med vennlig tekst når cap=2 nådd). Hver lenker til `/klubber/[id]`.
- **`/klubber/ny`** (NY) — enkelt navn-skjema → `createClub`-action kaller `create_club`-RPC.
  `club_cap_reached` → vennlig norsk melding («Du kan opprette inntil 2 klubber …»).
- **Klubbhuset-inngang:** «Klubber»-tile i `PlayerKlubbhus`-grenen (ved siden av Spill + Baner) og i
  admin-tile-griden (`app/admin/page.tsx`), → `/klubber`.

### C. Klubb-side (`/klubber/[id]`, NY)
- Header: klubbnavn. Medlemsliste (navn + rolle). Klubbens spill (lenke til hvert).
- **Eier/admin-kontroller:** legg til medlem på e-post (`add_club_member_by_email`; `not_found` →
  «Fant ingen Tørny-bruker med den e-posten — be dem lage konto først»); kopier del-lenke
  (`/klubber/bli-med/[short_id]`); ventende forespørsler m/ Godkjenn/Avslå (`decide_join_request`);
  «Opprett spill for klubben» → `/opprett-spill?klubb=[id]`.
- **Fjern medlem:** dedikert konfirmasjons-rute (f.eks. `/klubber/[id]/fjern/[userId]`). DELETE på
  `group_members` (RLS `is_group_admin` tillater). Eier kan ikke fjernes/forlate som siste owner.
- **Forlat klubb** (medlem): dedikert konfirmasjons-rute (`/klubber/[id]/forlat`). Self-DELETE (RLS
  tillater `user_id = auth.uid()`).

### D. Bli-med-lenke (request → godkjenning)
- **`/klubber/bli-med/[shortId]`** (NY) — landingsside: klubbnavn + «Be om å bli med». Allerede
  medlem → «Du er allerede medlem». Innsending → insert `group_join_requests` (pending) + best-effort
  `notify({kind:'club_join_request'})` til alle group-admins/owner. Avgjøres på klubb-siden (C).

### E. Veiviser-klubbvalg (Q3)
- `getNewGameFormData()` returnerer også `clubs` (mine grupper: id, name). `GameWizard` får et valgfritt
  «Hvem er dette for?»-steg/felt: «Ingen klubb» (default) / radioliste av mine klubber. `?klubb=[id]`
  forhåndsvelger. `createGameInternal` setter `group_id` på insert — **authz:** valgt gruppe må være én
  brukeren er medlem av (verifiser i action før insert; ellers `group_id = null`).

### F. Klubb-scoped discovery + join (Q2 = medlemskap er nøkkelen)
- `getDiscoverableGames(userId)` returnerer i tillegg **`clubGames`**: spill der `group_id ∈ (mine
  klubb-ider)`, `status in ('draft','scheduled')`, **uansett `registration_mode`**, ekskludert dem jeg
  alt er med i / har forespurt. Hver bærer `group_name` for badge. Dedup: et spill vises kun én gang
  (klubb-seksjon vinner over global open-liste).
- **«Finn turneringer»** (`app/finn-turneringer/page.tsx` + `HomeDiscoverySection`) får en «I dine
  klubber»-seksjon (clubGames) over de globale open-spillene. CTA på klubb-spill = «Meld meg på»
  (direkte-join).
- **Direkte-join på klubb-spill:** signup-flyten lar et klubb-medlem melde seg på et klubb-spill
  uansett modus. Regel: `canDirectJoin = mode==='open' OR (game.group_id && is_group_member(group_id))`.
  `registerForOpenGame` (eller en parallell gren) utvides til å tillate insert når `canDirectJoin`;
  `/signup/[shortId]/page.tsx` speiler regelen så et medlem ser «Meld meg på» på et klubb-`invite_only`-spill.

## Edge Cases & Guardrails
- **Cap:** `create_club` håndhever ≥2 server-side (UI-gating er kun kosmetikk). Jørgens backfill-`'Tørny'`
  teller som 1 opprettet → han kan lage 1 til. OK.
- **Owner-bootstrap:** kun via `create_club`-RPC (security definer) — aldri direkte `group_members`-insert
  fra klient for første owner (RLS blokkerer det med vilje).
- **Siste owner:** en klubb må alltid ha ≥1 owner. Fjern/forlat-flyten blokkerer å fjerne siste owner
  (sjekk i action/RPC; vennlig melding «Overfør eierskap først» — overføring er #50, så her: bare blokkér).
- **`add_club_member_by_email`:** kun eksisterende brukere; ikke-registrert e-post → vennlig avvisning
  (ikke en feil). Ikke lekk om e-posten finnes utover «lagt til / ikke funnet».
- **group_id-authz i wizard:** en bruker kan ikke scope et spill til en klubb de ikke er medlem av
  (verifiseres i action). Sletting av klubb → `group_id` blir null, spillet overlever.
- **Discovery-personvern:** `invite_only`-spill UTEN `group_id` forblir helt private (uendret #357).
  Med `group_id` er de synlige kun for klubbens medlemmer (aldri globalt).
- **Ingen regresjon:** eksisterende open/manual_approval-discovery, signup-flyt og #49-RLS står urørt
  bortsett fra de additive utvidelsene over.

## Key Decisions
- **Cap = 2 på `created_by`**, håndhevet i `create_club`-RPC — eier-valg.
- **Medlemskap = direkte-join** på alle klubb-spill (også invite_only) — eier-valg; implementeres via
  `canDirectJoin`-regel i signup, ikke ny game_players-RLS-policy (admin-client + kode-authz, jf. #199).
- **`group_join_requests` speiler `game_registration_requests`** — etablert mønster, lav risiko.
- **`create_club`-RPC løser owner-bootstrap** — eneste skaper-vei; speiler #49-flagget.
- **Begge medlems-veier** (e-post + lenke/forespørsel) — eier-valg.

**Claude's Discretion:**
- Eksakte rutenavn under `/klubber/*` (hold «én dør»-disiplin + dedikerte konfirmasjons-ruter for
  destruktivt).
- Om `clubGames` blir egen retur-nøkkel vs. `openGames` m/ `group_name`-felt (velg minst diff i
  `HomeDiscoverySection`).
- `club_join_decided`-varsel til søker (nice-to-have).
- Render-test-plassering (maks én per ny komponent, jf. test-disiplin).
- Om wizard-klubbvalg er eget steg vs. felt i eksisterende steg (velg minst friksjon i `GameWizard`).
- Om mail-backup (Resend) sendes ved `club_join_request` (speil `shouldAlsoSendMail`) eller kun in-app.

## Success Criteria
- [x] **C1 — Schema applyt:** `games.group_id` (nullable FK), `groups.short_id` (not null/unique/format),
  `group_join_requests` (+RLS), `create_club`/`add_club_member_by_email`/`decide_join_request` (security
  definer, anon revoked), og `club_join_request`-kind finnes. *Verifiser:* MCP `execute_sql` mot
  `information_schema`/`pg_proc`/`pg_policies`/`pg_constraint` + `lib/database.types.ts` har feltene.
  → **Bevis (migrasjon 0075 applyt via MCP):** `execute_sql`-sjekk = games.group_id:1, groups.short_id:notnull
  + unique-constraint:1, group_join_requests rls:true + 4 policies, 3 RPCer security definer, anon kan
  execute 0 klubb-RPCer, authenticated kan execute alle 4, club_join_request-kind:yes, alle grupper har
  short_id. `npx tsc --noEmit` = TSC_OK, `npm run build` grønn; types-diff = +78 linjer additivt.
- [x] **C2 — Opprett klubb + owner-bootstrap + cap:** en innlogget bruker oppretter en klubb via
  `/klubber/ny` og blir `owner` (`group_members.role='owner'`); 3. opprettelse blokkeres med vennlig
  melding. *Verifiser:* `create_club` SQL-test (cap raise) + Playwright opprett-flyt + `execute_sql`
  viser owner-rad.
  → **Bevis:** `create_club`-RPC (migrasjon 0075, secdef) håndhever `count(groups where created_by)>=2 →
  raise 'club_cap_reached'` + insert owner-membership atomisk. UI: [`app/klubber/ny/page.tsx`](app/klubber/ny/page.tsx)
  + [`actions.ts`](app/klubber/ny/actions.ts) (cap→«Du kan opprette inntil 2 klubber …»); liste
  [`app/klubber/page.tsx`](app/klubber/page.tsx) cap-gater opprett-døra; «Klubber»-tile i begge
  Klubbhuset-grener ([`app/admin/page.tsx`](app/admin/page.tsx)). v1.79.0, commit 4d45b36.
- [x] **C3 — Klubb-side + medlemsstyring:** `/klubber/[id]` viser medlemmer; eier legger til på e-post
  (eksisterende bruker lagt til, ukjent e-post avvist vennlig), fjerner medlem og forlater via dedikerte
  konfirmasjons-ruter; siste owner kan ikke fjernes. *Verifiser:* Playwright + RPC-retur + `execute_sql`.
  → **Bevis:** [`app/klubber/[id]/page.tsx`](app/klubber/[id]/page.tsx) + [`getClubDetail.ts`](lib/clubs/getClubDetail.ts)
  (medlemsnavn via admin-client pga users-RLS-gap). `addMember`→`add_club_member_by_email` (not_found/already_member
  mappet). Fjern/forlat = dedikerte ruter `…/fjern/[userId]` + `…/forlat`; begge actions teller eiere og
  blokkerer siste-owner-sletting. v1.79.1, commit 98c65b5.
- [x] **C4 — Bli-med-lenke:** `/klubber/bli-med/[shortId]` lar en ikke-medlem be om å bli med (rad i
  `group_join_requests`, eier varslet); eier godkjenner/avslår på klubb-siden og medlemskap opprettes ved
  godkjenning. *Verifiser:* Playwright + `execute_sql` (request- + member-rad) + notify-test.
  → **Bevis:** [`app/klubber/bli-med/[shortId]/`](app/klubber/bli-med/[shortId]/page.tsx) (`requestToJoin`:
  admin-resolve short_id → RLS self-insert pending → best-effort notify alle owner/admin). Ny `club_join_request`
  notification-kind (types/NotificationCard/InboxClient, deeplink `/klubber/[group_id]`). Godkjenning:
  `decideRequest`→`decide_join_request`-RPC (insert membership ved approve). v1.79.2, commit 15a26b0.
- [x] **C5 — Spill knyttes til klubb:** opprett-spill-veiviseren har «Hvem er dette for?» (Ingen / mine
  klubber), `?klubb=[id]` forhåndsvelger, og spillet lagres med `group_id`; en klubb man ikke er medlem av
  kan ikke velges/settes. *Verifiser:* Playwright + `execute_sql` (`games.group_id` satt) + action-authz-ref.
  → **Bevis:** `GameWizard`/`useGameFormState` ClubPicker (steg 2) → skjult `group_id`-felt (speiler
  registration_mode-plumbing). [`createGameInternal`](app/admin/games/new/actions.ts) setter `group_id` med
  medlemskaps-authz (manipulert verdi→null). [`newGameFormData.ts`](lib/games/newGameFormData.ts) returnerer
  `clubs` (+ test). Klubb-side «Sett opp en runde for klubben»→`?klubb=`. v1.79.3, commit 8283025.
- [x] **C6 — Klubb-scoped oppdagbarhet + join:** et klubb-`invite_only`-spill vises i «I dine klubber» på
  `/finn-turneringer` KUN for medlemmer, og et medlem kan melde seg på direkte. Ikke-medlem ser det aldri.
  *Verifiser:* `getDiscoverableGames.test.ts` (clubGames inkluderer invite_only for member, ekskluderer for
  non-member) + Playwright direkte-join.
  → **Bevis:** [`getDiscoverableGames.ts`](lib/games/getDiscoverableGames.ts) `clubGames` (group_id ∈ mine
  klubber, alle modi, dedup vs open). Test: 3 nye cases (medlem-ser-invite_only m/group_name, ikke-medlem→
  ingen group_id-query, dedup ekskluderer fra open). [`HomeDiscoverySection`](app/HomeDiscoverySection.tsx)
  «I dine klubber». Direkte-join: [`signup/page.tsx`](app/signup/[shortId]/page.tsx) + `registerForOpenGame`
  (`canDirectJoin = open OR (group_id && is_group_member)`, server-side). v1.79.4, commit 5935fcc.
- [x] **C7 — Ingen regresjon + gates grønne:** eksisterende discovery/signup/#49-RLS uendret i oppførsel;
  `npm run build` grønn, berørte co-lokerte tester grønne, ny norsk copy kjørt gjennom `humanizer`.
  *Verifiser:* `npm run build` + `npx vitest run` + `git diff`-inspeksjon.
  → **Bevis:** `npm run build` grønn (33/33 sider). `npx vitest run` = **219 filer / 2667 tester passed**.
  Ingen eksisterende RLS-policy endret (kun additiv 0075). Ny copy humanisert per chunk (em-dash/«i ferd med
  å»/«tilgang til å avgjøre» fjernet). `docs/user-flows.md` §0 oppdatert med klubb-flyten.

## Gates
- [ ] `npx tsc --noEmit` passerer (etter hver chunk; fanger group_id/exhaustive-hull).
- [ ] `npx vitest run <co-lokerte testfiler>` passerer; full `npx vitest run` før evaluering hvis delte
  filer (getDiscoverableGames, notifications/types, GameWizard) er rørt.
- [ ] `npm run build` passerer (nye ruter kompilerer; Record/switch-uttømming).
- [ ] MCP `execute_sql`-verifikasjon (C1–C6 schema/RLS/RPC/rad-effekter).
- [ ] Playwright (preview-tools) verifiserer C2–C6 i nettleser.
- [ ] `humanizer` på alle nye/endrede norske strenger før commit.
- [ ] `feat(...)`-commits bumper `package.json` + `CHANGELOG.md` (commit-msg-hook); `chore(db):`/`refactor`
  for ikke-bruker-synlig plumbing (chunk 1). Worktree-hook-fix engang før første commit.

## Files Likely Touched
- `supabase/migrations/0075_clubs_create_and_scope.sql` — **ny** (schema + RPCer + kind-CHECK).
- `lib/database.types.ts` — regenerert (`group_id`, `group_join_requests`, RPCer).
- `app/klubber/page.tsx`, `app/klubber/ny/page.tsx` + action, `app/klubber/[id]/…` (side + fjern/forlat
  konfirmasjons-ruter + actions), `app/klubber/bli-med/[shortId]/…` — **nye**.
- `lib/clubs/*` — **ny** helper-mappe (hent mine klubber, klubb m/ medlemmer + forespørsler).
- `app/admin/page.tsx` — «Klubber»-tile (begge rolle-grener).
- `lib/games/newGameFormData.ts` + `app/admin/games/new/GameWizard.tsx` + `app/admin/games/new/actions.ts`
  + `app/opprett-spill/page.tsx` — klubbvalg + `group_id` på insert.
- `lib/games/getDiscoverableGames.ts` (+ `.test.ts`) — clubGames.
- `app/finn-turneringer/page.tsx` + `app/HomeDiscoverySection.tsx` — «I dine klubber»-seksjon.
- `app/signup/[shortId]/actions.ts` + `page.tsx` — direkte-join for klubb-medlem.
- `lib/notifications/types.ts` (+ `notify`-helper) — `club_join_request`-kind.
- `package.json` + `CHANGELOG.md` — MINOR-serie for #442.

## Foreslått chunk-rekkefølge (subagent-drevet for de substansielle)
1. **Schema + RPCer + types** (chunk 1) — `chore(db):`/`refactor`, apply via MCP, verifiser C1.
2. **Opprett klubb + Klubber-liste + Klubbhuset-inngang** (C2) — `feat` (MINOR åpner serien).
3. **Klubb-side: medlemmer (e-post/fjern/forlat) + del-lenke** (C3).
4. **Bli-med-lenke: request + godkjenning + varsel** (C4).
5. **Veiviser klubbvalg + `group_id` på spill** (C5).
6. **Klubb-scoped discovery + direkte-join** (C6).
7. **Docs/flyt + full verifisering + humanizer** (C7).

## Out of Scope (→ senere saker i epicen)
- **Delegering / utnevne med-admins / overfør eierskap → #50.** Her: bare blokkér å fjerne siste owner.
- **Venne-system / «åpen for venner» / ikke-bruker klubb-invitasjon → #369.**
- Rename av backfill-`'Tørny'`-gruppa, gruppe-velger på baner, klubb-browsing/oppdag-klubber.
- Heving av cap-tallet (#50), klubb-roller utover owner/admin/member, klubb-logo/branding.
- E2E-spec utover Playwright-verifisering i evaluator + unit/render-tester.
