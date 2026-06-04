# Spec: Vanlige brukere oppretter + kjører + avslutter egne spill (RLS-fundament)

**Issue:** [#427](https://github.com/jdlarssen/golf-app/issues/427) — #22 Fase 1 (epic: alle kan opprette spill)
**Milestone:** Tier 6 — Demokratisert opprettelse
**Branch:** `claude/distracted-brahmagupta-1a709f` (denne worktreen)
**Bygger på:** #366 (baner — samme RLS-insert-own-mønster, migrasjon 0070), #198/#223/#230 (trusted-creator + RLS-gap-lærdom)

## Problem

I dag kan kun `is_admin = true` (+ én hardkodet trusted-creator i `lib/admin/trustedCreators.ts`) opprette spill. Trusted-creator-stien omgår RLS via service-role (`getAdminClient()`, #230). En vanlig innlogget bruker har ingen vei inn — de kan bli med i andres spill og score, men ikke arrangere sitt eget. Dette er keystone-fasen i epic #22: en vanlig bruker skal kunne **opprette → publisere → (auto-)starte → score → godkjenne → avslutte** sitt eget spill, helt uten admin. Scoring + peer-godkjenning er allerede spiller-vendt; hullene er (a) create+publish er admin/trusted-gated, (b) avslutt er admin-only, og (c) auto-start virker i praksis bare når admin åpner siden.

## Prior Decisions (videreført)

- **#198/#366:** ikke-admin-opprettelse bor i `AppShell`, aldri i Sekretariatet. Game-creation har allerede `/opprett-spill` (AppShell). **Gjelder:** vi åpner den eksisterende `/opprett-spill`-ruten for alle, lager ingen ny rute for create.
- **#366 (RLS insert-own > service-role-bypass):** når CREATE/skriv åpnes for *alle*, er en ekte `with check (... = auth.uid())`-policy riktigere enn å rute writes via service-role. Vi følger samme mønster for `games`/`game_players`/`game_side_winners`.
- **#230 (RLS-gap-lærdom):** RLS-policyer MÅ verifiseres mot ekte `auth.uid()`-kontekst (SQL med satt JWT-claim i rollback-transaksjon), ikke bare mockede action-tester.
- **#366 pending-read-funn:** under request-scoped RLS kan ikke en oppretter lese *andre* brukeres `users.profile_completed_at`. Issuet tilbyr targeted `getAdminClient`-read eller SECURITY DEFINER-RPC. **Valgt her:** RPC (holder create-actionen helt fri for service-role).

## Design

### 1. RLS-migrasjon `0071_games_creator_rls.sql` (additiv/tillatende)

0070 er tatt (#366). Alle nye policyer er **permissive** → OR-es med de eksisterende admin/self/is_in_game-policyene, så admin- og spiller-flytene er uberørt. Trygg å `apply_migration` før kode-deploy.

- **`games`** — fire creator-policyer (`to authenticated`):
  - SELECT: `using (created_by = auth.uid())` (NY separat policy → en ikke-spillende oppretter ser eget spill; OR-es med eksisterende `games select if participant or admin`).
  - INSERT: `with check (created_by = auth.uid())`.
  - UPDATE: `using (created_by = auth.uid()) with check (created_by = auth.uid())` (status-flip ved avslutt).
  - DELETE: `using (created_by = auth.uid())` (for symmetri/Fase 2; ufarlig nå).
- **`game_players`** — creator-policyer mot parent-`games.created_by` (subquery, som #366 holes/tees):
  - INSERT/UPDATE/DELETE: `exists (select 1 from public.games g where g.id = game_players.game_id and g.created_by = auth.uid())`.
  - Behold `game_players self submit`, `self register open`, `self withdraw pre active`, `admin write`, `is_in_game`-SELECT.
- **`game_side_winners`** — creator ALL mot parent-`games.created_by` (samme subquery). Behold `game_side_winners_select` + `_admin_all`.
- **SECURITY DEFINER RPC** `public.incomplete_profiles_for_ids(p_user_ids uuid[])` → `returns table(id uuid, email text)`, `to authenticated`, returnerer kun ids med `profile_completed_at is null`. Erstatter dagens service-role roster-read i publish-gaten (og i `startScheduledGame`s pending-defense). Minimal lekkasje (kun ids kalleren allerede oppgir; UUID-er er ikke enumererbare).

Verifiseres mot ekte `auth.uid()` (rollback) — se K2.

### 2. Helper `requireAdminOrCreator(supabase, gameId)` — `lib/admin/auth.ts`

`loadRole()` → hvis `isAdmin` returner ctx. Ellers les `games.created_by` for `gameId` (request-scoped; ny SELECT-policy tillater oppretter-lesning); hvis `=== userId` returner ctx. Ellers `redirect('/')`. Returnerer `AdminRoleContext` (kaller-koden bruker `ctx.isAdmin` til redirect-forgrening). Speiler `requireAdminOrTrustedCreator`-signaturen.

### 3. Åpne opprett + publiser for alle innloggede

- **`app/opprett-spill/page.tsx`:** `requireAdminOrTrustedCreator(supabase)` → `getUser()`-gate (uinnlogget → `/login`). Ingen admin/trusted-krav.
- **`createGameInternal` (`app/admin/games/new/actions.ts`):** gate `requireAdminOrTrustedCreator` → `getUser()` + lett `users.is_admin`-lesning (trengs til redirect-forgrening). `created_by = user.id`. **Dropp `writeClient = isAdmin ? supabase : getAdminClient()`** → bruk request-scoped `supabase` for alle writes (RLS dekker både admin og oppretter). Pending-gate i publish-grenen: bytt service-role roster-read → `supabase.rpc('incomplete_profiles_for_ids', { p_user_ids })`; `> 0` → `error=pending_players` (ekte sperre, ikke stille no-op). Redirect-forgrening uendret (admin → `/admin/games/[id]`, oppretter → `/games/[id]`).
- **`app/page.tsx`:** `canCreateGame = !!userId` (alle innloggede), ikke `is_admin || isTrustedCreator`. CTA-href uendret (admin → `/admin/games/new`, ellers → `/opprett-spill`). Rydd evt. ubrukt `isTrustedCreator`-import.

### 4. Robust auto-start (system-nivå skriv)

`startScheduledGame(supabase, gameId)` flipper status + fryser `course_handicap` via den *passerte* klienten. I dag passerer auto-start-fallbacken i `app/games/[id]/page.tsx` den request-scoped klienten → for en ikke-admin trigger blir både `game_players`-bulk-update og `games`-status-flip **stille 0-rad-no-ops** (RLS USING filtrerer; ingen feil → returnerer `{ok:true}`, men intet flippes). Det rammer creator-spill *og* er en latent svikt for admin-spill (auto-start virker egentlig bare når admin åpner).

**Fix:** auto-start-fallbacken i `page.tsx` passerer `getAdminClient()` i stedet for `supabase`. Transisjonen er system-nivå (idempotent + optimistic-locked, autorisasjon allerede avgjort av at brukeren kunne laste siden). Robust uansett hvem som trigger, uansett eier. Signaturen til `startScheduledGame` er uendret (unit-tester rører ikke). Admin «Start runden nå»-knappen (D5) er uendret (admin-gated, request-scoped funker). `startScheduledGame`s interne pending-defense (`users`-read) byttes til RPC-en fra §1 så den ikke no-op-er under en evt. ikke-admin klient i framtida — men siden klienten nå er admin er det belte-og-bukseseler.

### 5. Ny ikke-admin avslutt-flate `/games/[id]/avslutt` (AppShell)

Speiler admin-avslutt men i `AppShell`, gated `requireAdminOrCreator(supabase, gameId)`. Én samlet side som dekker alle tilstander (admin-flyten er historisk splittet i `/avslutt` + `/avslutt-likevel`):
- Guards: spill finnes (`notFound`), `status === 'active'` (ellers redirect `/games/[id]?error=not_active`).
- **Manglende leverte:** vis hvem som ikke har levert (gjenbruk `formatRevealName`); `allowMissing`-bekreftelse (scorene teller, status forblir «ikke levert»). For modi med `supportsWithdrawal`: valgfri «marker som trukket».
- **Sideturnering på:** gjenbruk `SideWinnersForm` (`app/admin/games/[id]/avslutt/SideWinnersForm.tsx`, importeres direkte — ikke dupliser) for LD/CTP-vinnervalg.
- Submittet kaller de samme actionene som admin (se §6); suksess → `/games/[id]`.

### 6. Åpne avslutt-actionene for oppretter

`endGameWithSideWinners` (`app/admin/games/[id]/avslutt/actions.ts`), `endGame` (`app/admin/games/[id]/actions.ts`), `endGameMarkingWithdrawals` (`.../avslutt-likevel/actions.ts`): bytt `requireAdmin`/`loadAdminContext` → `requireAdminOrCreator(supabase, gameId)`. `actorName` fra `ctx.name`. Writes (`games.status`, `game_side_winners`, `game_players`-withdrawal) går på request-scoped `supabase` — dekket av creator-RLS fra §1. **Redirect-base forgrenes på `ctx.isAdmin`:** admin → `/admin/games/[id]` (+`/avslutt`), oppretter → `/games/[id]` (+`/avslutt`). Når `ctx.isAdmin` er byte-identisk dagens oppførsel. `logAdminEvent` + Resend-varsler kjører for begge (best-effort).

### 7. «Avslutt spill»-knapp på `/games/[id]`

Synlig når `(isAdmin || game.created_by === userId)` og `status === 'active'` → lenke til `/games/[id]/avslutt`. Plassering/stil = Claude's discretion (i aktiv-tilstand game-home; ikke konkurrer med score-CTA). I dag har `/games/[id]` ingen avslutt-affordance for noen — dette er net-new.

## Edge Cases & Guardrails

- **Ikke-spillende oppretter (edge, per issue):** `created_by`-SELECT lar dem nås, og `/games/[id]/avslutt` gater på creator (ikke på å være spiller) → de kan avslutte via URL. Selve game-home (`/games/[id]`) bygger på `me = players.find(...)` → en ikke-spillende oppretter kan fortsatt få `notFound` på hovedsiden. **Akseptert** (issue: «håndter via created_by-SELECT, ikke egen flate»; «Mine spill»-hub er Fase 3). Vanlig-case = oppretter ER spiller.
- **Pending-sperra må bite:** RPC-en returnerer ekte data uavhengig av RLS → publish med ufullstendig-profil-spiller blokkeres (ikke stille no-op). Dekk med RLS-verifisert test + action-test.
- **Direkte action-POST:** `createGameInternal` + avslutt-actionene self-gater (ikke bare page/layout). Uinnlogget/ikke-eier POST → redirect.
- **Spoof/annet-spill:** RLS må blokkere INSERT med fremmed `created_by` og skriv mot spill man ikke eier (42501). Verifiseres K2.
- **Admin-flyten uendret:** `/admin/games/*` + admin-redirects byte-identiske (verifiser via eksisterende admin-tester). Avslutt-actionene må gi nøyaktig samme oppførsel når `ctx.isAdmin`.
- **Scoring-paritet / handicap-frys:** auto-start-klient-bytte endrer IKKE beregningen (`lib/scoring/courseHandicap` urørt), kun hvem som utfører skrivet. Ingen ny scoring-test nødvendig (CLAUDE.md-regel gjelder `lib/scoring/`-endringer, ikke kalleren).
- **Cup forblir admin-only:** denne fasen er enkelt-spill. Cup-opprettelse er ute av scope.
- **Søppel/rate-limit:** ingen moderering/rate-limit (samme aksepterte risiko som #366; escape-hatch).

## Key Decisions

- **Ekte creator-RLS (ikke service-role-bypass)** for `games`/`game_players`/`game_side_winners` — speiler #366, oppfyller #230-lærdommen.
- **Auto-start = system-nivå skriv via `getAdminClient()`** (eier-beslutning: «start uansett hvem som åpner»). Fikser samtidig den latente admin-spill-svikten. Surgisk: kun fallback-kallet i `page.tsx`, signatur uendret.
- **Full paritet i avslutt** (eier-beslutning: «full pakke som admin») — sideturnering + LD/CTP-vinnere + avslutt-likevel, samlet på én AppShell-side, via gjenbruk av `SideWinnersForm` + de delte actionene (gate åpnet, redirect forgrenet).
- **Pending-gate via SECURITY DEFINER-RPC** (ikke targeted `getAdminClient`) — holder den nå-offentlige create-actionen fri for service-role; minimal lekkasje.
- **`isTrustedCreator` blir redundant for game-CTA** men fjernes ikke som konsept (single-entry funker fortsatt som «alle innloggede»). Ingen migrering av selve allowlisten i denne fasen.

**Claude's Discretion:**
- Eksakt plassering/stil/tekst på «Avslutt spill»-knappen på `/games/[id]`.
- Layout på den samlede creator-avslutt-siden (side-on vs side-off-grener).
- Om RPC-en returnerer `(id,email)`-rader eller bare en count (begge dekker behovet; rader gir paritet med `findPendingPlayers`).
- Om `requireAdminOrCreator` legger til et `isOwner`-felt eller kun gjenbruker `isAdmin`.

## Success Criteria

- [x] **K1:** Migrasjon `0071_games_creator_rls.sql` finnes + applisert. Creator INSERT/UPDATE/DELETE + own-SELECT på `games`; creator INSERT/UPDATE/DELETE på `game_players` + creator ALL på `game_side_winners` (alle mot `created_by = auth.uid()` / parent-subquery). Eksisterende admin/self/is_in_game-policyer urørt. RPC `incomplete_profiles_for_ids` finnes (SECURITY DEFINER).
  - *Evidens:* `apply_migration` → `{success:true}`. `pg_policies` returnerte alle 8 nye creator-policyer + de 10 eksisterende urørt (games: +select own created/creator insert/update/delete; game_players: +creator insert/update/delete; game_side_winners: +creator all). `pg_proc`: `incomplete_profiles_for_ids(p_user_ids uuid[])`, `prosecdef=true`. Advisor-funn rettet: RPC var `anon`-eksekverbar (Supabase default privileges) → `revoke execute … from anon` → grants nå kun `authenticated`+admin-roller. RPC unngår `function_search_path_mutable` (satt `search_path=''`).
- [x] **K2 (RLS mot ekte auth, ikke mock):** I én rollback-transaksjon (DO-blokk, `raise exception` til slutt → ruller tilbake; 0 leftover-rader verifisert) med `set_config('role','authenticated')` + `request.jwt.claims.sub` = ekte ikke-admin `0ab3e34c-…` (complete profile):
  - T1 INSERT `games` egen `created_by` → **PASS** (tillatt). T2 fremmed `created_by` → **PASS** (42501 blokkert).
  - T3 UPDATE `games.status` eget spill → **PASS** (1 rad). T4 annet spill → **PASS** (0 rader, blokkert).
  - T5 INSERT `game_players` (annen bruker) i eget spill → **PASS**. T6 i annet spill → **PASS** (42501).
  - T7 INSERT `game_side_winners` eget spill → **PASS**. T8 annet spill → **PASS** (42501).
  - T9 RPC `incomplete_profiles_for_ids([incomplete, complete])` → count=1 → **PASS**. Adresserer #230-lærdommen.
- [x] **K3:** Vanlig (ikke-admin, ikke-trusted) bruker oppretter+publiserer via `/opprett-spill`; `games.created_by` = brukeren; writes på request-scoped klient (ingen `getAdminClient` i `createGameInternal`). Pending-spiller blokkerer publish (RPC-gate, ikke no-op).
  - *Evidens:* commit `32c5fa8`. `createGameInternal` gater på `getUser()` + `users.is_admin`-lesning, skriver alle inserts på `supabase` (request-scoped), pending via `supabase.rpc('incomplete_profiles_for_ids', …)`. `grep getAdminClient app/admin/games/new/actions.ts` → ingen treff. `actions.test.ts`: **17/17** grønne — inkl. «regular non-admin creates draft on request-scoped client, lands on game-home» (asserterer `created_by='reg-1'` + games.insert på request-scoped mock), «validation errors bounce to /opprett-spill», «pending player bounces to /opprett-spill?error=pending_players», admin-stien uendret.
- [x] **K4:** Auto-start flipper creator-spill til `active` uansett hvilken spiller som åpner `/games/[id]` etter tee-off (fallback bruker `getAdminClient`).
  - *Evidens:* commit `32c5fa8`. [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) auto-start-fallbacken kaller `startScheduledGame(getAdminClient(), id)`. Service-role omgår RLS, så `game_players`-bulk-update + `games`-status-flip lykkes uansett trigger (vs. den tidligere stille 0-rad-no-op-en på request-scoped klient). Admin «Start runden nå» (D5) uendret. Build grønt.
- [x] **K5:** Oppretter avslutter eget spill via `/games/[id]/avslutt` (side-on: LD/CTP-vinnere; side-off: avslutt + avslutt-likevel + venter-på-godkjenning); submit/peer-approval-gates bevart; suksess → `/games/[id]`. Admin-avslutt byte-identisk. «Avslutt»-knapp vises for oppretter på `/games/[id]` ved `active`.
  - *Evidens:* commit `32c5fa8`. Ny [`app/games/[id]/avslutt/page.tsx`](app/games/[id]/avslutt/page.tsx) (route i build-tabellen: `ƒ /games/[id]/avslutt`), gjenbruker `SideWinnersForm` (ny `cancelHref`-prop) + actionene. `endGame`/`endGameWithSideWinners`/`endGameMarkingWithdrawals` gater på `requireAdminOrCreator(gameId)`, forgrener `detailPath` på `isAdmin`. Peer-approval bevart (action enforcer + pre-sjekk på siden viser «venter på godkjenning» i stedet for stille bounce). «Avslutt spillet»-knapp gated `isActive && gwp.game.created_by === userId`.
- [x] **K6:** Hele suiten grønn + lint + build.
  - *Evidens:* `npx vitest run` → **2640 passed (217 filer)**. `npm run lint` → 0 errors (23 pre-eksisterende warnings i urørte filer). `npm run build` → clean (typecheck + full rute-tabell, ny `/games/[id]/avslutt` registrert). `tsc --noEmit` rent (la til `created_by` i `scorecardLayout.test.ts`-fikstur).
- [x] **K7:** Version `1.74.0` → `1.75.0`; CHANGELOG-oppføring; `1.74.y`-serie wrappet i `<details>`.
  - *Evidens:* commit `32c5fa8`. `package.json` = `1.75.0`. Ny `## 1.75.y — Lag og styr ditt eget spill`-seksjon åpen; `1.74.y` wrappet i `<details>`. Commit-msg-hook passerte (feat krever package.json+CHANGELOG).

## Gates (etter hver chunk; scoped underveis, full suite før evaluator)

```bash
npm run lint
npm test            # scoped underveis: app/admin/games app/opprett-spill app/games lib/admin lib/games
npm run build
```

- RLS (K2) via Supabase MCP `execute_sql` i rollback-transaksjoner (ekte JWT-claim).
- Frontend (K5) via Playwright/preview-tools (frontend-filer rørt → obligatorisk for evaluator). Innlogget skjema-rendering kan ikke verifiseres lokalt (OTP) → bygg-verifisert + gjenbruk av beviste komponenter; visuell prod-verifisering av eier ved deploy.

## Files Likely Touched

- `supabase/migrations/0071_games_creator_rls.sql` — NY: creator-RLS + `incomplete_profiles_for_ids`-RPC
- `lib/admin/auth.ts` — NY `requireAdminOrCreator(supabase, gameId)`
- `app/opprett-spill/page.tsx` — gate → `getUser()` (alle innloggede)
- `app/admin/games/new/actions.ts` — gate → getUser, request-scoped klient (dropp getAdminClient), RPC-pending-gate
- `app/admin/games/new/actions.test.ts` — oppdater trusted/admin-paths; legg til regular-user + unauth + pending-block
- `app/page.tsx` — `canCreateGame` → alle innloggede
- `app/games/[id]/page.tsx` — auto-start fallback passerer `getAdminClient()`; ny «Avslutt»-knapp (creator/admin, active)
- `lib/games/startScheduledGame.ts` — pending-defense via RPC (belte-og-bukseseler)
- `app/games/[id]/avslutt/page.tsx` — NY: AppShell creator-avslutt-flate (gjenbruker `SideWinnersForm`)
- `app/admin/games/[id]/avslutt/actions.ts` + `app/admin/games/[id]/actions.ts` + `.../avslutt-likevel/actions.ts` — gate → `requireAdminOrCreator`, redirect forgrenet på isAdmin
- `package.json` + `CHANGELOG.md` — 1.75.0 + oppføring

## Out of Scope (senere faser)

- Rediger/slett eget spill via UI (Fase 2). Roster-styring / invitere nye brukere fra create-flyten / godkjennings-overstyring / «Mine spill»-hub (Fase 3).
- Cup-opprettelse (forblir admin-only).
- Full game-home-visning for ikke-spillende oppretter (edge; nås via created_by-SELECT + avslutt-URL).
- Fjerning/migrering av `isTrustedCreator`-allowlisten som konsept.
- Moderering, rate-limiting, duplikat-deteksjon på bruker-opprettede spill.
- Ny E2E-spec utover evaluator-verifisering.
