# Spec: `groups` + `group_members` — grunnmur for klubb-skala (#49)

## Problem
Tørny er i dag **single-tenant**: `users.is_admin` er det eneste rollebegrepet, eierskap finnes
bare som `created_by` på spill/baner, og det finnes ingen gruppe-/klubb-inndeling noe sted i
skjemaet. For å skalere fra én kompisgjeng til flere uavhengige golfklubber/kompisgjenger
(milestone «Klubb-skala (epic)») trenger vi et medlemskaps-fundament. #49 er **første** sak i den
epicen — rekkefølge: **#49 groups-tabell → #50 admin per gruppe → #369 venner/åpen-for-venner →
#392 Klubbhuset**. Denne saken legger kun de to nye tabellene og melder alle dagens brukere inn i
én startgruppe. Den er bevisst usynlig: ingen UI, ingen endring i eksisterende spill/baner/RLS.

## Prior Decisions (fra eksisterende kontrakter + repo-mønster)
- **SECURITY DEFINER-helpere for å bryte RLS-rekursjon** (`0003`/`0002`): en SELECT-policy som
  spør samme tabell den sitter på, må delegere til en `security definer`-funksjon. `group_members`
  SELECT må bruke samme triks som `is_in_game()`.
- **Nyeste helper-stil** (`0071` `incomplete_profiles_for_ids`): `language sql security definer
  stable set search_path = ''` + fullt skjema-kvalifiserte refs (`public.…`) + `revoke all … from
  public; revoke execute … from anon; grant execute … to authenticated`. Speiles eksakt.
- **Additive + permissive RLS er trygt å applye før kode-deploy** (`0071`-headeren): nye tabeller
  som ingen kode leser kan applyes til prod uten å røre eksisterende flyt.
- **Schema-foundation = `chore(db):`-commit** (repo-presedens 0070/0071/0072) → ingen
  versjons-bump / CHANGELOG (ingen bruker-synlig endring; commit-msg-hooken slår kun på
  `feat/fix/perf`).
- **#198/#230 trusted-creators** er en kode-allowlist, IKKE en DB-rolle — group-rollene her er et
  separat, ekte DB-rollebegrep og rører ikke trusted-creator-mekanikken.

## Design

To nye tabeller + ett enum + to SECURITY DEFINER-helpere + RLS + backfill. **Migrasjon 0074**
(nyeste applyte er 0073 `block_withdrawn_score_writes`). Mønsteret følger `0071` 1:1.

### Skjema
```sql
create type public.group_role as enum ('owner', 'admin', 'member');

create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.users(id) on delete set null,  -- jf. 0070-mønster
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id)  on delete cascade,
  user_id   uuid not null references public.users(id)   on delete cascade,
  role      public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)               -- ingen dublett-medlemskap
);
create index group_members_user_id_idx on public.group_members(user_id);  -- «mine grupper»-oppslag (#392)
```

- **Mange-til-mange (eierens valg «flere grupper»):** PK er `(group_id, user_id)`. Ingen unik
  constraint på `user_id` alene → samme person kan stå i flere grupper. En gruppe-velger i UI er en
  #392-sak, ikke #49.
- **`role` nå (anticiperer #50):** kolonnen legges allerede her fordi #50 «admin per gruppe» trenger
  den; additivt og gratis å ta nå. #49 bruker den kun i backfill (gruppe-skaper = `owner`).
- **Ingen `group_id` på `games`/`courses`** (eierens valg «bare fundamentet nå»): eksisterende
  tabeller og deres RLS røres ikke i det hele tatt. Å knytte spill/baner til grupper er #50.

### SECURITY DEFINER-helpere (speiler 0071-stil)
```sql
create or replace function public.is_group_member(p_group_id uuid) returns boolean
  language sql security definer stable set search_path = ''
  as $$ select exists(
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  ); $$;

create or replace function public.is_group_admin(p_group_id uuid) returns boolean
  language sql security definer stable set search_path = ''
  as $$ select exists(
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
      and role in ('owner', 'admin')
  ); $$;
-- begge: revoke all from public; revoke execute from anon; grant execute to authenticated
```
`security definer` bypasser RLS → bryter rekursjonen på `group_members` SELECT (samme grunn som
`is_in_game()`).

### RLS (alle policyer `to authenticated`, permissive)
| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `groups` | `is_admin() OR is_group_member(id)` | `is_admin() OR created_by = auth.uid()` | `is_admin() OR is_group_admin(id)` | `is_admin() OR is_group_admin(id)` |
| `group_members` | `is_admin() OR is_group_member(group_id)` | `is_admin() OR is_group_admin(group_id)` | `is_admin() OR is_group_admin(group_id)` | `is_admin() OR is_group_admin(group_id) OR user_id = auth.uid()` |

- Medlemmer ser sin egen gruppe + medmedlemmer; global admin (Jørgen) ser alt.
- Gruppe-admin/owner (eller global admin) forvalter medlemmer; et medlem kan melde seg selv UT
  (`user_id = auth.uid()` på DELETE).
- **Kjent #50-oppgave (flagges, bygges ikke her):** «vanlig bruker oppretter ny gruppe og blir owner»
  har et bootstrap-problem — ved første medlem finnes ingen owner-rad, så `is_group_admin()` er
  usann. Det løses med en SECURITY DEFINER-RPC / trigger når gruppe-opprettelse får UI i #50. I #49
  er de eneste skaper-veiene backfill-migrasjonen (kjører som migrasjons-rolle, bypasser RLS) og
  global admin.

### Backfill (i samme migrasjon, idempotent-trygt fordi tabellene er nye)
```sql
do $$
declare v_admin uuid; v_group uuid;
begin
  select id into v_admin from public.users where is_admin order by created_at limit 1;
  insert into public.groups (name, created_by) values ('Tørny', v_admin) returning id into v_group;
  insert into public.group_members (group_id, user_id, role)
  select v_group, u.id,
         case when u.id = v_admin then 'owner'::public.group_role else 'member'::public.group_role end
  from public.users u;
end $$;
```
Prod-state (verifisert): 13 brukere, 1 admin → forventet 1 gruppe, 13 medlemmer, 1 owner.
**Startgruppens navn = `'Tørny'`** (default; trivielt å døpe om i #50 når gruppe-admin får UI —
nevnes i closing-kommentaren slik at Jørgen kan be om annet navn).

### Typer
Etter at migrasjonen er applyt: regenerer/oppdater `lib/database.types.ts` med `groups`,
`group_members` (Row/Insert/Update) og `group_role`-enum. `npm run build` må kompilere.

## Edge Cases & Guardrails
- **Ingen admin i DB** (kun test/edge): `v_admin` blir NULL → `created_by` NULL, alle blir `member`,
  ingen owner. Gruppe + medlemmer opprettes likevel. (Prod har Jørgen → han blir owner.)
- **RLS-rekursjon:** unngås kun fordi SELECT-policyene delegerer til `security definer`-helpere.
  Aldri inline `select … from group_members` i en `group_members`-policy.
- **Ingen regresjon på eksisterende flyt:** ingen eksisterende tabell, policy, helper eller kode
  endres. Eksisterende RLS-policyer (games/courses/scores/…) står urørt.
- **`anon`-lekkasje:** Supabase gir default EXECUTE til `anon` på nye funksjoner → må revoke-es
  (jf. 0071), ellers kan uinnlogget probe medlemskap.
- **Prod-applisering:** migrasjonen er additiv + ingen kode leser tabellene → trygg å applye til
  prod via MCP `apply_migration` før PR-merge (jf. 0071-headeren). Verifiseres med SQL etterpå.

## Key Decisions
- **Mange-til-mange medlemskap** (eier): PK `(group_id, user_id)`, ingen unik på `user_id`.
- **Bare fundamentet** (eier): kun `groups` + `group_members`; ingen `group_id` på games/courses,
  ingen omskriving av eksisterende RLS, ingen UI.
- **`role`-kolonne tas nå** — additivt, #50 trenger den; #49 bruker den kun til owner-backfill.
- **`chore(db):`-commit, ingen versjons-bump/CHANGELOG** — usynlig foundation.
- **Applyes til prod via MCP** — additiv + ureferert, innenfor «test kun i prod»-arbeidsavtalen.

**Claude's Discretion:**
- Eksakt policy-navngiving (følger repo-stil `"groups select member or admin"` e.l.).
- Om types regenereres helt via MCP vs. håndredigeres inn i `lib/database.types.ts` — velg det som
  gir minst urelatert diff; `npm run build` er fasiten.
- Plassering av `revoke/grant` (samlet nederst vs. ved hver funksjon) — speil 0071.

## Success Criteria
- [x] **C1 — Tabeller + enum finnes:** `groups` (id, name, created_by, created_at) og
  `group_members` (group_id, user_id, role, joined_at; PK `(group_id,user_id)`) eksisterer med RLS
  enabled; enum `group_role` = {owner,admin,member}. *Verifiser:* MCP `execute_sql` mot
  `information_schema` + `pg_policies.rowsecurity`.
  → **Bevis (SQL):** `C1_tables_rls` = begge `rls:true`; `C1_enum_values` = `["owner","admin","member"]`;
  `C1_columns` = alle 8 kolonner med riktige typer (`group_members.role` = USER-DEFINED enum).
- [x] **C2 — Helpere + policyer finnes:** `is_group_member(uuid)` og `is_group_admin(uuid)` er
  `security definer`, EXECUTE revoked fra `anon`/`public`, granted til `authenticated`; 4 policyer
  per tabell (select/insert/update/delete). *Verifiser:* `pg_proc` + `pg_policies`-query.
  → **Bevis (SQL):** `C2_helpers_secdef` = begge `true`; `C2_anon_can_execute_any` = `false`;
  `C2_authenticated_can_execute_all` = `true`; `C2_policy_count_per_table` = `{groups:4, group_members:4}`.
- [x] **C3 — Mange-til-mange mulig:** ingen unik/PK-constraint på `group_members.user_id` alene
  (kun samlet PK). *Verifiser:* `pg_constraint`/`pg_indexes`-query viser ingen `user_id`-unik.
  → **Bevis (SQL):** `C3_user_id_alone_unique` = `0`.
- [x] **C4 — Backfill korrekt:** nøyaktig 1 gruppe; `count(group_members) == count(users)` (13);
  nøyaktig 1 rad med `role='owner'` og den = den admin-brukeren. *Verifiser:* aggregat-SQL.
  → **Bevis (SQL):** `group_count:1`, `member_count:13`, `user_count:13`, `members_eq_users:true`,
  `owner_count:1`, `owner_is_admin:true`, `group_name:"Tørny"`.
- [x] **C5 — Typer kompilerer:** `lib/database.types.ts` inneholder `groups`, `group_members`,
  `group_role`; bygg/typecheck passerer. *Verifiser:* tsc-output + grep i fila.
  → **Bevis:** `npx tsc --noEmit` = `TSC_OK`; fila har `group_members:`/`groups:`-blokker (+67 linjer)
  og `group_role` i begge enum-blokkene (type + Constants).
- [x] **C6 — Ingen regresjon:** eksisterende tabeller/RLS urørt, full test-suite grønn.
  *Verifiser:* `git diff` rører ingen eksisterende `.sql`; `npx vitest run` grønn.
  → **Bevis:** `git status` viser kun `lib/database.types.ts` endret (+ ny `0074_*.sql`); ingen
  eksisterende `.sql` rørt. `npx vitest run` = **219 filer / 2662 tester passed**.

## Gates
- [ ] `npm run build` passerer (tsc + Next — fanger types-brudd / exhaustive-switch, jf. tsc-gate-fella).
- [ ] `npx vitest run` grønn (ingen TS-logikk endret, men `database.types.ts`-endring må ikke knekke type-avhengige tester).
- [ ] MCP `execute_sql`-verifikasjon (C1–C4) — det reelle gate-et for schema/RLS/backfill.
- [ ] Commit passerer `.githooks/commit-msg` uten `--no-verify` (riktig `chore(db):`-prefiks).
- *(Ingen Playwright — ingen frontend-UI røres. Ingen nye unit-tester — en ren skjema-migrasjon har ingen pure-logikk å TDD-e, jf. test-disiplin.)*

## Files Likely Touched
- `supabase/migrations/0074_groups_and_group_members.sql` — **ny**: enum, 2 tabeller, index, 2
  SECURITY DEFINER-helpere, RLS-policyer, backfill.
- `lib/database.types.ts` — legg til `groups`, `group_members`, `group_role`.
- *(Ingen app-/UI-/lib-logikk-filer — #49 er ren foundation.)*

## Out of Scope (→ senere saker i epicen)
- `group_id`-FK på `games`/`courses` + omskriving av deres RLS til å filtrere på gruppe → **#50**.
- UI: gruppe-velger, gruppe-admin, medlemsliste, opprett-gruppe-flyt, owner-bootstrap-RPC → **#50/#392**.
- Venner / «åpen for venner» / klubb-påmelding → **#369**.
- Klubbhuset universell nav-fane → **#392**.
- Å døpe om startgruppen fra `'Tørny'` til klubbens virkelige navn (gjøres når #50 gir rename-UI).
- Migrere `is_admin`/trusted-creator til gruppe-roller — eget framtidig spor, ikke rør nå.
