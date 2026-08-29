-- supabase/tests/push_device_claim_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime RLS / RPC integration test for migration 0167 (#1790): possession-
-- gated takeover of push-device rows on account switch, end-to-end against real
-- Postgres roles.
--
-- The scenario: a device registered its push identity (apns_tokens.token /
-- push_subscriptions.endpoint — both globally unique) under account A. Account
-- B logs in on the SAME device and re-registers. The ordinary upsert must still
-- be refused by the own-rows RLS (that refusal is what stops an attacker from
-- binding a foreign identity to their own account through the normal write
-- path), and the claim RPC must hand the row over — because presenting the
-- exact unguessable value IS the device-possession proof.
--
--   apns_tokens:
--     1. account B's plain upsert on A's token      → REFUSED (the #1790 bug,
--        now the deliberate guard in front of the RPC fallback)
--     2. A's row survives the refused upsert         → intact
--     3. B's direct UPDATE user_id on A's row        → REFUSED (RLS hostile-PATCH)
--     4. B claims A's token via claim_apns_token     → PASS   (possession proof)
--     5. the claimed row now belongs to B            → user_id = B
--     6. exactly one row holds the token             → no duplicate identity
--     7. A's OTHER device row is untouched           → claim scope = presented value only
--     8. B claims a value nobody holds               → PASS (plain insert-for-self,
--        same thing the ordinary INSERT policy already allows)
--     9. …and that row belongs to B                  → user_id = B
--    10. anon cannot execute the claim RPC           → REFUSED (no EXECUTE grant)
--
--   push_subscriptions (policy mirror of 0116 — same decision, both tables):
--    11. B's plain upsert on A's endpoint            → REFUSED
--    12. B's direct UPDATE user_id on A's row        → REFUSED
--    13. B claims A's endpoint                       → PASS
--    14. the claimed row now belongs to B            → user_id = B
--    15. …and carries B's presented keys             → p256dh = B's value
--    16. exactly one row holds the endpoint          → no duplicate identity
--    17. anon cannot execute the claim RPC           → REFUSED
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- Catalog-level hardening asserts (search_path, grants) live in
-- security_definer_hardening_test.sql. See supabase/tests/README.md (#440 rig).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

\ir fixtures/rls_helpers.psql

-- ── Probe helpers (local to this suite) ──────────────────────────────────────
-- Same boolean-return shape as the fixture probes: TRUE if the write landed,
-- FALSE when RLS / a missing EXECUTE grant rejected it (42501).

-- try_upsert_apns(token): the impersonated user runs the exact write
-- registerApnsToken performs — insert with on-conflict-update on the unique
-- token. Against another user's row the UPDATE arm's USING refuses → 42501.
create or replace function torny_rls.try_upsert_apns(p_token text) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
  begin
    insert into public.apns_tokens (user_id, token, user_agent)
      values (v_actor, p_token, 'probe-ua')
    on conflict (token) do update
      set user_id = excluded.user_id, user_agent = excluded.user_agent;
    return true;
  exception when insufficient_privilege then return false;
  end;
$$;

-- try_steal_apns(token): hostile direct PATCH — rebind the row via plain UPDATE.
create or replace function torny_rls.try_steal_apns(p_token text) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
    v_rows  int;
  begin
    update public.apns_tokens set user_id = v_actor where token = p_token;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- try_claim_apns(token): the 0167 fallback path.
create or replace function torny_rls.try_claim_apns(p_token text) returns boolean
  language plpgsql as $$
  begin
    perform public.claim_apns_token(p_token, 'probe-ua');
    return true;
  exception when insufficient_privilege then return false;
  end;
$$;

-- Web-push mirrors of the three probes above.
create or replace function torny_rls.try_upsert_push(p_endpoint text) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      values (v_actor, p_endpoint, 'probe-p256dh', 'probe-auth', 'probe-ua')
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh,
          auth = excluded.auth, user_agent = excluded.user_agent;
    return true;
  exception when insufficient_privilege then return false;
  end;
$$;

create or replace function torny_rls.try_steal_push(p_endpoint text) returns boolean
  language plpgsql as $$
  declare
    v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
    v_rows  int;
  begin
    update public.push_subscriptions set user_id = v_actor where endpoint = p_endpoint;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

create or replace function torny_rls.try_claim_push(p_endpoint text) returns boolean
  language plpgsql as $$
  begin
    perform public.claim_push_subscription(p_endpoint, 'probe-p256dh', 'probe-auth', 'probe-ua');
    return true;
  exception when insufficient_privilege then return false;
  end;
$$;

-- as_anon(): the fixtures only ship as_user/as_service; the anon probe needs
-- the real anon role with no JWT claims.
create or replace function torny_rls.as_anon() returns void
  language plpgsql as $$
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
  end;
$$;

-- ── Seed: users from the shared rig + device rows for account A ──────────────
-- seed_active_game() gives us real auth.users/public.users actors; active_id
-- plays account A (two devices), flightmate_id plays account B on A's device.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.apns_tokens (user_id, token, user_agent) values
  (torny_rls.active_id(), 'rls-apns-a',  'seed'),
  (torny_rls.active_id(), 'rls-apns-a2', 'seed');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values
  (torny_rls.active_id(), 'https://rls.example/ep-a', 'seed-p256dh', 'seed-auth', 'seed');

-- ═════════════════════════════════════════════════════════════════════════════
-- apns_tokens
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select ok(
  not torny_rls.try_upsert_apns('rls-apns-a'),
  '#1790: account B''s plain upsert on A''s token is REFUSED by RLS (the guard in front of the fallback)'
);

select torny_rls.as_service();
select is(
  (select user_id from public.apns_tokens where token = 'rls-apns-a'),
  torny_rls.active_id(),
  '#1790: the refused upsert left A''s row untouched'
);

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  not torny_rls.try_steal_apns('rls-apns-a'),
  '#1790: direct PATCH rebinding another user''s token row is still REFUSED by RLS'
);

select ok(
  torny_rls.try_claim_apns('rls-apns-a'),
  '#1790: claim_apns_token hands the row over when B presents the exact token (possession proof)'
);

select torny_rls.as_service();
select is(
  (select user_id from public.apns_tokens where token = 'rls-apns-a'),
  torny_rls.flightmate_id(),
  '#1790: the claimed token row now belongs to account B'
);

select is(
  (select count(*) from public.apns_tokens where token = 'rls-apns-a'),
  1::bigint,
  '#1790: exactly one row holds the claimed token (no duplicate device identity)'
);

select is(
  (select user_id from public.apns_tokens where token = 'rls-apns-a2'),
  torny_rls.active_id(),
  '#1790: A''s OTHER device row is untouched — the claim only reaches the presented value'
);

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  torny_rls.try_claim_apns('rls-apns-fresh'),
  '#1790: claiming a value nobody holds degrades to a plain insert-for-self (allowed)'
);

select torny_rls.as_service();
select is(
  (select user_id from public.apns_tokens where token = 'rls-apns-fresh'),
  torny_rls.flightmate_id(),
  '#1790: the fresh-value claim inserted the row for the caller, never a client-supplied user'
);

select torny_rls.as_anon();
select ok(
  not torny_rls.try_claim_apns('rls-apns-a'),
  '#1790: anon has no EXECUTE on claim_apns_token'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- push_subscriptions (mirror)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select ok(
  not torny_rls.try_upsert_push('https://rls.example/ep-a'),
  '#1790: account B''s plain upsert on A''s endpoint is REFUSED by RLS'
);

select ok(
  not torny_rls.try_steal_push('https://rls.example/ep-a'),
  '#1790: direct PATCH rebinding another user''s subscription row is still REFUSED by RLS'
);

select ok(
  torny_rls.try_claim_push('https://rls.example/ep-a'),
  '#1790: claim_push_subscription hands the row over when B presents the exact endpoint'
);

select torny_rls.as_service();
select is(
  (select user_id from public.push_subscriptions where endpoint = 'https://rls.example/ep-a'),
  torny_rls.flightmate_id(),
  '#1790: the claimed subscription row now belongs to account B'
);

select is(
  (select p256dh from public.push_subscriptions where endpoint = 'https://rls.example/ep-a'),
  'probe-p256dh',
  '#1790: the claimed row carries B''s presented keys, not A''s stale ones'
);

select is(
  (select count(*) from public.push_subscriptions where endpoint = 'https://rls.example/ep-a'),
  1::bigint,
  '#1790: exactly one row holds the claimed endpoint'
);

select torny_rls.as_anon();
select ok(
  not torny_rls.try_claim_push('https://rls.example/ep-a'),
  '#1790: anon has no EXECUTE on claim_push_subscription'
);

select * from finish();
rollback;
