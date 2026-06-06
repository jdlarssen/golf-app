-- 0081_format_intent_mapping_baseline.sql
--
-- Reconciliation baseline for public.format_intent_mapping (#470).
--
-- The wizard format catalog is admin-curated at runtime via Sekretariatet →
-- Format (app/admin/formats/actions.ts writes this table directly). Over time
-- the live catalog drifted from the checked-in migrations: 8 kompis rows
-- (scramble + matchplay families) had no corresponding migration, and 7 rows
-- had is_primary toggled on in prod but not in any migration. A database built
-- only from migrations would therefore show a different, smaller catalog than
-- production.
--
-- This migration snapshots the full canonical catalog as of 2026-06-06 so a
-- rebuilt database (dev / preview branch / disaster recovery) matches prod.
-- The rows below were generated directly from the live table (no hand
-- transcription). Idempotent upsert: a no-op on prod (values already match),
-- authoritative on a fresh build. Admins may keep curating via the UI; re-run
-- a snapshot like this when the catalog meaningfully changes.

insert into public.format_intent_mapping
  (format_slug, intent, is_visible, is_primary, sort_order)
values
  ('stableford', 'klubb', 't', 't', 10),
  ('best_ball', 'klubb', 't', 't', 20),
  ('texas_scramble', 'klubb', 't', 't', 30),
  ('ambrose', 'klubb', 't', 'f', 35),
  ('florida_scramble', 'klubb', 't', 'f', 37),
  ('solo_strokeplay', 'klubb', 't', 't', 40),
  ('modified_stableford', 'klubb', 't', 'f', 80),
  ('patsome', 'klubb', 't', 'f', 90),
  ('shamble', 'klubb', 't', 'f', 90),
  ('stableford', 'kompis', 't', 't', 10),
  ('best_ball', 'kompis', 't', 't', 20),
  ('texas_scramble', 'kompis', 't', 't', 30),
  ('singles_matchplay', 'kompis', 't', 't', 40),
  ('wolf', 'kompis', 't', 't', 50),
  ('nassau', 'kompis', 't', 't', 60),
  ('skins', 'kompis', 't', 't', 70),
  ('nines', 'kompis', 't', 't', 71),
  ('modified_stableford', 'kompis', 't', 't', 80),
  ('bingo_bango_bongo', 'kompis', 't', 't', 90),
  ('acey_deucey', 'kompis', 't', 't', 95),
  ('ambrose', 'kompis', 't', 't', 100),
  ('chapman_matchplay', 'kompis', 't', 't', 100),
  ('florida_scramble', 'kompis', 't', 't', 100),
  ('fourball_matchplay', 'kompis', 't', 't', 100),
  ('foursomes_matchplay', 'kompis', 't', 't', 100),
  ('greensome_matchplay', 'kompis', 't', 't', 100),
  ('patsome', 'kompis', 't', 't', 100),
  ('round_robin', 'kompis', 't', 't', 100),
  ('shamble', 'kompis', 't', 't', 100),
  ('solo_strokeplay', 'kompis', 't', 't', 100),
  ('gruesome_matchplay', 'kompis', 't', 't', 110),
  ('stableford', 'solo', 't', 't', 10),
  ('solo_strokeplay', 'solo', 't', 't', 20),
  ('modified_stableford', 'solo', 't', 'f', 80)
on conflict (format_slug, intent) do update set
  is_visible = excluded.is_visible,
  is_primary = excluded.is_primary,
  sort_order = excluded.sort_order;
