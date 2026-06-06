-- 0078_group_members_tighten_update_rls.sql
-- #444 (Klubb-skala epic): stram inn group_members UPDATE-RLS — eier-only rolle-endring.
--
-- Funnet i den skeptiske evalueringen av #50 (.forge/evaluations/50-klubb-delegering-eierskap.md,
-- observasjon #5). UPDATE-policyen fra #49 (0074) er bredere enn #50s eier-only-intensjon:
--
--   group_members UPDATE: is_admin() OR is_group_admin(group_id)
--
-- is_group_admin() er sann for BÅDE 'owner' OG 'admin'. En klubb-admin (ikke eier) kan dermed
-- sende en direkte PostgREST-PATCH /group_members og sette role='owner' på seg selv — og omgå
-- både eier-only-guarden OG sist-eier-guarden i set_club_member_role-RPC-en (0076). Reell
-- privilege-escalation (admin → owner) relativt til «bare eier»-beslutningen i #50, selv om det
-- ikke finnes noen UI-vei dit.
--
-- ── Fiks: dropp UPDATE-policyen helt (ikke en smal owner-policy) ─────────────
-- All rolle-endring går allerede via set_club_member_role (security definer, eid av postgres med
-- rolbypassrls=true → bypasser RLS ubetinget). Ingen app-vei gjør direkte .update() på
-- group_members (kun .select()/.delete()). Å droppe UPDATE-policyen tvinger ALL rolle-mutasjon
-- gjennom RPC-en, som håndhever både eier-only OG sist-eier-guarden.
--
-- Dette lukker to hull, ikke ett: en smal owner-policy (is_group_owner) ville fortsatt latt en
-- EIER PATCHe direkte og omgå sist-eier-guarden (degradere siste eier → klubb uten eier).
--
-- Speiler 0077 (friendships): SELECT-only RLS, alle mutasjoner via secdef-RPC. Mønsteret er
-- allerede live på samme prod-instans.
--
-- Ikke-brytende: INSERT (legg til medlem), DELETE (fjern medlem / forlat) og SELECT (se
-- medlemmer) er urørt. Ren policy-drop uten kode-avhengighet → trygg å applye når som helst.

drop policy if exists "group_members update group admin" on public.group_members;

-- Fest invarianten så ingen senere re-introduserer en bred UPDATE-policy.
comment on table public.group_members is
  'Klubb-medlemskap (#49). Rolle-endring (role-kolonnen) kun via set_club_member_role-RPC '
  '(#50, security definer: eier-only + sist-eier-guard). Bevisst INGEN UPDATE-RLS-policy (#444) — '
  'en bred policy lot klubb-admin self-promote til owner via direkte PATCH. INSERT/DELETE/SELECT '
  'har policyer; mutér roller via RPC.';
