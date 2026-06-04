# Spec: Oppretter styrer roster + godkjenning + Klubbhus-hub

**Issue:** [#429](https://github.com/jdlarssen/golf-app/issues/429) — #22 Fase 3 (epic: alle kan opprette spill) — **avslutter epic-et**
**Milestone:** Tier 6 — Demokratisert opprettelse
**Branch:** `claude/eloquent-golick-1371d8` (denne worktreen)
**Bygger på:** #427 Fase 1 (creator-RLS 0071, `requireAdminOrCreator`, `getGameWithPlayers`-mønsteret), #428 Fase 2 (rediger/slett-flatene, CreatorControls). Gjenbruker #362 (`getTeamCandidates`), #422 (`isDisposableEmailDomain`), #386 (withdraw), #360 (admin-godkjennings-overstyring).

## Problem

Etter Fase 1+2 kan en vanlig oppretter opprette, kjøre, redigere, slette og avslutte eget spill — men mangler tre ting admin har:

1. **Roster-styring under spillets liv:** invitere *helt nye* folk på e-post (rediger-flaten dekker bare bytte av eksisterende medspillere, og kun draft/scheduled), og trekke en spiller midt i aktivt spill.
2. **Godkjennings-overstyring:** hvis en medspiller forsvinner og ikke får godkjent scorekortet sitt fra flighten, har oppretteren ingen vei til å godkjenne på vegne av flighten (admin har dette via #360 — oppretteren ikke).
3. **Samlet «mine arrangementer»-flate:** ingen liste over spill brukeren *arrangerer* (forsiden lister kun spill man *deltar* i). Vil man styre et eldre spill, må man huske URL-en.

Fase 3 lukker alle tre og avslutter epic #22.

## Eier-beslutninger (fra kontrakt-diskusjon 2026-06-04)

1. **Hub = frøet til Klubbhuset (#392).** «Mine arrangementer»-flaten bygges som en Klubbhus-flate (`/klubbhuset`) — formet som admins `/admin/games`, men filtrert til `created_by = meg`. Selve bunn-nav-fanen (universell Klubbhus-tab) er fortsatt #392 sin jobb («må ned på nav-bar når den blir laget»); denne fasen seeder ruten + innholdet og gjør den oppdagbar via Hjem + Profil i mellomtiden.
2. **Roster-scope = registrering + aktiv-trekk.** Draft/scheduled: inviter nye på e-post (disposable-guard #422) + legg til/fjern spillere. Aktiv: oppretteren kan også **trekke** en spiller (utvider #386 fra admin/selv → oppretter).
3. **#429 lukker epic #22.** Fase 1–3 + #366 (baner) dekker hele «alle kan opprette»-løftet. Cup-opprettelse for vanlige brukere er bevisst utenfor (egen klubb-skala-vurdering, ny issue om ønskelig).

## Research Findings (verifisert mot kode + `pg_policies`)

- **Game-scopede invitasjoner er admin-only.** `invitations` har (0002) `admin write` (FOR ALL, `is_admin()`) + (0008) `player friend-invite insert` med `with check (invited_by = auth.uid() and game_id is null)`. En ikke-admin kan altså KUN inserte friend-invites uten `game_id`. `inviteEmailToGame` inserter en rad med `game_id = gameId` → **blokkeres av RLS for oppretter**. ⇒ Fase 3 TRENGER en migrasjon (i motsetning til Fase 2). Tilsvarende kan oppretter ikke SELECT-e game-scopede invitasjoner (`select own outgoing` krever `game_id is null`) → idempotens-sjekken + pending-listen ville sett tomt.
- **`game_players` writes for creator dekket av 0071:** `creator insert/update/delete` (parent-`created_by`-subquery). ⇒ add/remove (insert/delete), withdraw (update `withdrawn_at`) og approval (update `approved_at`/`approved_by_user_id`) er alle dekket. Ingen ny `game_players`-policy nødvendig.
- **Roster-lesing:** `getGameWithPlayers(id)` ([lib/games/getGameWithPlayers.ts](lib/games/getGameWithPlayers.ts)) er `unstable_cache`-wrappet og leser via admin-client (RLS-bypass), eksponerer `created_by, flight_number, submitted_at, approved_at, rejection_reason, withdrawn_at` + spiller-navn. ⇒ management-flaten leser roster herfra (authz på call-site via `requireAdminOrCreator`), og den ikke-spillende-oppretter-edge-en fra Fase 1/2 forsvinner for denne flaten.
- **Delte admin-actions å åpne (samme mønster som Fase 1):**
  - `addExistingPlayerToGame(gameId, formData)` + `inviteEmailToGame(gameId, formData)` ([app/admin/games/[id]/inviteToGameActions.ts](app/admin/games/[id]/inviteToGameActions.ts)) — gate `requireAdminOrTrustedCreator`, hardkodet `detailPath = /admin/games/[id]`. Idempotent picker-add (swallow 23505) + e-post-gren (eksisterende bruker → game_players; ukjent → invitations + Resend). Best-ball maks-8-guard. `active|finished` → `game_locked`.
  - `adminWithdrawPlayer(gameId, userId)` + `adminUndoWithdraw(gameId, userId)` ([app/admin/games/[id]/actions.ts:454](app/admin/games/[id]/actions.ts)) — gate `loadAdminContext`, kun `supportsWithdrawal`-modi, setter/nuller `withdrawn_at` + `withdrawn_by_user_id`, `logAdminEvent`, redirect `/admin/games/[id]`.
  - `adminApproveScorecard(gameId, playerUserId)` ([app/admin/games/[id]/actions.ts:171](app/admin/games/[id]/actions.ts)) — gate `loadAdminContext`, krever `active`, idempotent (kun `submitted_at not null and approved_at is null`), setter `approved_at`/`approved_by_user_id`, nuller `rejection_reason`, `logAdminEvent`, `scorecard_approved`-notify, redirect `/admin/games/[id]?status=admin_approved`.
- **Gjenbrukbare komponenter:** `getTeamCandidates(userId)` (co-player-nettverk, privacy-scoped — #362), `isDisposableEmailDomain(email)` (#422), `ApprovePlayerButton` (kaller `adminApproveScorecard.bind`), `sendInviteNotification` (game-aware), `notifyInvitedToGame`, `StatusChip`, `AppShell`/`TopBar`, `CreatorControls` (Fase 2).
- **Nav-state:** `BottomNav` ([components/ui/BottomNav.tsx](components/ui/BottomNav.tsx)) har 3 låste faner (Hjem/Innboks/Profil); 4. fane er reservert #392. Hub blir derfor en rute man når via inngang, ikke en fane (ennå).

## Design

### 1. Migrasjon `0072_invitations_creator_game_invite.sql` (additiv/tillatende)

Tre nye **permissive** policyer (`to authenticated`) → OR-es med eksisterende admin/friend-policyer, så admin- og friend-invite-flytene er uberørte:

- **INSERT:** `with check (invited_by = auth.uid() and game_id is not null and exists (select 1 from public.games g where g.id = invitations.game_id and g.created_by = auth.uid()))` — oppretter kan inserte game-scoped invitasjon kun for eget spill, attribuert til seg selv.
- **SELECT:** `using (invited_by = auth.uid() and game_id is not null and exists (… g.created_by = auth.uid()))` — leser egne game-invitasjoner for eget spill (idempotens-sjekk + pending-liste).
- **DELETE:** samme `using`-predikat — oppretter kan trekke en pending game-invitasjon (paritet med admin `withdrawInvitation`).

Eksisterende `invitations admin write` / `player friend-invite insert` / `select own incoming/outgoing` / `self mark accepted` urørt. Verifiseres mot ekte `auth.uid()` (rollback) — se K1.

### 2. Åpne roster-actionene for oppretter (`inviteToGameActions.ts`)

`addExistingPlayerToGame` + `inviteEmailToGame`:
- Gate `requireAdminOrTrustedCreator` → **`requireAdminOrCreator(supabase, gameId)`**.
- **Forgren `detailPath` på `ctx.isAdmin`:** admin → `/admin/games/${gameId}`, oppretter → `/games/${gameId}/spillere`. Erstatt den hardkodede `detailPath`-konstanten.
- **Disposable-guard for ikke-admin (`inviteEmailToGame`):** etter e-post-validering, hvis `!ctx.isAdmin && isDisposableEmailDomain(rawEmail)` → `redirect(${detailPath}?error=disposable_email)`. Admin/trusted uberørt (bevisst u-guardet per #422). (Issue: «Disposable-guard gjelder e-post-invitasjoner».)
- Writes uendret (request-scoped `supabase`): `game_players` insert dekket av 0071-creator-insert; `invitations` insert dekket av ny 0072-policy. `invitedByName`-fallback: bruk `ctx.name?.trim() || 'En arrangør'` (ikke «Admin» når oppretter inviterer). `notifyInvitedToGame` bruker `ctx.userId` som inviter.
- Best-ball-guard + `game_locked` (active/finished) uendret — gjelder begge roller.

### 3. Åpne withdraw-actionene for oppretter (`app/admin/games/[id]/actions.ts`)

`adminWithdrawPlayer` + `adminUndoWithdraw`:
- Gate `loadAdminContext` → **`requireAdminOrCreator(supabase, gameId)`**; `actorName`/`withdrawn_by_user_id` fra `ctx`.
- **Forgren `detailPath` på `ctx.isAdmin`** (admin → `/admin/games/[id]`, oppretter → `/games/[id]/spillere`).
- `supportsWithdrawal`-guard, optimistic write (update `withdrawn_at`) via request-scoped klient (0071-creator-update), `logAdminEvent` + redirect uendret-i-form. Admin byte-identisk når `ctx.isAdmin`.

### 4. Generaliser godkjennings-overstyring for oppretter (`app/admin/games/[id]/actions.ts`)

`adminApproveScorecard`:
- Gate `loadAdminContext` → **`requireAdminOrCreator(supabase, gameId)`**; `approver_name` + `approved_by_user_id` fra `ctx`.
- **Forgren redirect på `ctx.isAdmin`:** admin → `/admin/games/[id]?status=admin_approved`, oppretter → `/games/[id]/spillere?status=approved`.
- `active`-guard, idempotent update, `scorecard_approved`-notify, `logAdminEvent`, `revalidateTag` uendret. Write (update `approved_at`/`approved_by_user_id`) dekket av 0071-creator-update. Admin byte-identisk. (Behold funksjonsnavnet — intern action, kalles av `ApprovePlayerButton`; speiler Fase 1s «åpne den delte actionen, ikke dupliser».)

### 5. Ny management-flate `/games/[id]/spillere` (AppShell) — oppretterens spiller-cockpit

- Gate `requireAdminOrCreator(supabase, id)`. Uinnlogget → `/login` (i `loadRole`); ikke-eier ikke-admin → `/`. For `ctx.isAdmin` på denne ruten: la passere (edge — admin bruker normalt Sekretariatet).
- Roster leses via `getGameWithPlayers(id)` (admin-client; authz allerede avgjort). `TopBar backHref={/games/[id]}` kicker «Spillere».
- **draft/scheduled-seksjon:**
  - Roster-liste: hver spiller med «Fjern»-knapp (form → `removePlayerFromGame` eller gjenbruk eksisterende — se under). Oppretteren selv vises uten fjern-knapp (kan ikke fjerne seg via denne; bruk selv-withdraw/slett).
  - «Legg til spiller» (picker): `getTeamCandidates(ctx.userId)` minus nåværende roster → form → `addExistingPlayerToGame`.
  - «Inviter på e-post»: form → `inviteEmailToGame`. Helper-tekst om at de får en invitasjon.
  - Pending game-invitasjoner (fra `invitations`, ny 0072-SELECT): liste med e-post + evt. «Trekk invitasjon» (DELETE-action). *Discretion:* kan droppes hvis det blåser opp scope — kjernen er invite + roster.
- **active-seksjon:**
  - Roster med «Trekk» (withdraw) per ikke-trukket spiller (kun `supportsWithdrawal`-modi) → `adminWithdrawPlayer`; trukne vises med «Angre» → `adminUndoWithdraw`.
  - **«Leverte scorekort»** (kun når `require_peer_approval`): alle spillere med `submitted_at != null && approved_at == null` på tvers av flighter, hver med `<ApprovePlayerButton>` («Godkjenn på vegne av flighten» → `adminApproveScorecard`). Speiler #360s admin-affordance.
- **finished:** read-only oppsummering eller tom (ingen handlinger). Status-banner ved `?status=`/`?error=`-params (gjenbruk Banner-mønsteret).
- **Remove-action:** trenger en liten `removePlayerFromGame(gameId, formData)` (delete `game_players`-rad, draft/scheduled-guard, gate `requireAdminOrCreator`, redirect `/games/[id]/spillere`). Plasseres i en ny `app/games/[id]/spillere/actions.ts` *eller* gjenbruk om en admin-remove finnes (research fant ingen ren admin-remove — admin bruker withdraw/rediger). *Discretion:* egen liten creator-action er greit (RLS 0071-delete dekker).

### 6. Inngang på `/games/[id]` — «Styr spillere»

Utvid `CreatorControls` (Fase 2, [app/games/[id]/page.tsx](app/games/[id]/page.tsx)) med en «Styr spillere»-lenke → `/games/[id]/spillere`, synlig for oppretter ved `scheduled` || `active` (draft har allerede roster i rediger; men greit å vise fra scheduled). Vises i begge grener (scheduled-venterom + hovedreturn) der `CreatorControls` allerede droppes inn. Plassering/stil = discretion (arrangør-gruppe; ikke konkurrer med score-CTA).

### 7. Klubbhus-hub `/klubbhuset` (AppShell)

- Gate: `getUser()` (alle innloggede; uinnlogget → `/login`).
- Query: `supabase.from('games').select('id, name, status, game_mode, created_at, scheduled_tee_off_at').eq('created_by', userId).order('created_at', desc).limit(...)` — request-scoped (RLS `games select own created`, 0071). Lister spill brukeren *arrangerer*.
- Render: admin/games-style liste med `StatusChip` (utkast/påmelding/aktiv/signert), banenavn/dato, hver rad → `/games/[id]` (oppretterens cockpit med Rediger/Slett/Avslutt/Styr-spillere). Tom-tilstand: «Du arrangerer ingen spill ennå» + lenke til `/opprett-spill`.
- **Oppdagbarhet (uten bunn-nav-fane):** inngang fra (a) Hjem — en «Klubbhuset»/«Spill jeg arrangerer»-lenke (kun når brukeren har ≥1 opprettet spill, ELLER alltid for innloggede — discretion), og (b) Profil-hub. Bunn-nav-fanen er #392.
- *Naming-discretion:* rute = `/klubbhuset`; overskrift/inngangstekst foreslås «Klubbhuset» med underseksjon «Spill jeg arrangerer» (rom for at #392 legger til flere flater senere). Eier justerer ved deploy.

### 8. Lukk epic #22 + koordinering

- Closing-kommentar på #429 (Teknisk + Funksjonell) ved merge.
- Lukk #22 (`Closes #22` i PR-body i tillegg til `Closes #429`, ELLER egen `gh issue close 22` med kommentar som oppsummerer Fase 1–3 + #366). Cup-opprettelse noteres som bevisst utenfor.
- Kommentar på #392: `/klubbhuset`-ruten + «Spill jeg arrangerer»-flaten er seedet; #392 gjenstår = universell bunn-nav-fane + rolle-gatede flater inni + flytte `/opprett-bane`/`/opprett-spill`-dørene inn.

## Edge Cases & Guardrails

- **Game-scoped invite-RLS må verifiseres mot ekte auth** (#230-lærdom): oppretter kan inserte/select-e/delete-e game-invite for EGET spill, blokkeres (42501 / 0 rader) for andres. Mock-action-test er ikke nok — K1 kjører rollback-SQL med satt JWT-claim.
- **Disposable-guard biter for oppretter, ikke admin:** `inviteEmailToGame` med wegwerf-domene fra ikke-admin → `disposable_email`-bounce; samme e-post fra admin → slipper gjennom (uendret #422-beslutning). Dekkes av action-test (begge grener).
- **Direkte action-POST:** alle åpnede actions self-gater på `requireAdminOrCreator` (ikke bare siden). Uinnlogget/ikke-eier POST → redirect. `game_locked`/`supportsWithdrawal`/`active`-guards uendret.
- **Spoof annet spill:** RLS (0071 + 0072) blokkerer skriv mot spill man ikke eier. K1 dekker invitations; game_players er #427-K2-verifisert.
- **Withdraw kun supportsWithdrawal:** ikke-støttede modi → stille redirect (uendret admin-oppførsel). Optimistic write idempotent.
- **Approval-override krever `require_peer_approval`:** seksjonen rendres kun da; ellers finnes ikke godkjenningssteget. Idempotent (allerede godkjent → no-op).
- **Ikke-spillende oppretter:** management-flaten leser roster via `getGameWithPlayers` (admin-client) → roster vises selv om oppretteren ikke er spiller. Writes via creator-RLS. Edge-en fra Fase 1/2 er løst for DENNE flaten. (Hub leser uansett via `created_by`-SELECT.)
- **Admin-flyten byte-identisk:** `/admin/games/[id]` invite/withdraw/approve-knapper + redirects uendret når `ctx.isAdmin`. Verifiseres mot eksisterende admin-tester (`actions.test.ts`, `inviteToGameActions.test.ts` hvis finnes).
- **Cup forblir admin-only:** denne fasen er enkelt-spill. Cup-roster/godkjenning urørt.
- **Best-ball maks 8:** guard uendret, gjelder begge roller (creator får `game_full`-bounce mot `/games/[id]/spillere`).

## Key Decisions

- **Ny migrasjon 0072 for game-scoped creator-invitasjoner** — game-invites var hardt admin-only i RLS (0008); kan ikke åpnes uten policy. Speiler 0071-mønsteret (permissive, parent-`created_by`-subquery, RLS-verifisert).
- **Åpne de delte admin-actionene (invite/withdraw/approve), ikke dupliser** — samme mønster som Fase 1 (`endGame` m.fl.): gate → `requireAdminOrCreator`, forgren redirect på `isAdmin`, behavior-preserving for admin. Minimerer divergens + test-churn.
- **Roster-cockpit = egen `/games/[id]/spillere`-flate** (ikke proppet inn i spiller-game-home) — holder spillerens scoring-vendte game-home ren; speiler Fase 1/2-mønsteret med dedikerte `/avslutt`, `/rediger`, `/slett`-ruter.
- **Approval-override leses på tvers av flighter via `getGameWithPlayers`** (admin-client) — oppretteren overvåker hele spillet, ikke bare egen flight (det er hele poenget med override når en flight-peer forsvinner). Authz på call-site.
- **Hub = `/klubbhuset`-rute nå, bunn-nav-fane = #392 senere** (eier-beslutning) — seeder Klubbhus-innholdet, oppdagbar via Hjem/Profil, forward-kompatibelt med #392s nav-restrukturering.
- **#429 lukker epic #22** (eier-beslutning) — cup-opprettelse bevisst utenfor.

**Claude's Discretion:**
- Eksakt plassering/stil/copy på `/games/[id]/spillere`-seksjonene + «Styr spillere»-inngangen + hub-inngangene (Hjem/Profil).
- Om pending-invite-listen + «Trekk invitasjon» (DELETE) tas med nå eller noteres som polish (kjernen = invite + roster + withdraw + approval).
- `removePlayerFromGame`-actionens plassering (`app/games/[id]/spillere/actions.ts`) + signatur.
- Hub-inngangens synlighet (alltid vs. kun ved ≥1 opprettet spill) + eksakt overskrift/navn.
- Om `?status=`/`?error=`-params bæres på redirects (game-home rendrer dem ikke; spillere-flaten kan).
- Lukke #22 via PR-body `Closes #22` vs. separat `gh issue close`.

## Success Criteria

- [x] **K1 (migrasjon + RLS mot ekte auth):** `0072_invitations_creator_game_invite.sql` applisert (`apply_migration` → `{success:true}`). `pg_policies` viser 3 nye policyer (`invitations creator game-invite insert/select/delete`); eksisterende urørt. Rollback-txn med ekte ikke-admin `auth.uid()` (`1f016c6a…`): **T1ins=1** (eget spill tillatt), **T2blocked=t** (annet spill 42501), **T3sel=1** (egne synlige), **T4othersel=0** (seedet andres-invite ikke synlig), **T5del=1** (egen slettbar). `leftover_invites=0, leftover_games=0`. `get_advisors security` → ingen nye warnings (kun pre-eksisterende baseline). Commit `dde3c81`.
- [x] **K2 (roster-actions):** Commit `9b29609`. `addExistingPlayerToGame` + `inviteEmailToGame` gater `requireAdminOrCreator`, forgrener `detailPath` (`/admin/games/[id]` vs `/games/[id]/spillere`), disposable-guard for ikke-admin (`!ctx.isAdmin && isDisposableEmailDomain`). Auth flyttet før form-validering. `inviteToGameActions.test.ts`: **16/16** — «oppretter legger til → /games/[id]/spillere», «oppretter ukjent e-post → invitations-insert + mail», «oppretter disposable blokkeres», «admin disposable IKKE blokkeres», + admin-stiene uendret.
- [x] **K3 (withdraw):** Commit `dbe80ff`. Ny `loadAdminOrCreatorContext`-helper; `adminWithdrawPlayer`/`adminUndoWithdraw` gater den, forgrener `detailPath`. `actions.test.ts`: «creator: withdraws on own game → /games/game-1/spillere?status=player_withdrawn» + «ikke admin/creator → /». `adminUndoWithdraw` deler identisk helper + kodesti (admin-undo-testene grønne); creator-undo følger samme gren.
- [x] **K4 (godkjennings-overstyring):** Commit `dbe80ff`. `adminApproveScorecard` gater `loadAdminOrCreatorContext`, forgrener redirect. `actions.test.ts` ny `adminApproveScorecard`-blokk: admin → `/admin/games/game-1?status=admin_approved`; **creator → `/games/game-1/spillere?status=admin_approved`**; not_active-bounce; ikke-eier → `/`. Idempotent update + `scorecard_approved`-notify bevart. *Avvik (discretion):* gjenbruker status-nøkkelen `admin_approved` (ikke `approved`) — spillere-flaten rendrer den som «Scorekortet er godkjent.».
- [x] **K5 (management-flate):** Commit `6a669ab`. Build registrerer `ƒ /games/[id]/spillere`. Gated `requireAdminOrCreator`; roster lest via `getGameWithPlayers`. draft/scheduled: «Med i spillet» m/ Fjern + `CreatorRosterClient` (getTeamCandidates-picker + e-post-invite) + pending-invite-liste m/ Trekk. active: roster m/ Trekk/Angre + «Venter på godkjenning» m/ `ApprovePlayerButton` (alle flighter). Ikke-eier ikke-admin → `/` (via gate).
- [x] **K6 (game-home-inngang):** Commit `6a669ab`. `CreatorControls` ([page.tsx](app/games/[id]/page.tsx)) viser «Styr spillere» → `/games/[id]/spillere` ved `scheduled || active`; Rediger/Slett uendret (pre-start). Kalt i begge grener (venterom linje ~500 + hovedreturn linje ~784).
- [x] **K7 (hub):** Commit `2470864`. Build registrerer `ƒ /klubbhuset`. Lister spill `created_by = user.id` (request-scoped, RLS 0071) m/ `StatusChip`, hver rad → `/games/[id]`; tom-tilstand → `/opprett-spill`. Oppdagbar: «Klubbhuset»-lenke på Hjem (ikke-admin m/ ≥1 opprettet spill, billig head-count) + «Klubbhuset»-rad i Profil-lista. Bunn-nav-fane utsatt til #392 (kommentar postes denne runden).
- [x] **K8 (suite grønn):** `npx vitest run` → **2657 passed (218 filer)**. `npm run lint` → **0 errors** (23 pre-eksisterende warnings i urørte filer). `npx tsc --noEmit` → 0. `npm run build` → clean (nye `/games/[id]/spillere` + `/klubbhuset` i rute-tabellen). Eksisterende admin-invite/withdraw/approve-tester grønne.
- [x] **K9 (versjon + epic):** `1.76.2` → `1.77.1` (MINOR-serie: 1.77.0 cockpit, 1.77.1 hub). CHANGELOG: ny `## 1.77.y — Styr ditt eget spill` åpen m/ begge oppføringer; `1.76.y` wrappet i `<details>` («3 oppføringer»). [README](README.md) kapabilitets-linje oppdatert. Humanizer-pass kjørt (droppet «roster»-anglisme). **Gjenstår ved merge:** closing-kommentar #429 (Teknisk + Funksjonell) + lukk epic #22 + #392-kommentar (postes denne runden). Ingen ulanderte reviewer-funn.

## Gates (etter hver chunk; scoped underveis, full suite før evaluator)

```bash
npm run lint
npm test            # scoped underveis: app/admin/games app/games app/klubbhuset app/page lib/admin lib/games lib/users
npm run build       # inkl. tsc --noEmit + rute-tabell (nye /games/[id]/spillere + /klubbhuset)
```

- RLS (K1) via Supabase MCP `execute_sql` i rollback-transaksjoner (ekte JWT-claim) — obligatorisk, #230-lærdom.
- Frontend (K5/K6/K7) → Playwright/preview obligatorisk for evaluator (frontend-filer rørt). Innlogget skjema-rendering kan ikke verifiseres lokalt (OTP) → bygg-verifisert + gjenbruk av beviste komponenter; visuell prod-verifisering av eier ved deploy.

## Files Likely Touched

- `supabase/migrations/0072_invitations_creator_game_invite.sql` — NY: creator game-scoped invitation INSERT/SELECT/DELETE
- `app/admin/games/[id]/inviteToGameActions.ts` — gate → `requireAdminOrCreator`, forgrenet detailPath, disposable-guard (ikke-admin)
- `app/admin/games/[id]/actions.ts` — `adminWithdrawPlayer`/`adminUndoWithdraw`/`adminApproveScorecard` gate → `requireAdminOrCreator`, forgrenet redirect
- co-located `*.test.ts` for de tre over — oppretter-gren + disposable + admin-uendret
- `app/games/[id]/spillere/page.tsx` — NY: AppShell roster/godkjennings-cockpit
- `app/games/[id]/spillere/actions.ts` — NY (om nødvendig): `removePlayerFromGame`
- `app/games/[id]/page.tsx` — `CreatorControls` + «Styr spillere»-inngang
- `app/klubbhuset/page.tsx` — NY: hub (spill jeg arrangerer)
- `app/page.tsx` + `app/profile/…` — hub-inngang
- `package.json` + `CHANGELOG.md` + `README.md` — versjon + oppføring + kapabilitet

## Out of Scope

- Bunn-nav Klubbhus-fane + full Klubbhus-flate-sett (#392).
- Cup-roster/-godkjenning/-opprettelse for ikke-admin (cup forblir admin-only).
- Venner-system / invitere utenfor co-player-nettverket uten e-post (#408).
- Ny E2E-spec utover evaluator-verifisering.
- Fjerning/migrering av `isTrustedCreator`-allowlisten.
- Self-service rolle-endring / moderering / rate-limit på bruker-opprettede spill (akseptert risiko #366/#427).
