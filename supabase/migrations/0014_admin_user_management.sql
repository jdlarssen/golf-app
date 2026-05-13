-- Admin kan oppdatere alle bruker-rader. I dag har vi kun
-- "users update own" (egen rad), som blokkerer admin-form-endring av
-- andre brukere. Denne policyen lar admin oppdatere hvem som helst.
create policy "users admin update" on public.users
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- Admin kan slette bruker-rader. Selve slettingen vil i praksis gå
-- via auth.admin.deleteUser (service-role) som cascade-sletter
-- public.users automatisk, men vi legger policyen på plass for å
-- være eksplisitte om hvem som har myndighet til å slette i denne
-- tabellen.
create policy "users admin delete" on public.users
  for delete using (public.is_admin());
