# Forge-kontrakt: #671 Hardne SECURITY DEFINER-funksjoner

**Issue:** #671 — Hardne SECURITY DEFINER-funksjoner: fjern anon-tilgang til e-post-oppslag + sett SET search_path på RLS-helpere  
**Status:** Migration authored as `0104_harden_security_definer_functions.sql`  
**Type:** Security hardening — pure SQL, no app-code changes

---

## Scope

Two-part hardening in one migration:

**Part 1 — Revoke anon EXECUTE on `email_is_in_auth_users`**

- `email_is_in_auth_users(text)` (defined in `0017`) has EXECUTE granted to `anon`, making it an unauthenticated email-enumeration oracle against `auth.users`.
- Both callers (`app/[locale]/invite/actions.ts`, `app/[locale]/admin/spillere/[id]/actions.ts`) are authenticated server-actions — anon access is never needed.
- Fix: `REVOKE EXECUTE ON FUNCTION public.email_is_in_auth_users(text) FROM anon;`
- **Deliberately NOT revoked:** `email_is_invited` — the pre-login `sendCode` action calls it as `anon` for the `shouldCreateUser` gate. Revoking would break the login flow.

**Part 2 — Add `SET search_path` to 5 RLS helpers**

Functions hardened (all receive `SET search_path = public, pg_catalog`):
1. `is_admin()` — defined in `0002`, gates admin writes across all tables
2. `same_flight(uuid, uuid)` — defined in `0002`, used in `scores` SELECT policy
3. `is_in_game(uuid)` — defined in `0003`, gates `game_players` SELECT
4. `can_score_for(uuid, uuid)` — latest in `0095`, gates score INSERT/UPDATE
5. `same_flight_or_solo(uuid, uuid)` — latest in `0095`, gates score SELECT

All five are recreated with `CREATE OR REPLACE` — identical signatures and bodies to their last-defined versions; only `SET search_path = public, pg_catalog` is added. ACLs (grants) are preserved by `CREATE OR REPLACE` semantics.

---

## What is NOT changed

- `email_is_invited` — anon grant preserved (login gate)
- `email_is_registered` — already correctly anon-revoked in `0009`, untouched
- `guard_game_players_self_update` — already has `SET search_path = ''` in `0103`
- `upsert_score_if_newer`, `generate_game_short_id`, `set_updated_at`, `generate_group_short_id`, `generate_friend_code` — SECURITY INVOKER / trigger functions, low-priority (Supabase advisor flags them differently), out of scope
- All RLS policies — unchanged
- All app code — unchanged

---

## Test coverage

`supabase/tests/security_definer_hardening_test.sql` — 8 catalog assertions (no seed required):
1. `anon` does NOT have EXECUTE on `email_is_in_auth_users`
2. `authenticated` STILL has EXECUTE on `email_is_in_auth_users`
3. `anon` STILL has EXECUTE on `email_is_invited`
4–8. Each of the 5 RLS helpers has `search_path` in `pg_proc.proconfig`

---

## Risk

**Zero regression risk** for the search_path changes — function bodies are identical to the currently-running versions, only the catalog metadata changes. The anon-revoke on `email_is_in_auth_users` is safe because no pre-login path calls it (both callers are behind authenticated routes).
