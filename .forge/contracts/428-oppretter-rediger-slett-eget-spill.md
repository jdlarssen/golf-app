# Spec: Oppretter redigerer + sletter eget spill (ikke-admin-flater)

**Issue:** [#428](https://github.com/jdlarssen/golf-app/issues/428) — #22 Fase 2 (epic: alle kan opprette spill)
**Milestone:** Tier 6 — Demokratisert opprettelse
**Branch:** `claude/exciting-brown-0967ac` (denne worktreen)
**Bygger på:** #427 Fase 1 (creator-RLS migrasjon 0071, `requireAdminOrCreator`, `/games/[id]/avslutt`-mønsteret, `getNewGameFormData`-helper)

## Problem

Etter Fase 1 (#427) kan en vanlig innlogget bruker opprette, kjøre og avslutte sitt eget spill — men ikke **redigere** eller **slette** det. Endrer de noe (feil bane, ny tee-off-tid, justere rosteren) eller vil avlyse, har de ingen vei: rediger/slett bor kun i Sekretariatet (`/admin/games/[id]/edit` + `/slett`), bak `requireAdmin`. Fase 2 lukker hullet med ikke-admin-flater som speiler admin-flyten, gated på `requireAdminOrCreator`.

## Prior Decisions (videreført fra #427)

- **Ekte creator-RLS, ikke service-role-bypass** (migrasjon 0071): `games` creator UPDATE + DELETE og `game_players` creator INSERT/UPDATE/DELETE er **allerede på plass**. Fase 2 trenger **ingen ny migrasjon** — verifisert mot `pg_policies` (se K1).
- **`requireAdminOrCreator(supabase, gameId)`** (`lib/admin/auth.ts`): admin slipper rett gjennom; ellers må `games.created_by === userId`. Returnerer `AdminRoleContext`; kallere forgrener redirects på `ctx.isAdmin`. Gjenbrukes uendret.
- **Redirect-forgrening på `ctx.isAdmin`** (avslutt-mønsteret): admin → `/admin/games/*`, oppretter → `/games/*`. Når `ctx.isAdmin` er oppførselen byte-identisk med dagens admin-flyt.
- **Ikke-spillende oppretter er en akseptert edge** (#427): `game_players`-SELECT gater på `is_in_game`, så en oppretter som ikke selv er spiller kan ikke lese rosteren sin. Vanlig-case = oppretter ER spiller. Ikke løst her («Mine spill»-hub er Fase 3).
- **`getNewGameFormData()`** er den ikke-admin-trygge helperen for bane-/spiller-options (brukt av `/opprett-spill`). Gjenbrukes i rediger-flaten.

## Research Findings (RLS-verifisert mot prod, `pg_policies`)

Avgjør om ikke-admin-flatene faktisk fungerer under request-scoped RLS:

- **`games`** — creator UPDATE (`using/with check created_by = auth.uid()`) + DELETE (`using created_by = auth.uid()`) finnes allerede (0071). Edit (games-update) og slett (games-delete) er dekket. **Ingen migrasjon nødvendig.**
- **`game_players`** — creator INSERT/UPDATE/DELETE (parent-`created_by`-subquery) finnes (0071). Wholesale roster-replace (delete + insert) i edit-actionen er dekket. SELECT av eksisterende roster gater på `is_in_game` → fungerer for oppretter-som-spiller.
- **`courses` / `tee_boxes`** — `select all = true` → fullt lesbare for alle innlogget. Options-listen rendrer.
- **`users`** — `select own or shared games`: ikke-admin ser seg selv + co-spillere fra delte spill. Eget spills roster (= co-spillere i nettopp dette spillet) er derfor synlig i spiller-velgeren. Brukere man aldri har delt spill med er ikke synlige (= invitere-helt-nye er Fase 3, ikke i scope).
- **`scores` / `invitations`** (slett-bekreftelsens child-counts) — `scores` lesbar for spiller (egen/same-flight/finished); `invitations` har kun `admin write` + egen-incoming/outgoing-uten-game_id → game-scopede invitasjoner er **ikke** lesbare for en ikke-admin oppretter, så invitasjons-telleren leser 0 og linjen rendres ikke. Akseptert (counts er ren info).
- **FK ON DELETE CASCADE bypasser RLS** på child-tabeller — creator-DELETE på `games` (tillatt av creator-policy) sletter `game_players`/`scores`/`invitations` uansett child-RLS, samme som admin-slett.

## Design

### 1. Ny rediger-flate `/games/[id]/rediger` (AppShell) — speiler `app/admin/games/[id]/edit/page.tsx`

- Gate `requireAdminOrCreator(supabase, id)`. Uinnlogget → `/login` (i `loadRole`); ikke-eier ikke-admin → `/`.
- **Status-guard:** kun `draft` + `scheduled` redigerbart (handicaps fryses + scores oppstår ved start; identisk med admin-restriksjonen). `active`/`finished` → `redirect('/games/[id]?error=not_editable')` (game-home rendrer ikke `?error`; stille bounce er akseptert per #427-avslutt-presedens).
- **Options:** `getNewGameFormData()` (ikke-admin-trygg; filtrerer arkiverte tee_boxes). Eksisterende roster: `game_players`-read scoped til spillet (is_in_game for oppretter-spiller).
- **Form:** gjenbruk `GameForm` (IKKE wizard — admin-edit bruker også `GameForm` direkte) med `edit-draft`- eller `edit-scheduled`-mode. `InitialValues` bygges identisk med admin-siden (mode-lock pre-fyll: `lock_game_mode: game.status !== 'draft'`, Texas/setup-step mode_config-pre-fyll, side-tournament-kategorier, player_genders). `GameForm` har ingen hardkodede `/admin`-stier — submit-knappene kaller de passerte actionene; back-nav ligger i sidens `TopBar` (→ `/games/[id]`).

### 2. Åpne de delte edit-actionene for oppretter (`app/admin/games/[id]/edit/actions.ts`)

`updateGameInternal` (kalt av `saveDraftAction` / `publishFromDraftAction` / `updateScheduledAction`):

- Gate `requireAdmin` → **`requireAdminOrCreator(supabase, gameId)`**.
- **Forgren redirect-baser på `ctx.isAdmin`:** `editBase = isAdmin ? '/admin/games/${id}/edit' : '/games/${id}/rediger'`, `detailBase = isAdmin ? '/admin/games/${id}' : '/games/${id}'`. Erstatt alle hardkodede `/admin/games/${gameId}/edit`- og `/admin/games/${gameId}`-redirects med de forgrenede.
- **Pending-gate → RPC.** Bytt `findPendingPlayers(direkte users-read)` → `supabase.rpc('incomplete_profiles_for_ids', { p_user_ids })` (samme som `createGameInternal` i #427). Hvorfor: under request-scoped RLS filtrerer en direkte `users`-read stille bort rader oppretter ikke ser → en pending spiller kunne slippe gjennom (#366-fella). RPC-en returnerer ekte data uansett kaller. For admin er resultatet identisk (RPC = samme sett som `findPendingPlayers` ville gitt). Pending → `editBase?error=pending_players&emails=...`.
- **Mode-lock + optimistic-lock + wholesale roster-replace + notify-nye-spillere uendret** — writes (`games`-update, `game_players` delete+insert) går på request-scoped `supabase`, dekket av creator-RLS (0071). `notifyInvitedToGame` bruker `ctx.userId` som inviter.

### 3. Ny slett-flate `/games/[id]/slett` (AppShell) — speiler `app/admin/games/[id]/slett/page.tsx`

- Gate `requireAdminOrCreator(supabase, id)`.
- **Status-guard (eier-beslutning): kun `draft` + `scheduled`.** `active`/`finished` for en ikke-admin → `redirect('/games/[id]')` (oppretter har ingen slett-vei der; admin bruker Sekretariatet). For `ctx.isAdmin` på denne ruten: la passere (edge — admins bruker normalt admin-slett-siden).
- Dedikert bekreftelses-side (per destruktiv-handling-disiplin — aldri inline/`<details>`). Gjenbruk admin-siden sin copy/struktur: spillnavn, bane + dato, child-counts (spillere/slaggerader; invitasjons-linjen rendres ikke for ikke-admin pga RLS), «Handlingen kan ikke angres». Status-warning kun relevant for `scheduled` («spillerne er invitert, får ingen avlysnings-melding»). Back/avbryt → `/games/[id]`.

### 4. Åpne den delte slett-actionen for oppretter (`app/admin/games/[id]/slett/actions.ts`)

`deleteGame(formData)`:

- Gate `requireAdmin` → **`requireAdminOrCreator(supabase, gameId)`**.
- **Ikke-admin status-sperre:** les `games.status`; hvis `!ctx.isAdmin` og status ∈ {`active`,`finished`} → `redirect('/games/${gameId}?error=not_deletable')` (defensivt — siden gater allerede, men action self-gater mot direkte POST). Admin uberørt (kan slette alle tilstander).
- `games.delete()` (cascade håndterer children). Feil → forgren slett-sti: admin `/admin/games/${id}/slett?error=delete_failed`, oppretter `/games/${id}/slett?error=delete_failed`.
- **Suksess forgrenet:** admin → `/admin/games?status=deleted&name=${name}` (uendret). Oppretter → **`/?deleted=${name}`** (eier-beslutning: hjem med bekreftelse).

### 5. Hjem-bekreftelse etter creator-slett (`app/page.tsx`)

- Utvid `SearchParams` med `deleted?: string | string[]`. Når satt: render `<Banner tone="success">` med «{Name} er slettet.» (eller generisk «Spillet er slettet.» hvis navn mangler). Gjenbruk det eksisterende success-banner-mønsteret (`app/page.tsx:72`, profile-updated). Humanizer-pass på copy.

### 6. Inngang på `/games/[id]` — creator-kontroller

Gjenbruk `isCreator = gwp.game.created_by === userId` (finnes allerede). Vis for oppretter:

- **«Rediger spill»** → `/games/[id]/rediger`, synlig kun ved `draft` || `scheduled`.
- **«Slett spill»** → `/games/[id]/slett`, synlig kun ved `draft` || `scheduled` (matcher slett-sperra).
- Må vises i **to grener:** (a) den eksisterende `scheduled`-venterom-early-return-en (linjer ~354–509) og (b) hovedreturn-en (`draft`/`active`/`finished`). Ekstraher en liten `CreatorControls`-helper (gameId + status) for å unngå duplisering; dropp den inn i begge grenene. Eksisterende «Avslutt spillet»-kort (`active && isCreator`) beholdes uendret. Plassering/stil = discretion (understated, gruppert som arrangør-kontroll; ikke konkurrer med score-CTA).

## Edge Cases & Guardrails

- **Direkte action-POST:** edit- + slett-actionene self-gater på `requireAdminOrCreator` (ikke bare sidene). Uinnlogget/ikke-eier POST → redirect. Ikke-admin POST mot active/finished slett → `not_deletable`-bounce.
- **Mode-lock må bite for oppretter:** publisere/lagre scheduled med endret `game_mode` → `mode_locked_after_publish` (samme guard, nå via forgrenet `editBase`).
- **Optimistic-lock:** status flippet mellom render og submit (f.eks. auto-start) → update ekskluderes (`.eq('status', allowedFromStatus)`) → bounce til detalj med `not_editable`. Gjelder begge roller.
- **Pending-spiller blokkerer publish (oppretter):** RPC-gaten må gi ekte sperre, ikke stille no-op. Dekkes av action-test (mock RPC) + RLS-verifisert i #427-K2 (RPC returnerer count uansett RLS).
- **Wholesale roster-replace med self-registrerte spillere (#199):** form-en pre-laster gjeldende roster → bevart med mindre oppretter aktivt fjerner. Identisk admin-oppførsel.
- **Ikke-spillende oppretter:** kan nå rediger/slett via URL (created_by-SELECT), men roster-read (`game_players`, is_in_game) returnerer tomt → tom spiller-liste. Akseptert edge (#427); vanlig-case = oppretter er spiller.
- **Admin-flyten byte-identisk:** `/admin/games/[id]/edit` + `/slett` + redirects uendret når `ctx.isAdmin`. Verifiseres mot eksisterende admin-tester (`edit/actions.test.ts`).
- **Cascade-sletting:** creator-DELETE cascader til children uansett child-RLS (FK-actions bypasser RLS). Samme som admin.

## Key Decisions

- **Ingen ny migrasjon** — 0071 (Fase 1) dekker allerede games UPDATE/DELETE + game_players writes for creators. Bekreftet mot `pg_policies`.
- **Slett kun draft + scheduled for oppretter** (eier-beslutning) — beskytter medspilleres pågående/avsluttede runder (et avsluttet leaderboard «eies» av alle). Active/finished slettes kun av admin (recovery). Sperre håndheves på BÅDE siden og actionen (ikke-admin-gren).
- **Etter creator-slett → `/` med «{Name} er slettet»-banner** (eier-beslutning). Ingen «Mine spill»-hub ennå (Fase 3).
- **Pending-gate via RPC også i edit** (ikke bare create) — den ikke-admin oppretter-stien er reell (ikke hypotetisk som startScheduledGame-no-op-en i #427), så RLS-no-op-fella må lukkes her. Behavior-preserving for admin.
- **Gjenbruk `GameForm` + delte actions** (ikke duplikat ikke-admin-actions) — speiler avslutt-mønsteret fra #427; minimerer divergens-risiko og test-churn.

**Claude's Discretion:**
- Eksakt plassering/stil/copy på «Rediger spill»- + «Slett spill»-inngangene (understated arrangør-gruppe).
- Form på `CreatorControls`-helperen (egen fil vs. inline-funksjon i `page.tsx`).
- Eksakt query-param-form for hjem-bekreftelsen (`?deleted=<name>` vs `?deleted=1`) + banner-copy.
- Hvor mye av admin-slett-sidens copy/struktur som gjenbrukes vs. lett tilpasses AppShell-tonen.
- Om not_editable/not_deletable-redirects bærer `?error=` (uvist på game-home) eller dropper det.

## Success Criteria

- [x] **K1 (ingen migrasjon — RLS allerede dekket):** `pg_policies` viser `games creator update`, `games creator delete`, `game_players creator insert/update/delete` fra 0071. Ingen ny `supabase/migrations/`-fil lagt til.
  - *Evidens:* `execute_sql` mot `pg_policies` (start av sesjonen) bekreftet `games creator update`/`games creator delete`/`game_players creator insert/update/delete` + `games select own created`. `git diff --name-only origin/main...HEAD -- supabase/migrations/` → tom (ingen migrasjon). Edit (games-update + game_players delete/insert) og slett (games-delete → FK CASCADE som bypasser child-RLS) er fullt dekket.
- [x] **K2 (rediger):** Oppretter åpner `/games/[id]/rediger` for eget `draft`/`scheduled`-spill, endrer felt, lagrer/publiserer → `games`-rad oppdatert, redirect til `/games/[id]`. `active`/`finished` → bounce. Mode-lock + optimistic-lock bevart. Ikke-eier ikke-admin → `/`.
  - *Evidens:* commit `eeb4de9`. Build registrerer `ƒ /games/[id]/rediger`. [`app/admin/games/[id]/edit/actions.ts`](app/admin/games/[id]/edit/actions.ts) gater på `requireAdminOrCreator`, forgrener `editBase`/`detailBase` på `isAdmin`, pending via RPC. `edit/actions.test.ts`: **9/9** — inkl. «oppretter lander på /games/[id] etter update_scheduled», «oppretter publish med pending-spiller bouncer til /games/[id]/rediger», «ikke-eier ikke-admin → /», + admin mode-lock/notify byte-identisk. Mode-lock + optimistic-lock urørt (samme kodesti). Statusguard i `rediger/page.tsx`.
- [x] **K3 (slett):** Oppretter sletter eget `draft`/`scheduled`-spill via `/games/[id]/slett` (dedikert bekreftelse) → cascade-delete, redirect `/?deleted=...`, hjem viser «slettet»-banner. `active`/`finished` ikke-admin → blokkert (side + action). Admin-slett byte-identisk.
  - *Evidens:* commit `8ab6678` (+ `0a6bcea` for action). Build registrerer `ƒ /games/[id]/slett`. [`slett/actions.ts`](app/admin/games/[id]/slett/actions.ts) gater `requireAdminOrCreator` + ikke-admin status-sperre (draft/scheduled) + forgrenet redirect. `slett/actions.test.ts`: **5/5** — admin sletter finished → Sekretariatet; oppretter sletter draft → `/?deleted=Sommer-runde`; oppretter blokkert på finished + active (ingen delete); ikke-eier → `/`. [`app/page.tsx`](app/page.tsx) rendrer «{navn} er slettet»-banner ved `?deleted`. Slett-siden status-gater til draft/scheduled.
- [x] **K4 (inngang):** `/games/[id]` viser «Rediger spill» + «Slett spill» for oppretter ved `draft`/`scheduled` (begge grener: venterom + hovedreturn); skjult for ikke-oppretter og for active/finished. «Avslutt»-kortet uendret.
  - *Evidens:* commit `eeb4de9` (Rediger) + `8ab6678` (Slett). `CreatorControls` ([`page.tsx:1192`](app/games/[id]/page.tsx)) self-gater `status === 'draft' || 'scheduled'`, kalt gated `isCreator` på linje 500 (scheduled-venterom) + 784 (hovedreturn). «Slett spill»-kortet er `text-danger`/`border-danger`. Avslutt-kortet (`active && isCreator`) urørt.
- [x] **K5 (suite grønn):** `npm run lint` + `npm test` + `npm run build` + `tsc --noEmit` grønt. Eksisterende admin-edit/slett-tester fortsatt grønne.
  - *Evidens:* `npx vitest run` → **2648 passed (218 filer)**. `npx tsc --noEmit` rent. `npm run build` clean (begge nye ruter i tabellen). `npx eslint` på alle rørte filer → 0 errors.
- [x] **K6 (versjon):** `1.75.0` → `1.76.1` (MINOR-serie). CHANGELOG-oppføring under ny `1.76.y`-seksjon; forrige serie wrappet i `<details>`. Commit-msg-hook passerer.
  - *Evidens:* `package.json` = `1.76.1`. Ny `## 1.76.y — Rediger og slett ditt eget spill` åpen med `[1.76.1]` (slett) + `[1.76.0]` (rediger); `1.75.y` wrappet i `<details>`. To `feat`-commits passerte commit-msg-hooken (package.json+CHANGELOG staged). Humanizer-skill kjørt på ny copy — alle strenger idiomatisk bokmål, ingen tells.

## Gates (etter hver chunk; scoped underveis, full suite før evaluator)

```bash
npm run lint
npm test            # scoped underveis: app/games app/admin/games/[id] app/page lib/admin lib/games
npm run build       # inkl. tsc --noEmit + rute-tabell (nye /games/[id]/rediger + /slett)
```

- Frontend (rediger/slett-sider + inngang) → Playwright/preview obligatorisk for evaluator (frontend-filer rørt). Innlogget skjema-rendering kan ikke verifiseres lokalt (OTP) → bygg-verifisert + gjenbruk av beviste komponenter (`GameForm`, admin-slett-struktur); visuell prod-verifisering ved deploy.
- RLS er allerede verifisert i #427-K2; ingen ny SQL-verifisering nødvendig (Fase 2 legger ingen policyer til).

## Files Likely Touched

- `app/games/[id]/rediger/page.tsx` — NY: AppShell rediger-flate (gjenbruker `GameForm` + `getNewGameFormData`)
- `app/games/[id]/slett/page.tsx` — NY: AppShell slett-bekreftelse (speiler admin-slett-siden)
- `app/admin/games/[id]/edit/actions.ts` — gate → `requireAdminOrCreator`, redirect forgrenet på isAdmin, pending-gate → RPC
- `app/admin/games/[id]/edit/actions.test.ts` — oppdater for forgrenet redirect + RPC-pending; legg til oppretter-gren + ikke-eier-bounce
- `app/admin/games/[id]/slett/actions.ts` — gate → `requireAdminOrCreator`, ikke-admin status-sperre (draft/scheduled), suksess/feil forgrenet
- `app/games/[id]/page.tsx` — `CreatorControls` (Rediger/Slett) i venterom- + hovedreturn-grenene
- `app/page.tsx` — `?deleted`-param + «slettet»-bekreftelses-banner
- `package.json` + `CHANGELOG.md` — 1.76.0 + oppføring

## Out of Scope (senere faser / ikke i mandat)

- Roster-styring utover wholesale-replace / invitere helt-nye brukere fra rediger-flyten (Fase 3 «Venner-system», #408).
- Godkjennings-overstyring / «Mine spill»-hub (Fase 3).
- Creator-sletting av `active`/`finished`-spill (eier-beslutning: admin-only).
- Cup-redigering/-sletting for ikke-admin (cup forblir admin-only).
- Full game-home-visning for ikke-spillende oppretter (akseptert edge fra #427).
- Ny E2E-spec utover evaluator-verifisering.
- Fjerning/migrering av `isTrustedCreator`-allowlisten.
