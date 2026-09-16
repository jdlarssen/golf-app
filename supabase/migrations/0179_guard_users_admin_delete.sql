-- 0179 — Admin-kontoen kan ikke slettes, heller ikke av service-role (#1903).
--
-- Hvorfor: DB-ens eneste admin-sperre satt i anonymize_user (0142/0176). Den
-- fyrer bare på anonymiserings-stien. En admin uten game_players-rader tar den
-- HARDE stien i lib/users/deleteAccount.ts — `auth.admin.deleteUser(id)` — og
-- kaskaden auth.users → public.users (ON DELETE CASCADE, 0001) gikk rett
-- gjennom. Da sto TS-blokk-sjekken alene, og den leste is_admin fail-open.
--
-- Hva: BEFORE DELETE på public.users som nekter å slette en rad med
-- is_admin = true. Kaskaden fra auth.users kjører i samme transaksjon, så når
-- denne raiser, ruller GoTrue-slettingen tilbake og deleteUser svarer med
-- error. TS-koden faller da til anonymize_user, som selv nekter admin →
-- { ok: false } → «prøv igjen». Hele kjeden er fail-closed.
--
-- Ingen `auth.uid() is null`-escape, i motsetning til guard_users_self_update
-- (0107): hard-stien kjører nettopp som service-role, så en escape ville latt
-- akkurat det vi vil stoppe gå gjennom.
--
-- Skal en admin-konto faktisk avvikles: ta bort flagget først
--   update public.users set is_admin = false where id = '<id>';
-- og slett deretter som vanlig.
--
-- Rekkefølge mot prod: ufarlig FØR kode-deploy — den nekter bare en sletting
-- ingen kode skal gjøre. Påføres før merge.

create or replace function public.guard_users_admin_delete()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  begin
    if old.is_admin then
      raise exception
        'admin accounts cannot be deleted (public.users.is_admin) — clear is_admin first'
        using errcode = 'insufficient_privilege';
    end if;

    return old;
  end;
$$;

-- Trigger-funksjoner kalles av trigger-mekanismen, som ikke sjekker EXECUTE
-- (0137). Fjern klient-flaten så den ikke ligger på /rest/v1/rpc.
revoke execute on function public.guard_users_admin_delete() from public, anon, authenticated;

drop trigger if exists guard_users_admin_delete on public.users;
create trigger guard_users_admin_delete
  before delete on public.users
  for each row execute function public.guard_users_admin_delete();
