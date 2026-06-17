# Contract: #705 — row-id-scope the inviteToGame rollback delete

## Context
`inviteEmailToGame` (PR #700, issue #686) added a compensating rollback: on mail-send
failure it deletes the just-inserted `invitations` row. The delete matches on
`email + game_id + accepted_at IS NULL`, NOT on the row id. Under concurrency a second
pending invite for the same email could be deleted too. Solo-admin probability is low,
but the row-id scoping is the named primary hardening and needs no migration.

File: `app/[locale]/admin/games/[id]/inviteToGameActions.ts`

## Success Criteria
- [ ] The `invitations` insert returns the new row id (`.select('id').single()` or equivalent).
- [ ] The rollback delete in the mail-failure `catch` path is scoped by `.eq('id', <insertedRowId>)`, not by `email + game_id + accepted_at`.
- [ ] No behaviour change on the happy path (successful invite still works; mail still best-effort).
- [ ] Co-located test proves the rollback deletes only the inserted row id (and/or that the insert id is used in the delete).
- [ ] `npx tsc --noEmit` clean; co-located vitest green.

## Out of scope (do NOT do)
- The partial unique index migration (option 2) — separate hardening, tracked as a possible follow-up.

## Gates
- `npx tsc --noEmit`
- `npx vitest run app/[locale]/admin/games/[id]/inviteToGameActions.test.ts` (or wherever the co-located test lands)
