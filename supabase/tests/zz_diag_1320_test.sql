-- TEMP probe for #1320 — reveals the identity and ACL view of the exact
-- session pg_prove/supabase-test-db runs the suites under. DELETE before
-- merging; it asserts nothing about the product.
begin;
create extension if not exists pgtap;
select plan(1);

do $$
declare
  acl text;
begin
  raise notice 'diag current_user=% session_user=%', current_user, session_user;
  select relacl::text into acl from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'game_players';
  raise notice 'diag game_players relacl=%', acl;
  begin
    set local role authenticated;
    raise notice 'diag set role authenticated: OK (current_user=%)', current_user;
    reset role;
  exception when others then
    raise notice 'diag set role authenticated FAILED: % %', SQLSTATE, SQLERRM;
  end;
end $$;

select ok(true, 'diagnostics emitted via NOTICE — see log');
select * from finish();
rollback;
