-- i18n Fase D (#592): drop the format content columns from `formats`.
--
-- The editorial/content text (display_name, short_description, rules_summary,
-- rules_points, rules_long, rules_example) has moved to the message catalog
-- (messages/{no,en}.json → formatGuide.content + modes.*). No application code
-- reads these columns any more — getFormatsForIntent / getCupEligibleFormats /
-- getAllFormatsWithMappings select only slug/icon_key/is_active/is_cup_eligible,
-- and the Sekretariat content editor is removed.
--
-- The remaining `formats` columns (slug, icon_key, is_active, is_cup_eligible)
-- plus `format_intent_mapping` stay — they are operational, not content.
--
-- ⚠️ Run AFTER the code deploy that stops selecting these columns. Per the
-- format-migration discipline ([[project_format_migration_post_deploy]]) the
-- code must ship first, otherwise the old build's `select('display_name ...')`
-- would error against the new schema during the deploy window.

ALTER TABLE public.formats
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS short_description,
  DROP COLUMN IF EXISTS rules_summary,
  DROP COLUMN IF EXISTS rules_points,
  DROP COLUMN IF EXISTS rules_long,
  DROP COLUMN IF EXISTS rules_example;
