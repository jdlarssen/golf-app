# Spec: Slett konto — snevre inn sperren til «eneste arrangør», automatisk frafall, demo-re-seed (#1909)

## Problem

Blokk-regelen i `lib/users/deleteAccount.ts` (`getDeleteBlockReason`) nekter sletting så
lenge du **deltar i** eller **arrangerer** noe som pågår. For en spiller midt i en runde
er det en midlertidig sperre; for App Store-review-kontoen er den permanent — demo-spillet
står aktivt for alltid, og kontoen eier det. Revieweren møter derfor banneret «… ta
kontakt med administrator» uten noen knapp, som er nøyaktig den omveien Apple avviser
under 5.1.1(v). Samme felle treffer ekte brukere som har satt opp en cup/liga som aldri
ble avsluttet (GDPR-sletteretten uten fungerende sti).

**Eiervalg (issue-kommentar 2026-09-02): vei 2.** Spillere slipper alltid gjennom
(sletting = automatisk frafall fra det som pågår); kun den som er *eneste arrangør av noe
aktivt* må avslutte først — runden i appen (N6c) eller på nettsiden, cup/liga på
nettsiden. Demo-spillet re-seedes med admin-kontoen som arrangør og review-kontoen som
deltaker, så revieweren kan slette seg uten at demoen forsvinner. Vei 1 (sletting rydder
alt selv, inkl. arrangørskap) er en senere forbedring.

## Research Findings (verifisert 2026-09-02 mot HEAD = origin/main c8b1c898 og LIVE DB)

DeepWiki/Context7 var utilgjengelig; funnene under er lest fra repoet og introspektert
via Supabase MCP (staging `snwmueecmfqqdurxedxv`, prod read-only `glofubopddkjhymcbaph`).

- **Drift mot HEAD: ingen.** #1876 (PR #1905) er merget 2026-09-02T17:13Z; ingen åpne
  PR-er rører `deleteAccount.ts`, `anonymize_user` eller provisjonsskriptet.
- **`anonymize_user` live = 0142-formen** i BÅDE staging og prod (md5 av
  `pg_get_functiondef` identisk, `16917e3a…`; green_pins-nullingen er med, ingen senere
  migrasjon rører den). Den rører i dag IKKE `game_players`, `tournament_participants`
  eller `league_players` — bevisst, «spillhistorikk beholdes». Kun `service_role` har
  EXECUTE. Siste migrasjon på main er `0172` → ny fil blir `0173`.
- **Frafalls-mekanikken finnes alt på web** (`app/[locale]/games/[id]/withdrawActions.ts`):
  aktivt spill + `supportsWithdrawal(mode)` → `withdrawn_at` + `withdrawn_by_user_id`;
  pre-start (draft/scheduled) → `DELETE game_players` (+ `game_registration_requests`).
  `endGameCore.ts:186` hopper over `withdrawn_at`-rader **uansett modus** («never counts
  as a missing submission or a pending approval»), så en trukket spiller blokkerer aldri
  arrangørens avslutning — det er egenskapen slettingen trenger. For modi uten
  WD-støtte teller scorene fortsatt i rangeringen («ikke levert»-fallback, dokumentert i
  `supportsWithdrawal`), som er akseptabelt for en konto som er borte.
- **Vakta 0147/0168** (`guard_game_players_self_update`, live md5 = 0168 i begge miljøer)
  blokkerer selv-endring av `withdrawn_*` under RLS, men `auth.uid() is null`
  (service-role, og dermed alt som kjører inne i den service-role-kalte
  `anonymize_user`) passerer. Ingen policy-/vakt-endring trengs.
- **Ingen FK-er peker på `game_players` eller `tournament_participants`** (pg_constraint,
  staging) → pre-start-DELETE er FK-trygt. Triggerne på `game_players`
  (invite_eligibility, score_differential, self_update) slipper alle service-role.
- **Cup:** `tournament_participants` er generate-wizardens ENESTE spillerkilde
  (`lib/cup/planActions.ts:319ff`, jf. `participantRosterSync.ts`). En tombstone som blir
  stående der trekkes inn i neste runde. **Liga:** `league_players` → `game_players` ved
  runde-opprettelse (`lib/league/actions.ts:711`); arrangørens `removeLeaguePlayer`
  sletter `league_players`-raden.
- **Arrangør-begrepet:** det finnes ingen med-arrangør-tabell for spill (grep
  `organizer|co_creator` = 0 treff; `games.created_by` er én person). Cup/liga:
  `requireAdminOrClubAdminOfCup/League` lar en klubbadmin avslutte KLUBB-cup/-liga;
  personlige cuper kan kun creator (+ global admin) avslutte. FK
  `tournaments/leagues.created_by` er RESTRICT, og cron/varsler adresserer creator.
- **Prod-tilstand:** 1 admin; review-kontoen eier 1 aktivt demo-spill
  (`tournament_id` null). **Staging:** review-kontoens staging-variant eier 1 aktivt spill;
  `E2E_ADMIN` er admin.
- **Copy-hjemmene:** web `messages/{no,en}.json → profile.deleteAccount.blockedBanner`
  (før) + `errors.active_games` (etter) + `admin.players…errors.target_active` (**to**
  steder, linje ~3716 og ~3798); app `native/app/src/lib/accountCopy.ts` med
  paritetstest `accountCopy.test.ts` som leser `no.json` tegn for tegn.
- **Seed-mekanismen (#1284):** `scripts/provision-review-account.mjs` (idempotent,
  `--env staging|prod`, finner demo-spillet via `created_by = review` + navn) +
  runbook `docs/native/app-store-review-konto.md`. Skriptet vil i dag IKKE finne igjen
  et spill som er re-parentet, og IKKE rydde en tombstone i rosteret.
- **Funn utenfor scope (eget issue):** 0110-vakta «last owner» slipper service-role, så
  `anonymize_user` lar en eneste klubbeier slette seg → klubben blir eierløs.

## Prior Decisions (videreført)

- **#1012:** anonymisering, ikke hard delete, for alle med spillhistorikk; RPC-før-auth
  for retrybarhet; `deleted_at`-shortcircuit; «Slettet bruker»-literal; historikk
  beholdes.
- **#1876:** ruta `app/api/account/delete` er transport foran hjelperne — regelen har
  ETT hjem i `lib/users/deleteAccount.ts`; wiren (`blocked`/403-koder) er frosset og
  appen fail-closer på ukjente koder; appen speiler aldri regelen; copy-paritet
  web↔app via `accountCopy.test.ts`.
- **#1284:** review-kontoen er env-gatet, provisjoneres av skriptet, ingen e-post/passord
  i repoet, reset før hver innsending; prod-skriv kun etter eier-ja i økten.
- Prod-brannmuren #1074 (`touch .claude/approve-prod`), «aldri auto-merge» for
  destruktive flyter + prod-migrasjoner, `[no-changelog]` på native-only commits,
  humanizer på ny norsk copy.

## Design

### (a) Regelen — hvem blokkeres

`getDeleteBlockReason(userId)` returnerer `'active_engagements'` **kun** når kontoen er
`created_by` på noe som ikke er ferdig:

| Ting | Blokkerer når | Veien ut |
|---|---|---|
| Spill (`games`) | `created_by = user` og `status in ('active','scheduled')` | Avslutt runden (app N6c / web); planlagt spill: start + avslutt, eller slett spillet på nettsiden |
| Cup (`tournaments`) | `created_by = user` og `status <> 'finished'` | Avslutt cupen på nettsiden |
| Liga (`leagues`) | `created_by = user` og `status <> 'finished'` | Avslutt ligaen på nettsiden |

Deltakelse (`game_players`) blokkerer **ikke lenger** — den grenen fjernes. Admin-kontoen
(`'admin_account'`) er uendret. Draft-spill blokkerer ikke (som i dag).

**Definisjonen «eneste arrangør»:** `created_by` er alltid én person, og det finnes ingen
med-arrangør-rolle for spill — «eneste» er derfor gitt. **ASSUMPTION (autonom økt):** at
en klubbadmin *kunne* avsluttet en klubb-cup/-liga relakserer ikke sperren: FK-en er
RESTRICT, cron og varsler adresserer creator, og en anonymisert creator etterlater
turneringen uten styring (samme begrunnelse som i #1012). Kan mykes opp senere som eget
issue hvis det oppstår et reelt tilfelle.

Wire-koden `active_engagements` **beholdes** (frosset wire; kun betydning + copy endres).

### (b) Frafallet — ETT hjem: inne i `anonymize_user` (migrasjon `0173`)

Frafallet legges inn i RPC-en, FØR scrubben, i samme transaksjon. Begrunnelse: begge
web-flyter og app-ruta går gjennom `deleteOrAnonymizeUser` → RPC-en, så RPC-en er det ene
hjemmet som dekker alle tre kallere (trap 4); atomisk (aldri «trukket, men ikke slettet»);
service-role-kontekst slipper 0147/0168-vakta uten policy-endring; og retry via
`deleted_at`-shortcircuiten forblir korrekt fordi frafallet alt er committet sammen med
`deleted_at`. Alternativet — helper-laget med admin-klient før RPC-kallet — ble forkastet
fordi et RPC-feilslag ville etterlatt brukeren trukket fra spill uten å være slettet
(ingen angre for pre-start-DELETE), og fordi hard-delete-stien (0 `game_players`) aldri
trenger det.

Ny kropp = LIVE 0142-kroppen (kopiér fra `pg_get_functiondef` i staging, ikke fra fila —
trap 4/#1855-lærdommen) + disse stegene, alle med `where user_id = p_user_id`:

1. **Aktive spill** (`games.status = 'active'`): `update public.game_players set
   withdrawn_at = coalesce(withdrawn_at, now()), withdrawn_by_user_id =
   coalesce(withdrawn_by_user_id, p_user_id)` — uansett modus (se Research: endGameCore
   hopper over trukkede). Raden + scorene består («Slettet bruker · Trukket»).
2. **Ikke-startede spill** (`games.status in ('draft','scheduled')`): `delete from
   public.game_players` — speiler webbens pre-start-frafall. (`game_registration_requests`
   slettes alt av RPC-en i dag.)
3. **Uavsluttede cuper** (`tournaments.status <> 'finished'`): `delete from
   public.tournament_participants` — ellers trekker generate-wizarden tombstonen inn i
   neste runde. Finished cuper beholder raden (historikk). Kaptein-/lagrolle (`is_captain`,
   `team_number`) slettes med — arrangøren utpeker ny. **ASSUMPTION:** dette hører til
   «automatisk frafall»; uten det er frafallet fra cup-kampene bare midlertidig.
4. **Uavsluttede ligaer** (`leagues.status <> 'finished'`): `delete from
   public.league_players` — speiler `removeLeaguePlayer`, hindrer re-rostering ved neste
   runde. Finished ligaer beholder raden. Spilte runder (game_players/scores) består.
5. **Cup-lineup-seter** (`cup_lineup_slots.user_id = p_user_id` i økter for uavsluttede
   cuper): frigjøres (delete). Byggeren verifiserer `cup_lineup_sessions.tournament_id`-
   koblingen live før SQL-en skrives (0172).

Idempotens: `coalesce` bevarer første `withdrawn_at`; DELETE-er er naturlig idempotente.
Funksjonssignatur, grants og `comment on function` oppdateres (kommentaren nevner nå
frafallet). Ingen typeendring — `database.types.ts` røres ikke.

**Rekkefølge mot prod (lastbærende):** migrasjonen er ufarlig FØR kode-deploy (den
trekker bare folk som dagens regel ikke slipper gjennom), men koden er FEIL uten
migrasjonen (en spiller midt i en runde ville blitt anonymisert uten å trekkes). Altså:
staging-apply via MCP → verifiser → PR → eier åpner prod-luka → **prod-migrasjon FØR
merge** → merge/deploy → eier kjører prod-re-seed (d). Samme mønster som additive
kolonner (0169/0172).

### (c) Copy — begge flater, uten «administrator»

Fire strenger endres (norsk + engelsk; app-literalene i `accountCopy.ts` følger via
paritetstesten). Utkast — byggeren kjører `humanizer:humanizer` og kan justere ordlyd,
men **kravene** står: (1) det handler om å *arrangere*, ikke delta; (2) veien ut nevnes
per ting: runde → appen eller nettsiden, cup/liga → nettsiden; (3) ordet «administrator»
forekommer ikke; (4) husets stemme, du-form.

- `profile.deleteAccount.blockedBanner` (banner FØR, web + app `describeDeleteBlock`):
  «Du arrangerer noe som ikke er avsluttet ennå. Avslutt runden først, i appen eller på
  nettsiden. Cup og liga avslutter du på nettsiden. Etterpå kan du slette kontoen.»
- `profile.deleteAccount.errors.active_games` (ETTER, 403/redirect, app
  `describeDeleteFailure`): «Du arrangerer fortsatt noe som ikke er avsluttet. Avslutt
  det først, så kan du slette kontoen.»
- `admin.players…errors.target_active` (BEGGE forekomster): «Spilleren arrangerer noe som
  ikke er avsluttet ennå. Avslutt det først, så kan kontoen slettes.»
- **Nytt kulepunkt** under «Dette vil bli slettet» (web `bullet4` + app
  `deletedBullets[3]` + paritetstest): «Plassen din i runder som pågår eller ikke har
  startet. Du trekkes automatisk, og resten av gruppa spiller videre.» — spilleren skal
  vite at sletting midt i en runde er et frafall.

`errors.delete_failed` («… eller ta kontakt med administrator») er en generisk feil og
røres ikke — den er ikke sperren Apple vurderer. Appens egne koder (`no-web-base-url`)
røres ikke.

### (d) Demo-re-seed — `scripts/provision-review-account.mjs` + runbook

Skriptet endres slik at det er **repeterbart etter at en reviewer har slettet kontoen**:

1. **Arrangør = admin-kontoen.** Slå opp `users.is_admin = true`; nøyaktig én → bruk den
   (prod har én). Flere eller ingen → krev `REVIEW_DEMO_ORGANIZER_EMAIL` i env og stopp
   med klar melding uten. Skriv arrangøren i oppsummeringen.
2. **Finn spillet på navn, ikke på creator:** nyeste `games` med `name = DEMO_GAME_NAME`
   uansett `created_by`. Er `created_by ≠ admin` → `update games set created_by =
   admin` (re-parenter dagens prod-spill; `.select` + radtelling per trap 2).
3. **Review-kontoen = deltaker:** fantes ikke (slettet → tombstone-e-post matcher ikke,
   GoTrue har frigjort adressen) → `createUser` som i dag; alltid `game_players`-rad med
   `accepted_at`, flight 1, hcp som i dag. Admin står IKKE i rosteret.
4. **Rydd tombstones:** slett `game_players`-rader i spillet hvis `user_id` ∉ {review,
   Emma, Jonas, Nora}, og alle `scores` (resettes uansett). Forrige reviewers
   anonymiserte rad forsvinner dermed fra rosteret.
5. Resten (scores hull 1–6/1–3, `entered_by = review`, status `active`, leveringer
   nullet) som i dag. Fjern `deleted_at: null`-skrivet på profilen KUN hvis byggeren
   finner at det kan treffe en tombstone — det skal aldri av-slette noen (i dag treffer
   det bare den ferske raden; behold).

**Runbook** `docs/native/app-store-review-konto.md`: «Reset før hver innsending» →
«Reset før hver innsending — og etter hver review» med presis forklaring: revieweren kan
nå slette kontoen (det er meningen, 5.1.1(v)); kjøringen lager kontoen på nytt, rydder
rosteret og setter demoen tilbake; arrangøren er admin-kontoen, som derfor har demo-runden
liggende under sine runder (akseptert kostnad, eiervalg). Demo-data-seksjonen og
ASC-notes-malen oppdateres: revieweren *leverer* scorekortet (kan ikke avslutte runden
lenger) og kan teste «Account → Delete account». `docs/native/app-spike.md` (#1876-
seksjonen) får ett avsnitt om at frafallet bor i RPC-en. `docs/user-flows.md:169`
oppdateres («Blokkeres hvis eneste arrangør av noe uavsluttet»).

**Prod-kjøringen** av skriptet er et eier-godkjent steg (skriver til prod via
service-role): kommandoen står ferdig i runbooken, kjøres av eieren eller i økt med
eksplisitt ja — ETTER merge/deploy.

## Edge Cases & Guardrails

- **Arrangør som også spiller** i eget aktive spill: blokkert (creator) — ikke trukket.
- **Cup-avledet spill** (`tournament_id` satt) der brukeren spiller: aktivt → trukket;
  planlagt → raden slettes + deltaker-raden i cupen slettes → cup-arrangøren ser hullet og
  bytter inn reserve (`swapCupMatchPlayer`-veien finnes). Walkover-semantikk for matchplay
  bygges ikke.
- **Eksakt-antall-format** (foursomes m.fl.) planlagt: rosteret blir ett hode kort —
  samme utfall som webbens frafall i dag; arrangøren fikser rosteret før start.
- **Peer-godkjenning** (`require_peer_approval`): trukket rad krever ikke godkjenning
  (endGameCore). Scorer den trukkede alt har ført for flightkamerater består.
- **Retry etter delvis feil:** RPC committet (trukket + `deleted_at`), auth-steg feilet →
  neste forsøk tar `deleted_at`-shortcircuiten; frafallet re-kjøres ikke. RPC feilet →
  ingenting er endret (én transaksjon).
- **Admin-slett av spiller midt i runde** går nå gjennom med samme frafall — bevisst
  (samme hjelper, samme RPC).
- **Ukjent/uendret wire:** appen viser gammel banner-ordlyd inntil ny build; koden er lik,
  så ingen fail-closed-avvik. Butikk-build finnes ennå ikke.
- **STAGING-VERN:** e2e-brukere som slettes er engangsbrukere (`seedEphemeralPlayers`-
  mønsteret), ALDRI `E2E_ADMIN`/`E2E_PLAYER`; review-kontoen på staging KAN slettes (den
  er nettopp det re-seeden skal tåle).
- **Ikke rør:** hard-delete-stien, `deleted_at`-guarden i `guard_users_self_update`,
  webbens sidestruktur, ruta (`route.ts` uendret — wiren står).

## Key Decisions

- **Frafallet bor i RPC-en, ikke i helper-laget** — atomisk, ett hjem for tre kallere,
  service-role slipper vakta uten policy-endring (se (b)).
- **Frafall omfatter cup-deltakelse og liga-medlemskap for uavsluttede turneringer** —
  ellers er frafallet reversert av neste generering (ASSUMPTION, se (b)).
- **Wire-koden beholdes** — ingen app-/rute-endring for regelen; kun copy.
- **Arrangør = `created_by`, klubbadmin relakserer ikke** (ASSUMPTION, se (a)).
- **Nytt kulepunkt om automatisk frafall** på bekreftelsessiden — honest UX.
- **Prod-migrasjon FØR merge** (kode uten RPC-endring er feil, RPC uten kode er ufarlig).

**Claude's Discretion:** eksakt ordlyd innenfor copy-kravene (humanizer); om skriptet
skal ta `--organizer <email>` som flagg i tillegg til env; om `withdrawn_by_user_id`
settes til `p_user_id` (default) eller NULL; pgTAP-filstruktur (utvid
`users_anonymize_test.sql` eller ny fil); `.changes`-notatet er `fix` (tagline-forslag:
«Du kan nå slette kontoen selv om du er med i en runde som pågår — du trekkes
automatisk. Bare den som arrangerer noe må avslutte det først.»).

## Success Criteria

- [ ] 1. **Regelen (vitest, Type A):** `lib/users/deleteAccount.test.ts` beviser: spiller i
  aktivt/planlagt spill uten arrangørskap → `null`; creator av planlagt/aktivt spill →
  `active_engagements`; creator av uavsluttet cup/liga → `active_engagements`; admin →
  `admin_account`; `deleted_at` satt → `null`. `npx vitest run lib/users
  app/api/account` grønn (tall i PR).
- [ ] 2. **RPC-en (pgTAP):** aktivt spill → `game_players`-rad består med `withdrawn_at`
  + `withdrawn_by_user_id = p_user_id`; planlagt spill → raden slettet; ferdig spill →
  urørt; uavsluttet cup → `tournament_participants`-rad slettet, ferdig cup → beholdt;
  uavsluttet liga → `league_players`-rad slettet; re-kjøring bevarer første
  `withdrawn_at`. `npm run test:rls` med pgTAP-output (skipper CLI: skriv testene +
  `VERIFICATION GAP` + samme asserts probet mot staging med service-role, som i #1012).
- [ ] 3. **Staging e2e — spiller midt i runde:** engangsbruker i aktivt staging-spill
  sletter via `POST /api/account/delete` (mintet token) → 200; DB: `deleted_at` satt,
  tombstone-e-post, `withdrawn_at` satt; arrangøren avslutter spillet på web UTEN
  «avslutt likevel» (skjermbilde + SQL).
- [ ] 4. **Staging — arrangør blokkeres med ny copy:** engangsbruker som er creator av et
  planlagt spill → GET `blocked: 'active_engagements'`, POST 403; web
  `/profile/slett-konto` viser nytt banner (skjermbilde); `grep -c administrator` på de
  fire endrede nøklene i `no.json`/`en.json` og de to app-switch-grenene = 0;
  `accountCopy.test.ts` grønn.
- [ ] 5. **Staging — demo-re-seed er repeterbar:** `node scripts/provision-review-account.mjs
  --env staging` → `games.created_by = E2E_ADMIN`, review-kontoen i rosteret med
  `accepted_at`; slett review-kontoen via ruta; kjør skriptet igjen → ny auth-bruker med
  samme e-post, roster = review + Emma/Jonas/Nora (4 rader, 0 tombstones), 21 scores,
  status `active`. SQL-bevis før/etter i PR-en.
- [ ] 6. **Regresjon:** rot `npx vitest run` grønn; `native/app` `npx jest` + `npx tsc
  --noEmit` grønne; `route.ts`/`route.test.ts` uendret (diff-bevis); webbens admin-slett
  klikk-verifisert på staging med nytt `target_active`-banner.
- [ ] 7. **Porter + dokumentasjon + prod-status:** alle Gates grønne; runbook,
  app-spike-avsnitt og `docs/user-flows.md:169` oppdatert; `.changes/1909-*.md` finnes;
  PR-body sier ærlig «Prod-migrasjon 0173: IKKE påført — venter eier-luka; prod-re-seed:
  eier-steg etter deploy» til det er gjort. PR-en auto-merges ALDRI.

## Gates

(Node 22; `npm install` i rot og `native/app/`. Staging-verify i prod-server-modus:
`next build` m/ staging-env + `next start`, aldri dev.)

- [ ] `npm run build` (rot, med pipefail) grønt
- [ ] `npm run lint` grønt
- [ ] `npx vitest run` (rot) grønt — inkl. `lib/users`, `app/api/account`, `messages`-
  paritet (catalogParity)
- [ ] `npx jest` + `npx tsc --noEmit` i `native/app/` grønne
- [ ] `npm run test:rls` med faktisk pgTAP-output (eller GAP + staging-probe)
- [ ] `humanizer:humanizer` kjørt på de fire nye/endrede norske strengene
- [ ] Migrasjon `0173` påført staging via MCP og verifisert FØR PR åpnes

## Files Likely Touched

- `supabase/migrations/0173_anonymize_user_withdraws_from_open_play.sql` (ny) — RPC-kropp
  0142 + frafallssteg 1–5, ny funksjonskommentar
- `supabase/tests/users_anonymize_test.sql` (utvid) eller ny pgTAP-fil — kriterium 2
- `lib/users/deleteAccount.ts` + `deleteAccount.test.ts` — fjern deltaker-grenen, ny
  JSDoc som beskriver «eneste arrangør»-regelen og frafallet
- `messages/no.json` + `messages/en.json` — `blockedBanner`, `errors.active_games`,
  `bullet4`, `target_active` ×2
- `app/[locale]/profile/slett-konto/page.tsx` — rendre `bullet4`
- `native/app/src/lib/accountCopy.ts` + `accountCopy.test.ts` (+ evt.
  `DeleteAccount.test.tsx` hvis den teller kulepunkter) — ny ordlyd + fjerde kulepunkt
- `scripts/provision-review-account.mjs` — arrangør = admin, oppslag på navn,
  re-parenting, tombstone-rydding, oppsummering
- `docs/native/app-store-review-konto.md`, `docs/native/app-spike.md`,
  `docs/user-flows.md` — runbook/dokumentasjon
- `.changes/1909-slett-konto-frafall.md` — ukesslipp-notat

## Out of Scope

- **Vei 1**: overføring av arrangørskap / auto-avslutning ved sletting (senere forbedring).
- **Eneste klubbeier som sletter seg → eierløs klubb** (0110-vakta slipper service-role):
  eget issue, filet av denne økta.
- Varsel til arrangør/kaptein når en spiller forsvinner ved sletting (webbens
  `team_member_withdrew` gjelder kun selv-frafall pre-start).
- Walkover-/matchplay-semantikk for trukne spillere; leaderboard-visning av trukne i
  modi uten WD-støtte (dagens «ikke levert»-fallback står).
- Å relaksere sperren for klubbadmin-avsluttbare cuper/ligaer (ASSUMPTION over).
- Rename av wire-koden `active_engagements`; endringer i `route.ts`; admin-slettsidens
  copy utover `target_active`.
- App-copy for admin-flyten (finnes ikke i appen).

---

**Til byggeren:** egen worktree, ALDRI en annen økts. Kopiér RPC-kroppen fra
`pg_get_functiondef` i staging (ikke fra 0142-fila). Migrasjonen til staging via MCP
FØR første kodelinje i TS-regelen, så kriterium 3 kan kjøres ekte. PR-en presenterer
ingen produktvalg (eieren har valgt vei 2), men **merges aldri automatisk**: destruktiv
flyt + prod-migrasjon + prod-re-seed er eier-steg. Skriv prod-status ærlig i PR-body.
