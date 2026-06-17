# Evaluation: #705 — row-id-scope the inviteToGame rollback delete

**VERDICT: ACCEPT**

Evaluated against commit `e2d29395` on branch `claude/peaceful-bhabha-6f0741`.

---

## Per-Criterion Table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | INSERT returns the new row id (`.select('id').single()` or equivalent) | **PASS** | `inviteToGameActions.ts` lines 226–236: `.insert({...}).select('id').single<{ id: string }>()` — the chained `.select('id').single()` triggers Postgres `RETURNING id` and binds the result to `insertedInvitation`. |
| 2 | Rollback delete scoped by `.eq('id', <insertedRowId>)` and nothing else | **PASS** | Lines 263–266: `.delete().eq('id', insertedInvitation.id)` — the old `email + game_id + accepted_at` multi-column match is gone entirely. Diff confirms the removal. No residual email/game_id filter. |
| 3 | Null/undefined id is safe — rollback skips rather than firing a dangerously wide delete | **PASS** | Line 262: `if (insertedInvitation?.id)` — optional-chaining guard means if `.single()` returns `null` data (theoretically impossible after a successful insert, but defensively handled), the rollback block is skipped entirely. An undefined `id` cannot produce a `.eq('id', undefined)` call. The redirect still fires, correctly surfacing `error=mail_failed`. |
| 4 | Happy path unchanged — successful invite still inserts + sends mail; mail failure is best-effort (does not block) | **PASS** | Lines 244–276: `sendInviteNotification` is called in a `try`; on success the function reaches `revalidateTag` + redirect `status=invite_sent`. Mail failure only triggers rollback + redirect `error=mail_failed`. The two existing "happy path" tests (`ukjent e-post` and `eksisterende e-post`) pass without modification. |
| 5 | Co-located test proves row-id scoping, not hollow | **PASS** | Test at line 374 (`mail-feil ved ukjent e-post: ruller invitations-raden tilbake via row-id (#705)`): (a) the mock queue supplies a concrete UUID (`INSERTED_ROW_ID`) as the insert result; (b) `sendInviteNotificationMock` is forced to throw; (c) the test introspects `supabaseMock.__fromCalls` and asserts that an `eq` call with `args[0] === 'id'` and `args[1] === INSERTED_ROW_ID` was recorded, AND that the preceding `delete` call was on the `invitations` table. This is not a hollow assertion — it checks both the column name and the exact value. |
| 6 | `npx tsc --noEmit` clean | **PASS** | Ran with no output (exit 0). |
| 7 | Co-located vitest green | **PASS** | All 17 tests in `inviteToGameActions.test.ts` pass. Full suite: 3649 passed, 0 failed. |

---

## Gate Outputs

### `npx tsc --noEmit`

```
(no output — exit 0)
```

### `npx vitest run inviteToGameActions.test.ts`

```
✓ addExistingPlayerToGame > insertes spiller + fyrer notify når draft-spill har plass
✓ addExistingPlayerToGame > avviser når spillet er active (status-lock)
✓ addExistingPlayerToGame > avviser når best-ball er fullt (8/8)
✓ addExistingPlayerToGame > idempotent: UNIQUE-violation swallow-es uten ny notify
✓ addExistingPlayerToGame > inviter-self: skip notify, men game_players-insert kjører fortsatt
✓ addExistingPlayerToGame > avviser når recipient_user_id mangler i form
✓ addExistingPlayerToGame > oppretter (ikke-admin): legger til spiller, lander på /games/[id]/spillere
✓ addExistingPlayerToGame > avviser ikke-best-ball-modus ved 10 spillere (ingen øvre grense)
✓ inviteEmailToGame > eksisterende e-post: går gjennom picker-stien (ingen mail, men notify)
✓ inviteEmailToGame > ukjent e-post: insert i invitations + spill-spesifikk mail, ingen notify
✓ inviteEmailToGame > idempotent: pending invitation re-sender mail best-effort (ingen ny rad)
✓ inviteEmailToGame > mail-feil ved ukjent e-post: ruller invitations-raden tilbake via row-id (#705)
✓ inviteEmailToGame > avviser ugyldig e-post
✓ inviteEmailToGame > oppretter (ikke-admin): ukjent e-post → invitations-insert + mail, lander på /games/[id]/spillere
✓ inviteEmailToGame > oppretter (ikke-admin): disposable-domene blokkeres før mail
✓ inviteEmailToGame > admin: disposable-domene blokkeres IKKE (kurator-unntak #422)
✓ inviteEmailToGame > avviser game_locked når spillet er active

Tests  3649 passed (3649)
Duration  37.76s
```

---

## Playwright / UI Note

This change is server-action logic with no rendered UI surface and no running backend or Supabase auth available in the worktree. A browser/Playwright test is not meaningfully possible and is not part of the contract gates.

---

## Additional Observations (non-blocking)

One minor defensiveness note: when the rollback delete itself fails (line 267–269), the code logs the error but still redirects to `error=mail_failed`. The organiser sees a consistent error state and can retry. The orphaned row then remains, but the idempotent check at the top of the function will re-send the mail on the next attempt (the existing `existingInvite` branch), so the invitee is not stranded. This is acceptable — the contract explicitly marks the rollback as a best-effort compensating action.

The `buildSupabaseMock.__fromCalls` inspection approach in the test is robust: the mock's `fromCalls` array is accumulated across the entire action run, so the test can independently verify that `.eq('id', INSERTED_ROW_ID)` appeared *after* a `.delete()` on `invitations`, without being sensitive to call ordering of unrelated queries.
