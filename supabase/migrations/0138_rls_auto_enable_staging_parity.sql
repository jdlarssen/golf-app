-- 0138 — Staging parity for the rls_auto_enable event-trigger (#1105).
--
-- Dok-avstemmeren (#1078, first run) found the SECURITY DEFINER event-trigger
-- function public.rls_auto_enable() and its event trigger `ensure_rls` present
-- on prod (glofubopddkjhymcbaph) but absent on staging (snwmueecmfqqdurxedxv).
-- The objects were created directly against prod and never captured in a
-- migration (only 0137 references them, as an existence-guarded revoke), hence
-- the drift. No open RLS gap: all 34 staging public tables already have RLS on
-- (verified read-only 2026-07-08, tables_without_rls=0). This is pure schema
-- convergence — a defense-in-depth layer that auto-enables RLS on new public
-- tables at ddl_command_end, catching a forgotten `enable row level security`
-- before a table is exposed.
--
-- The function definition below is verbatim from prod via pg_get_functiondef
-- (I1 — ground truth, not transcribed from the contract), re-read read-only
-- 2026-07-08. Idempotent and a safe no-op where the objects already exist, so it
-- can also be applied to prod for migration-history parity without effect
-- (create-or-replace = identical body, the event-trigger guard skips, and the
-- revoke was already run there by 0137).

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Event trigger: Postgres has no CREATE EVENT TRIGGER IF NOT EXISTS, so guard in
-- a DO block. This makes re-runs — and prod, where `ensure_rls` already exists —
-- safe no-ops instead of failing with "event trigger already exists".
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    execute $ct$ create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable() $ct$;
  end if;
end $$;

-- ACL parity with prod ({postgres=X/postgres,service_role=X/postgres}): a freshly
-- created function is granted default PUBLIC EXECUTE. 0137's revoke was
-- existence-guarded and no-op'd on staging (the function was absent then), so
-- this new staging function must strip PUBLIC/anon/authenticated itself — else it
-- drifts again on the next dok-avstemmer run and re-raises a #1121-style advisory.
-- The event trigger fires regardless of client EXECUTE privilege; postgres
-- (owner) and service_role keep their grants.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
