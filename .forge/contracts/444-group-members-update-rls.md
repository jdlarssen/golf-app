# Contract: Stram inn group_members UPDATE-RLS — eier-only rolle-endring

**Issue:** [#444](https://github.com/jdlarssen/golf-app/issues/444)
**Parent prior art:** [#49](https://github.com/jdlarssen/golf-app/issues/49) (0074 groups/group_members RLS), [#50](https://github.com/jdlarssen/golf-app/issues/50) (0076 `set_club_member_role`), [#369](https://github.com/jdlarssen/golf-app/issues/369) (0077 friendships — SELECT-only RLS + secdef-RPC-mutasjon-mønsteret)
**Milestone:** Klubb-skala (epic)
**Branch:** `claude/stoic-haslett-35d5e7`
**Funnet i:** `.forge/evaluations/50-klubb-delegering-eierskap.md` (observasjon #5)

## Diagnose (verifisert via Supabase MCP, read-only SQL mot prod `glofubopddkjhymcbaph`)

| Spørsmål | Funn | Konklusjon |
|---|---|---|
| Live UPDATE-policy på `group_members` | `group_members update group admin`: USING+CHECK `(is_admin() OR is_group_admin(group_id))` | `is_group_admin` er sann for **owner OG admin** → en klubb-**admin** kan PATCHe `role='owner'` på seg selv via direkte PostgREST og omgå RPC-ens eier-only-guard. **Hullet bekreftet.** |
| Direkte `.update()` på `group_members` i app/lib | `grep` → kun `.select()` og `.delete()`, aldri `.update()` | All rolle-endring går gjennom `set_club_member_role`-RPC. Ingen app-vei trenger request-scoped UPDATE. |
| `set_club_member_role` eier + secdef | `prosecdef=true`, owner=`postgres`, `rolbypassrls=true` | RPC bypasser RLS **ubetinget** → fortsetter å virke selv om UPDATE-policyen fjernes helt. |
| `group_members` FORCE RLS | `relforcerowsecurity=false`, owner=`postgres` | Tabell-eier (postgres) er ikke RLS-bundet → secdef-RPC trygg uansett. |
| Presedens i 0077 (friendships) | «Ingen INSERT/UPDATE/DELETE-policy — alle mutasjoner går via security definer-RPCene (speil klubb-governance)» | Mønsteret «SELECT-only RLS + secdef-RPC for mutasjon» er allerede live på samme prod-instans. |

## Beslutning — Option B: DROPP UPDATE-policyen helt (ikke smal owner-policy)

Issuet foreslo to alternativer: (A) `is_group_owner`-helper + smal policy `is_admin() OR is_group_owner(group_id)`, eller (B) fjern UPDATE-policyen helt. **Valgt B.** Pure-RLS-teknisk valg (ingen bruker-synlig oppførsel); tatt selv per CLAUDE.md «No technical decisions to user».

Hvorfor B over A:
1. **Lukker to hull, ikke bare ett.** Option A ville fortsatt latt en **eier** PATCHe rolle direkte og omgå RPC-ens **sist-eier-guard** (degradere seg selv til medlem → klubb uten eier). B tvinger *all* rolle-endring gjennom `set_club_member_role`, som håndhever både eier-only OG sist-eier-guarden.
2. **Følger etablert presedens.** 0077 (friendships) gjør nøyaktig dette: SELECT-only RLS, alle mutasjoner via secdef-RPC. `group_members` sin eneste muterte kolonne (`role`) bør følge samme disiplin.
3. **Ikke-brytende.** Ingen app-vei gjør direkte UPDATE (verifisert). INSERT (legg til medlem), DELETE (fjern/forlat) og SELECT (se medlemmer) er urørt.
4. **Mindre overflate.** Ingen ny helper-funksjon å vedlikeholde; én færre policy.

## Mål

`group_members.role` kan kun endres via `set_club_member_role`-RPC (eier-only + sist-eier-guard). En innlogget klubb-admin (ikke eier) som sender en direkte `PATCH /group_members` blir avvist av RLS. Ingen legitim app-flyt (legg til / fjern / forlat / se medlemmer / rolle-delegering via RPC) påvirkes.

## Tekniske beslutninger

1. Ny migrasjon `0078_group_members_tighten_update_rls.sql`: `drop policy if exists "group_members update group admin" on public.group_members;` + forklarende header som dokumenterer hvorfor det bevisst IKKE finnes en UPDATE-policy (så ingen re-introduserer en bred en).
2. Legg `comment on table public.group_members` som fester invarianten: rolle-endring kun via `set_club_member_role`.
3. Ingen ny helper-funksjon (`is_group_owner` droppet — unødvendig under Option B).
4. Ingen kode-endring i app/lib (all rolle-mutasjon går allerede via RPC). Ingen `database.types.ts`-regen (policies er ikke i genererte typer).
5. Ingen bruker-synlig oppførsel → `chore(db)`-prefiks, ingen version-bump / CHANGELOG (matcher presedens 0070–0072 `chore(db)`).
6. Migrasjonen applyes til prod via Supabase MCP (per `reference_supabase_mcp` — ren policy-drop uten kode-avhengighet, trygg å applye når som helst).
7. Ingen flyt-/doc-endring: `docs/user-flows.md:60-62` beskriver allerede delegering som eier-only via `set_club_member_role`. Fiksen *håndhever* det doc-en allerede lover → ingenting å oppdatere (verifisert).

## Filer som endres

| Fil | Status | Hva |
|---|---|---|
| `supabase/migrations/0078_group_members_tighten_update_rls.sql` | NY | drop UPDATE-policy + table-comment + header |

## Suksess-kriterier (én checkbox per kriterium, med bevis)

- [x] **K1:** Migrasjon `0078` finnes på disk med `drop policy if exists "group_members update group admin"` + forklarende header + `comment on table`. Bevis: `supabase/migrations/0078_group_members_tighten_update_rls.sql` (commit `9561f53`).
- [x] **K2:** Migrasjon applyet til prod. Bevis: `list_migrations` → siste rad `20260606051731 group_members_tighten_update_rls`; `pg_policy`-spørring på `group_members` returnerer **ingen** rad med `polcmd='w'` (UPDATE) — kun `a`/`d`/`r`.
- [x] **K3:** INSERT/DELETE/SELECT-policyene urørt. Bevis: `pg_policy` viser `group_members insert group admin` (a, `is_admin() OR is_group_admin(group_id)`), `group_members delete admin or self` (d, `... OR user_id = auth.uid()`), `group_members select member or admin` (r, `is_admin() OR is_group_member(group_id)`) — uendret fra før-tilstanden.
- [x] **K4:** Adversarielt — klubb-admin (ikke eier) direkte `UPDATE ... role='owner'` avvises. Bevis (BEGIN…ROLLBACK): Tørny-medlem `1f016c6a` midlertidig satt til `admin`, `set local role authenticated` + jwt.sub = medlemmet → `update ... role='owner'` → `role_after_direct_patch='admin'` (uendret, RLS avviste). Kontroll (K4b): samme angriper har `is_group_admin=true`, `is_admin=false` → ville passert den GAMLE policyen, men avvises nå fordi policyen er borte. Bonus: samme angriper via RPC → `rejected: not_authorized` (eneste gjenværende vei avviser òg).
- [x] **K5:** RPC virker fortsatt. Bevis (BEGIN…ROLLBACK): jwt.sub = eier `069cda6e`, `set_club_member_role('32806a13…','1f016c6a…','admin')` → `rpc_result='admin'`, rollback (ikke persistert).
- [x] **K6:** Ingen app-regresjon. Bevis: `npx tsc --noEmit` exit 0; `npx vitest run` → 221 filer / 2687 tester grønn; `npm run build` → ✓ Compiled successfully, 35 ruter.

## Gates (kjøres etter chunk)

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

RLS-verifisering (K2–K5) kjøres via Supabase MCP `execute_sql` / `list_migrations` mot prod (RLS er Postgres-håndhevet, ikke vitest-testbart).

## Commits-plan (atomiske)

1. `chore(db): #444 tighten group_members UPDATE RLS — force role changes through RPC (migration 0078)` — kun migrasjonsfil. Ingen version-bump (ingen bruker-synlig oppførsel; `chore`-prefiks passerer commit-msg-hook).

## Out-of-scope (notér, ikke bygg)

- Bredere RLS-revisjon av øvrige tabeller er ikke i scope — kun `group_members` UPDATE.
- Eventuelle nye funn → ny GitHub-issue per `feedback_review_findings_as_issues`.
