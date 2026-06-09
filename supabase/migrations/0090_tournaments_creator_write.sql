-- 0090_tournaments_creator_write.sql
-- #526: personlig cup for alle. Lar en vanlig bruker skrive sin egen
-- frittstående cup (opprette, redigere, generere matcher, starte, avslutte,
-- slette).
--
-- Bakgrunn: 0089 la til WRITE-policyen "tournaments admin or club-admin write"
-- som for group_id null kun slipper gjennom is_admin(). Det blokkerte
-- ikke-admin-skapere med 42501 på personlige cuper. Cup-handlingene bruker
-- request-scoped (authenticated) klient, så RLS er den reelle skrivegrensen —
-- app-laget (requireAdminOrTournamentCreator) er kun UX-guard.
--
-- Denne policyen er additiv: PostgreSQL OR-er permissive policies, så den
-- utvider kun tilgangen (skaper får skrive sine egne frittstående cuper) uten å
-- røre eksisterende admin/klubb-admin-tilgang. Klubb-cuper (group_id satt)
-- berøres ikke — de styres fortsatt av klubb-admin-grenen i 0089. Speiler
-- games-creator-RLS (0071, "games insert own created") og leagues-mønsteret.

create policy "tournaments creator write own personal" on public.tournaments
  for all to authenticated
  using (group_id is null and created_by = auth.uid())
  with check (group_id is null and created_by = auth.uid());
