# Contract: #689 — Remove dead format-gate in CupSetup

**Issue:** https://github.com/jdlarssen/golf-app/issues/689
**Scope:** `app/[locale]/admin/games/new/CupSetup.tsx` + co-located test

## Problem

`CupSetup` disabled the submit button (`disabled={!atLeastOneFormat}`) and showed
a validation error when all match-format checkboxes were unchecked. The format
selection is not persisted anywhere — `createTournamentDraft` (lib/cup/actions.ts)
reads only `name`, `team_1_name`, `team_2_name`, `points_to_win`,
`fourball_allowance_pct`, `foursomes_allowance_pct`, `group_id`. No column
`allowed_match_formats` exists in the `tournaments` table. The gate was therefore
a dead-end that blocked users for no reason.

## Decision

Remove the gate entirely. The checkboxes remain as intent-signalling UI (they help
the admin think about what formats to use) but must not block form submission.
When `tournaments.allowed_match_formats` is eventually added to the schema and
wired into the +Match flow, re-introduce validation at that point.

## Changes

| File | Lines touched | What |
|---|---|---|
| `CupSetup.tsx` | L76 removed | `const atLeastOneFormat = ...` derivation |
| `CupSetup.tsx` | L219-223 removed | `{!atLeastOneFormat && <p ...>}` error paragraph |
| `CupSetup.tsx` | L230 removed | `disabled={!atLeastOneFormat}` on Button |
| `CupSetup.test.tsx` | L44-53 updated | Assertions now verify button is always enabled; "all unchecked" case stays but checks NOT disabled |

## Verification

- `npx vitest run app/[locale]/admin/games/new/CupSetup.test.tsx` — 2/2 green
- No TypeScript references to `atLeastOneFormat` or `atLeastOneFormatError` remain
- `createTournamentDraft` confirmed to not read any format field (lib/cup/actions.ts)

## Risk

None. The schema column does not exist; removing the client-side guard only
un-blocks users. When Wave-2 adds `allowed_match_formats` to the DB and wires it
into the +Match picker, validation should be re-introduced both server-side (in
`createTournamentDraft`) and client-side (in `CupSetup`).
