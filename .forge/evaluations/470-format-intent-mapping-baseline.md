# Evaluation: format_intent_mapping reconciliation baseline (#470)

**VERDICT: ACCEPT**

Evaluator: claude-sonnet-4-6 (fresh context, adversarial mode)
Date: 2026-06-06

---

## Per-criterion evidence table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Migration uses idempotent upsert with correct conflict target | PASS | `on conflict (format_slug, intent) do update set is_visible = excluded.is_visible, is_primary = excluded.is_primary, sort_order = excluded.sort_order` — conflict target matches the actual PK (see criterion 6) |
| 2 | Live table exactly matches migration VALUES (34 rows, all values correct) | PASS | Full row-by-row diff: zero mismatches (see table below) |
| 3 | `do update` SET clause covers all three mutable columns | PASS | Covers `is_visible`, `is_primary`, `sort_order` — all columns that can drift |
| 4 | Checksum confirms idempotency (no-op on prod) | PASS | Live checksum = `7ff67e393e60ee721225ab810231b570` — matches contract's expected value exactly |
| 5 | Migration recorded in ledger | PASS | `version=20260606205116, name=format_intent_mapping_baseline` — one row, correct |
| 6 | PK is `(format_slug, intent)` — conflict target valid | PASS | `format_intent_mapping_pkey: PRIMARY KEY (format_slug, intent)` |
| 7 | Boolean columns accept `'t'`/`'f'` string literals | PASS | `is_visible` and `is_primary` are both `boolean` type; Postgres accepts `'t'`/`'f'` as boolean input |
| 8 | Only migration + contract files changed vs main | PASS | `git diff origin/main...HEAD --stat` shows exactly 2 files: `.forge/contracts/470-format-intent-mapping-baseline.md` (+50) and `supabase/migrations/0081_format_intent_mapping_baseline.sql` (+60) |

---

## Criterion 2 detail — full row diff

Live table query (`order by intent, sort_order, format_slug`) returned 34 rows.
Migration VALUES list contains 34 rows.

Row-by-row comparison (live → migration):

| format_slug | intent | is_visible | is_primary | sort_order | Match? |
|---|---|---|---|---|---|
| stableford | klubb | true | true | 10 | `'t','t',10` in migration |
| best_ball | klubb | true | true | 20 | `'t','t',20` |
| texas_scramble | klubb | true | true | 30 | `'t','t',30` |
| ambrose | klubb | true | false | 35 | `'t','f',35` |
| florida_scramble | klubb | true | false | 37 | `'t','f',37` |
| solo_strokeplay | klubb | true | true | 40 | `'t','t',40` |
| modified_stableford | klubb | true | false | 80 | `'t','f',80` |
| patsome | klubb | true | false | 90 | `'t','f',90` |
| shamble | klubb | true | false | 90 | `'t','f',90` |
| stableford | kompis | true | true | 10 | `'t','t',10` |
| best_ball | kompis | true | true | 20 | `'t','t',20` |
| texas_scramble | kompis | true | true | 30 | `'t','t',30` |
| singles_matchplay | kompis | true | true | 40 | `'t','t',40` |
| wolf | kompis | true | true | 50 | `'t','t',50` |
| nassau | kompis | true | true | 60 | `'t','t',60` |
| skins | kompis | true | true | 70 | `'t','t',70` |
| nines | kompis | true | true | 71 | `'t','t',71` |
| modified_stableford | kompis | true | true | 80 | `'t','t',80` |
| bingo_bango_bongo | kompis | true | true | 90 | `'t','t',90` |
| acey_deucey | kompis | true | true | 95 | `'t','t',95` |
| ambrose | kompis | true | true | 100 | `'t','t',100` |
| chapman_matchplay | kompis | true | true | 100 | `'t','t',100` |
| florida_scramble | kompis | true | true | 100 | `'t','t',100` |
| fourball_matchplay | kompis | true | true | 100 | `'t','t',100` |
| foursomes_matchplay | kompis | true | true | 100 | `'t','t',100` |
| greensome_matchplay | kompis | true | true | 100 | `'t','t',100` |
| patsome | kompis | true | true | 100 | `'t','t',100` |
| round_robin | kompis | true | true | 100 | `'t','t',100` |
| shamble | kompis | true | true | 100 | `'t','t',100` |
| solo_strokeplay | kompis | true | true | 100 | `'t','t',100` |
| gruesome_matchplay | kompis | true | true | 110 | `'t','t',110` |
| stableford | solo | true | true | 10 | `'t','t',10` |
| solo_strokeplay | solo | true | true | 20 | `'t','t',20` |
| modified_stableford | solo | true | false | 80 | `'t','f',80` |

**Zero mismatches. All 34 rows match exactly.**

---

## Issues found

None.

---

## Raw query outputs (for audit trail)

**Checksum query:**
```
md5(string_agg(...)) = 7ff67e393e60ee721225ab810231b570
```
Matches contract's expected value.

**PK constraint:**
```
format_intent_mapping_pkey: PRIMARY KEY (format_slug, intent)
```

**Ledger:**
```
version=20260606205116, name=format_intent_mapping_baseline
```

**Column types:**
```
is_primary: boolean
is_visible: boolean
```

**git diff --stat:**
```
.forge/contracts/470-format-intent-mapping-baseline.md    | 50 +++
supabase/migrations/0081_format_intent_mapping_baseline.sql | 60 +++
2 files changed, 110 insertions(+)
```
