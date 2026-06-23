# Spec: RLS-håndhev invite-eligibility på game_players (defense-in-depth for #906)

**Issue:** [#921](https://github.com/jdlarssen/golf-app/issues/921)
**Berører:** `supabase/migrations/0115_*` (ny) + `e2e/games/adversarial-role-replay.spec.ts` (+ helpers). Ingen app-kode-endring.
**Bump:** PATCH — `fix(rls)` + CHANGELOG, samme presedens som 0103 (#670) / 0107. Ingen bruker-synlig adferd, men repo-konvensjonen behandler RLS-hardning som en `fix` med patch-bump + en «Sikkerhet / under panseret»-CHANGELOG-linje.

## Problem

#906 lukket venne-/klubb-scoping for «Inviter spillere» på **action-laget** (`inviteToGameActions.ts` → `getInviteEligibleIds`): en ikke-admin oppretter kan ikke lenger legge en vilkårlig registrert bruker til sitt eget spill via server-actionen. Men det er en TS-guard. Et **direkte PostgREST-INSERT mot `game_players`** med en gyldig spiller-JWT omgår den helt (AGENTS.md felle #3: «RLS is the real authz layer»).

Live-policyene bekrefter hullet: INSERT på `game_players` tillates av to permissive policyer — `game_players creator insert` (`with check: exists games where created_by = auth.uid()`) og `game_players self register open` (`is_admin() OR (user_id = auth.uid() AND open+draft/scheduled)`). Creator-policyen håndhever **ikke** at `user_id` er kvalifisert (venn / co-player / klubbmedlem). En ikke-admin oppretter kan derfor INSERT-e en hvilken som helst `user_id` i sitt eget spill via rå REST.

Eier-beslutning på #906 (2026-06-23): action nå, RLS som dette oppfølgings-issuet. Severity er lav-moderat (uoppfordret add er pre-start + reverserbar, ingen rettighets-eskalering) — derfor egen PR.

## Research Findings

Verifisert mot live staging-skjema (`pg_policy` på `public.game_players`) + koden:

- **Live INSERT-policyer (polcmd `a`):** `creator insert` (created_by = auth.uid(), ingen eligibility) + `self register open` (is_admin() ∨ self på åpent draft/scheduled-spill). Eneste ikke-self, ikke-admin INSERT-sti er creator-policyen → det er nøyaktig den triggeren skal stramme.
- **Roster-inserts bruker BRUKER-klienten** (authenticated, `getServerClient`), ikke admin-klienten: ny-spill (`app/[locale]/admin/games/new/actions.ts:239`) og cup-generering (`app/[locale]/admin/cup/[id]/generer/actions.ts:253`). En BEFORE INSERT-trigger **vil** fyre på disse. Konsekvens analysert under «Edge Cases».
- **Klubb-cup** setter `group_id` på match-spillene (`generer/actions.ts:224`) og validerer `allInClub` (kun klubbmedlemmer) — medlemmer er derfor kvalifiserte via klubb-grenen. **Personlig cup** har `group_id = NULL`; spillere er picker-scopet til venner/co-players.
- **`isAdmin` = `users.is_admin === true`** (`lib/admin/auth.ts`). Trusted-creators er IKKE admin → underlagt scoping, konsistent med action-laget.
- **Trigger-presedens:** `guard_game_players_*`-familien (0103/0107/0108) er etablert idiom for betinget, `is_admin()`/service-rolle-bevisst guard på akkurat denne tabellen. 0103 er nær-identisk mal: SECURITY DEFINER plpgsql, `set search_path = ''`, no-op for `auth.uid() IS NULL` (service) + `is_admin()`, full schema-kvalifisering.
- **`getInviteEligibleIds` (#906)** er per dok «unionen av alt de legitime invite-UI-ene tilbyr» — superset av enhver scopet picker. SQL-funksjonen speiler dette nøyaktig (felle #4), så triggeren aldri falsk-avviser en legitimt bygget roster.

## Prior Decisions

- **#906 (`inviteEligibility.ts`):** eligible = venne-connections (accepted ∪ pending, begge retninger) ∪ co-players (delt minst ett spill) ∪ klubbmedlemmer (når `group_id` satt). Self + global admin alltid lov, gatet på call-siten (`!ctx.isAdmin && recipient !== inviter`). SQL-funksjonen MÅ gi identisk svar (felle #4).
- **#670 (0103):** betinget self-mutasjons-guard ble en BEFORE-trigger, ikke kolonne-GRANT/RLS, fordi betingelsen avhenger av hvem som skriver. Samme resonnement her → trigger, ikke restrictive policy.
- **#422 / kurator-modellen:** global admin er bevisst u-guardet (Sekretariatet avklarer deltakelse på forhånd). Speiles via `is_admin()`-escape i triggeren.

## Design

To DB-objekter i `0115_game_players_invite_eligibility_rls.sql`. Ingen app-kode endres.

### 1. `is_invite_eligible(p_creator uuid, p_recipient uuid, p_group_id uuid) returns boolean`

SECURITY DEFINER, STABLE, `set search_path = ''`, full schema-kvalifisering. Speiler `getInviteEligibleIds(creator, group).has(recipient)` 1:1 — returnerer **ren eligibility** (uten self/admin; de håndteres i triggeren, akkurat som call-siten splitter resolver vs gate):

```sql
select
  -- venne-connections: accepted ELLER pending, begge retninger (ingen status-filter,
  -- speiler connectedIdsFromRows i lib/friends/friendGraph.ts)
  exists (
    select 1 from public.friendships f
    where (f.requester_id = p_creator and f.addressee_id = p_recipient)
       or (f.addressee_id = p_creator and f.requester_id = p_recipient)
  )
  -- co-players: delt minst ett spill (speiler getCoPlayerIds; INGEN withdrawn-filter)
  or exists (
    select 1 from public.game_players me
    join public.game_players them on me.game_id = them.game_id
    where me.user_id = p_creator and them.user_id = p_recipient
  )
  -- klubbmedlemmer: kun når group_id satt; ALLE medlemmer av spillets group
  -- (getGroupMemberIds krever ikke at creator selv er medlem — speiles eksakt)
  or (
    p_group_id is not null
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id and gm.user_id = p_recipient
    )
  );
```

ACL: `revoke all from public; revoke execute from anon; grant execute to authenticated` (mønster fra 0104/0071).

### 2. `guard_game_players_invite_eligibility()` BEFORE INSERT-trigger

SECURITY DEFINER plpgsql, `set search_path = ''`. Speiler call-site-gaten (`inviteToGameActions.ts:60`) eksakt:

```
v_uid := auth.uid();
-- Escapes (rekkefølge = call-siten): service-rolle + global admin + self
if v_uid is null then return new; end if;             -- service-klient (startScheduled, ...)
if public.is_admin() then return new; end if;         -- kurator-modellen (#422)
if new.user_id = v_uid then return new; end if;       -- self alltid lov (self register / creator self-add)

-- Her: en ikke-admin innlogget bruker legger til en ANNEN bruker. RLS garanterer
-- allerede at den eneste ikke-self/ikke-admin INSERT-stien er creator-policyen
-- (created_by = v_uid), så v_uid ER oppretteren. Hent spillets group_id.
select g.group_id into v_group_id from public.games g where g.id = new.game_id;

if not public.is_invite_eligible(v_uid, new.user_id, v_group_id) then
  raise exception
    'Recipient % is not invite-eligible for creator % (friends/co-players/club)', new.user_id, v_uid
    using errcode = 'insufficient_privilege';  -- SQLSTATE 42501, jf. 0103
end if;
return new;
```

`drop trigger if exists ... ; create trigger ... before insert on public.game_players for each row execute function ...` (idempotent re-apply, jf. 0103).

**Felle #4 (lag enige):** SQL-funksjonen og `getInviteEligibleIds` deler kildetabellene og samme tre grener. Beviset for at de er enige leveres av e2e-en under (ikke en separat parallell-implementasjon): én kvalifisert (venn) → INSERT lykkes, én ukvalifisert (fremmed) → INSERT avvises, mot ekte staging-data. Dette er den «delte test som asserter at lagene gir samme svar» issuet ber om, plassert på laget som faktisk betyr noe (DB).

## Edge Cases & Guardrails

- **Service-rolle (admin-klient):** `auth.uid()` er NULL → no-op. Dekker `startScheduledGame` + alle service-role-inserts.
- **Global admin:** `is_admin()` → no-op (kurator-modellen).
- **Self / self-register-open:** `new.user_id = auth.uid()` → no-op. Dekker `game_players self register open`-policyen + creator-som-legger-til-seg-selv.
- **Ny-spill-veiviser (ikke-admin creator, bruker-klient):** roster er picker-scopet til venner/klubb ⊆ eligible-set → alle passerer. **MÅ verifiseres:** kjør eksisterende creation-e2e mot staging med trigger på.
- **Klubb-cup:** `group_id` satt + `allInClub`-validert → medlemmer kvalifisert via klubb-grenen → passerer. **MÅ verifiseres:** cup-smoke-e2e grønn.
- **Personlig cup (`group_id` NULL):** spillere må være venner/co-players (picker-scope). Hvis legitim → passerer; manipulert payload med fremmed → triggeren avviser (ønsket defense-in-depth). **MÅ verifiseres:** personlig-cup-generering fungerer fortsatt på staging.
- **Liga:** sjekk om liga-generering bulk-inserter `game_players` via bruker-klient med ikke-eligible spillere. Forventning: liga er sesong-standings, ikke roster-bulk-insert — men verifiser at lifecycle-/liga-e2e er grønn.
- **E-post-gren, ukjent e-post:** inserter i `invitations`, IKKE `game_players` → triggeren rører den ikke (bevisst u-guardet, venne-anskaffelse). E-post-gren med eksisterende bruker inserter i `game_players` → dekkes automatisk av triggeren.
- **Bulk-insert-ytelse:** triggeren kjører `is_invite_eligible` per rad kun for ikke-admin-creator-stien. Admin (klubb-skala) short-circuiter på `is_admin()`. Kompis-skala roster er små (≤16). Akseptabelt; ingen indeks-endring nødvendig.
- **Parity-felle:** INGEN withdrawn-filter i co-player-grenen, INGEN status-filter i venne-grenen — fordi `getCoPlayerIds`/`connectedIdsFromRows` heller ikke filtrerer. Avvik her ville bryte felle #4.

## Key Decisions

- **BEFORE INSERT-trigger, ikke RESTRICTIVE policy** — betingelsen avhenger av hvem som skriver (creator vs self vs admin vs service) og krever spillets `group_id`; en trigger leser det én gang og brancher rent. Speiler `guard_game_players_*`-familien (0103/0107/0108). En restrictive policy ville gjelde ALLE INSERT-stier og kreve inline-subqueries — mer skjør.
- **SQL-funksjon returnerer ren eligibility (uten self/admin)** — speiler `getInviteEligibleIds` sin set-semantikk; self/admin gates i triggeren, akkurat som call-siten splitter resolver vs gate. Holder felle #4 trivielt sann.
- **Felle-#4-bevis via e2e (eligible-lykkes + ineligible-avvises), ikke RPC-refaktor av `getInviteEligibleIds`** — å la TS-resolveren kalle SQL-funksjonen ville endre retur-shape (set vs boolean), legge en round-trip på #906-hot-stien, og refaktorere en nettopp-shippet path (høyere risiko). Behold begge; bevis enighet på DB-laget.
- **`fix(rls)` + patch-bump + CHANGELOG** — presedens 0103 (#670). CHANGELOG-linjen formuleres som under-panseret/sikkerhet (ingen synlig UX).

**Claude's Discretion:**
- Eksakt e2e-seeding (gjenbruk `seedActiveStablefordGame`/helpers i `e2e/_helpers/games.ts`; legg til en draft-spill-seed + en friendships-rad + en fremmed-bruker etter behov).
- Nøyaktig CHANGELOG-ordlyd + hvor i åpen `## 1.X.y`-serie patchen nestes.
- Om liga trenger eksplisitt verifisering utover lifecycle-@gate (avgjøres når liga-gen-stien er sjekket).

## Success Criteria

- [x] `0115_*.sql` lager `is_invite_eligible(uuid,uuid,uuid)` — SECURITY DEFINER, STABLE, `set search_path = ''`, EXECUTE kun til `authenticated` (anon revoked). **Evidens:** `pg_proc`-probe staging+prod: `prosecdef=true`, `provolatile='s'`, `config=[search_path=""]`, `fn_grantees=[authenticated, postgres, service_role]` (anon revoked).
- [x] SQL-funksjonen speiler `getInviteEligibleIds`: venne-connections (pending∪accepted, begge retninger) ∪ co-players (delt spill) ∪ klubbmedlemmer (når group_id satt). **Evidens:** SQL lest gren-for-gren mot `inviteEligibility.ts`/`friendGraph.ts`/`getCoPlayerIds.ts`; live spot-check prod: `coplayer`→true, `friend`→true.
- [x] BEFORE INSERT-trigger på `game_players` no-op-er for service-rolle (`auth.uid()` NULL), admin (`is_admin()`) og self (`new.user_id = auth.uid()`). **Evidens:** trigger-kropp (escapes-rekkefølge speiler 0103); MCP service-role-probe no-op-er (auth.uid() NULL); `tgtype=7` = BEFORE INSERT ROW på staging+prod.
- [x] Rå PostgREST-INSERT i `game_players` som ikke-admin oppretter, av en **ukvalifisert** `user_id` i eget draft-spill, avvises (error / 0 rader) på staging. **Evidens:** `adversarial-role-replay.spec.ts` Role D «ineligible stranger… rejected by the trigger» ✓ (5.1s).
- [x] Samme rå INSERT av en **kvalifisert** (seedet venn) `user_id` LYKKES (ingen falsk-avvisning; lag enige, felle #4). **Evidens:** Role D «eligible friend… succeeds (no false-block)» ✓ — samme creator/spill/shape, kun eligibility skiller.
- [x] Legitime flyter upåvirket: eksisterende creation- + cup-smoke- + lifecycle-`@gate`-e2e grønne mot staging med trigger påført. **Evidens:** 13/13 ikke-mail `@gate` grønne (scoring golden path, cup/liga smoke, signup open/manual/withdraw). Den ene feilen er lokal `RESEND_API_KEY is not set` i mail-stien (`/admin/spillere`, admin-aktør, ingen game_players-insert) — miljø, ikke #921.
- [x] Migrasjon påført staging (verifisert) FØR prod (0107-mønsteret). **Evidens:** staging-apply `{success:true}` + probe, så prod-apply `{success:true}` + struktur-/funksjons-probe. Begge verifisert.

## Gates

- [ ] `npm run build` (tsc, exhaustive-switch-fellen) passerer — for e2e/test-TS-endringer.
- [ ] Co-lokaliserte vitest for evt. endrede `.ts`/helpers passerer.
- [ ] e2e `@gate`-delsett mot staging (creation/cup/lifecycle + ny adversarial-test) grønt. Node 22 + `.env.staging.local` lastet (`set -a; . ./.env.staging.local`) ellers SKIPPER e2e stille.
- [ ] `.githooks/commit-msg`: `Refs #921` i body, `fix(rls)` + patch-bump + CHANGELOG.
- [ ] Apply staging via Supabase MCP `apply_migration` (ref `snwmueecmfqqdurxedxv`), verifiser, så prod (ref `glofubopddkjhymcbaph`).

## Files Likely Touched

- `supabase/migrations/0115_game_players_invite_eligibility_rls.sql` — NY: `is_invite_eligible()` + `guard_game_players_invite_eligibility()` + BEFORE INSERT-trigger.
- `e2e/games/adversarial-role-replay.spec.ts` — Role D: ikke-admin creator hostile-INSERT (ineligible avvist + eligible lykkes).
- `e2e/_helpers/games.ts` — evt. seed-helpers (draft-spill, friendship, fremmed bruker).
- `CHANGELOG.md` + `package.json` (+ `package-lock.json`) — patch-bump.

## Out of Scope

- RESTRICTIVE RLS-policy-alternativet (trigger valgt).
- RPC-refaktor av `getInviteEligibleIds` (behold begge; e2e beviser enighet).
- Ukjent-e-post `invitations`-grenen (bevisst u-guardet venne-anskaffelse; ikke `game_players`).
- All UX-/copy-endring (ingen — ren backstop, action-laget eier meldingen `invite_not_allowed`).
- Bredere liga-roster-omskriving (kun verifiser at eksisterende liga-flyt er grønn).
