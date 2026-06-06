# Contract: format_intent_mapping reconciliation baseline (#470)

**Issue:** https://github.com/jdlarssen/golf-app/issues/470
**Approach:** Option A — snapshot the full canonical catalog into an idempotent
baseline migration (user delegated the decision: "hva mener du er best?").

## Problem

`format_intent_mapping` is admin-curated at runtime via Sekretariatet → Format
([app/admin/formats/actions.ts](app/admin/formats/actions.ts) writes the table
directly). The live catalog has drifted from the checked-in migrations:

- **8 DRIFT rows** in live with no migration: kompis `ambrose`, `florida_scramble`,
  `shamble`, `patsome`, `fourball_matchplay`, `foursomes_matchplay`,
  `greensome_matchplay`, `chapman_matchplay` (all `is_visible=t, is_primary=t, sort_order=100`).
- **7 is_primary MISMATCHES**: migration says `false`, live says `true` for kompis
  `texas_scramble`, `singles_matchplay`, `bingo_bango_bongo`, `nines`,
  `modified_stableford`, `round_robin`, `acey_deucey`.
- No migration does UPDATE/DELETE — all drift is admin-UI curation.

A fresh DB built only from migrations would show a different, smaller catalog
than prod.

## Fix

New migration `supabase/migrations/0081_format_intent_mapping_baseline.sql`:
idempotent upsert of all 34 current rows (generated directly from the live DB,
no hand-transcription), `on conflict (format_slug, intent) do update set
is_visible, is_primary, sort_order = excluded.*`. No-op on prod, authoritative
on fresh build.

## Success criteria

- [x] Migration file exists with all 34 rows, exact match to live DB — `supabase/migrations/0081_format_intent_mapping_baseline.sql`, rows generated via `format(%L…)` directly from live table
- [x] Migration is idempotent (re-runnable) — `on conflict (format_slug, intent) do update set is_visible/is_primary/sort_order = excluded.*`
- [x] Applied to prod via MCP and recorded in the migration ledger — `apply_migration` returned `{success:true}`; ledger row `version=20260606205116, name=format_intent_mapping_baseline`
- [x] Post-apply verification: true no-op — checksum identical pre/post (`7ff67e393e60ee721225ab810231b570`), 34 rows both times
- [x] No schema change (data-only) → no generated-types change, no version bump, no CHANGELOG (chore)

## Gates

- `mcp apply_migration` succeeds without error
- Post-apply SQL re-query: row count = 34, and a full-table diff vs the pre-apply snapshot is empty
- `git diff --stat` shows only the new migration file (+ this contract / eval)

## Out of scope

- Stopping the admin UI from writing directly (would be the permanent drift fix — separate architectural decision)
- Re-evaluating whether fourball/matchplay family *should* be in kompis (that's the admin's curation call; this migration just records current reality)
- Code changes to the wizard
