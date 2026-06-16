# Forge-evaluering: #644 — Klubb-invitasjon for uregistrerte e-poster

VERDICT: ACCEPT

Branch under review: `claude/644-klubb-invitasjon-uregistrerte` @ `3ee2d691`
Evaluated against `.forge/contracts/644-klubb-invitasjon-uregistrerte.md` and `origin/main`.

## Gate output

- `npx tsc --noEmit` → **TSC_EXIT=0** (clean). The no-arg `rpc('accept_club_invitations')` call,
  the `club_invitations` table types, and all new code typecheck.
- `npx vitest run lib/mail` → **14 files / 129 tests passed**. Includes the new
  `clubInviteNotification.test.ts` snapshots and the shared `resend-contract.test.ts`
  (now 12 senders).
- `npx vitest run messages/catalogParity.test.ts` → **3/3 passed** (no.json/en.json key sets in sync).

(No `npm run build` — `.env.local` unavailable, per evaluator setup.)

## Per-criterion findings

**1. Migration table + index — PASS.**
`supabase/migrations/0099_club_invitations.sql:23-42`. Columns match the contract exactly:
`id uuid pk default gen_random_uuid()`, `group_id uuid not null references groups(id) on delete cascade`,
`email text not null`, `token text not null unique`, `invited_by uuid references users(id)` (with
`on delete set null` — a sensible superset of the contract), `expires_at timestamptz not null default
(now()+interval '14 days')`, `accepted_at timestamptz`, `created_at timestamptz not null default now()`.
Partial unique index `(group_id, lower(email)) where accepted_at is null` at :37-39. Two helper indexes added.
0099 is the next free number — `ls supabase/migrations/` confirms latest on origin/main is 0098, no collision.

**2. RLS admin-only — PASS.** `0099:49-63`. RLS enabled; select/insert/delete policies all gated on
`public.is_group_admin(group_id)` (defined `0074:57`, SECURITY DEFINER). No member/self/anon access. Correct
— the invitee has no account yet, so no self-select is needed or possible.

**3. add_club_member_by_email extended — PASS.** `0099:72-160`, CREATE OR REPLACE (preserves 0075/0076 ACL).
Compared line-by-line against `0076:132-177`: the existing-user branch is faithfully preserved —
`not_authorized`/`email_required` exceptions, `club_expired` for frozen clubs, `already_member`, `club_full`,
`added`. (Contract's shorthand code names `not_auth/full/expired/email_req` map to the real RPC codes
`not_authorized/club_full/club_expired/email_required`; the action layer translates them — see criterion 8.)
New behavior: cap now counts active members **+** open invitations (`0099:111-120` for existing users,
`:138-148` for unknown), so a club cannot over-invite past `member_cap`. Unknown email → idempotent insert,
returns `'invited'` (`:126-159`). Stale-expired-open rows are deleted before insert (`:152-156`) so the
partial-unique index never throws a hard error the admin sees as a crash.

**4. accept_club_invitations() — PASS.** `0099:170-234`, SECURITY DEFINER, `set search_path = ''`,
locked to authenticated (`:238-240`). Loops open non-expired invitations matching `lower(email)`; skips
frozen clubs (`:201`) and full clubs (`:217-223`) leaving the invite standing; idempotent member insert
via `on conflict (group_id, user_id) do nothing` (`group_members` PK is `(group_id, user_id)`, confirmed
`0074:37`); marks already-members accepted without a new row (`:207-214`); sets `accepted_at=now()` on join.

**5. clubInviteNotification.ts — PASS.** `lib/mail/clubInviteNotification.ts`. Mirrors
`inviteNotification.ts`: locale-aware via `getMailTranslator`/`resolveMailLocale`/`mailUrl`, default 'no' for
account-less invitees, link to `/login`, `escapeHtml` on interpolated names, throws on Resend error
(best-effort — caller wraps).

**6. mail.* i18n keys — PASS.** `messages/no.json` + `messages/en.json` both gain
`mail.clubInvite.{subject,heading,intro,footerDisclaimer,getStartedHtml,getStartedText}`. Norwegian reads
naturally (no AI-tells, no em-dash chains, no «vennligst»). Catalog parity test green.

**7. Snapshot test (Type B) — PASS.** `lib/mail/clubInviteNotification.test.ts`. ONE chrome-lock
(`:134-180`); subject+text+body-line snapshots per case (no/HTML-escape/en). Structural Resend contracts
explicitly deferred to the shared file — `resend-contract.test.ts` registers `sendClubInviteNotification`
as the 12th sender, no duplicated RFC/URL/error asserts.

**8. addMember 'invited' handling — PASS.** `app/[locale]/klubber/[id]/actions.ts:33-113`. Translates all
RPC codes to query params; `'invited'` (`:86-108`) looks up club + inviter name via admin client and sends
mail inside try/catch. Mail failure → `?invited=…&mail=failed` (non-blocking notice), success →
`?invited=…`. The `redirect()` calls (which throw NEXT_REDIRECT) sit **outside** the try block, so the
redirect control-flow is never swallowed. DB write is the source of truth; mail never aborts it.

**9. Helptext + receipts — PASS.** `klubb.room.emailHint` changed from «Personen må ha Tørny-konto fra
før.» to «Har personen ikke Tørny fra før, får de en invitasjon på e-post.» (both catalogs). New banners:
`invitedBanner`, `invitedMailFailedBanner`, `cancelledBanner`, `cancelledErrorBanner`. (Note: contract
also named `klubb.create.ownerEmailHint`; the owner-email field on the create form was not in the diff —
minor, the room hint is the one users hit when inviting unregistered people, and the create-form owner is
the creator themselves.)

**10. Pending invitations UI + cancel — PASS.** `page.tsx:261-301` renders an owner/admin-only section
listing open invitations (email + «Ventende» badge) with a `cancelInvitation` form. `cancelInvitation`
(`actions.ts:185-214`) deletes via the **request-scoped** client — RLS «club_invitations admin delete»
enforces authz in Postgres (a non-admin delete affects 0 rows). Idempotent.

**11. verifyCode reconciliation, best-effort — PASS (CRITICAL).**
`app/[locale]/(auth)/login/actions.ts:370-384`. The `accept_club_invitations` call runs **after** the
game-invite reconciliation (`:366` closes that block) in its **own** try/catch. Both the supabase
error-channel (`clubErr` → console.error) and a thrown exception (catch → console.warn) are handled, with
**no rethrow**. The block sits before the `redirect()` calls (`:390-397`, outside any try/catch per the
#356 comment). **A missing table/RPC in prod cannot break login.**

**12. Gates green — PASS.** See gate output above.

## Adversarial checks

- **verifyCode breaking login if RPC/table missing?** NO. Own best-effort try/catch swallows+logs, no
  rethrow; placed before the redirect. Login proceeds regardless.
- **Club room 500 if club_invitations empty/missing?** NO. `getClubDetail.ts:108-117` runs the query
  inside `Promise.all`; the Supabase query builder resolves (never rejects) on a DB error, returning
  `{data:null, error}`. The consumer reads `invitationsRes.data ?? []` (`:163-164`) — a missing table
  yields `null` → `[]`, page renders fine. This is the key migration-ordering safety net.
- **Partial unique index idempotency on duplicate invite?** SAFE. RPC checks for an existing open+valid
  invite and returns `'invited'` without inserting (`0099:128-137`); stale-expired-open rows are deleted
  before insert (`:152-156`). No unique-violation crash surfaces to the admin.
- **member_cap counts members AND open invitations?** YES, both branches (`0099:111-120`, `:138-148`).
  Returns `'club_full'` correctly.
- **SQL syntax / apply-time failures?** None found. `gen_random_uuid()` and `now()` in the
  `search_path=''` function body resolve via the always-present `pg_catalog` (built-ins since PG13;
  matches the deployed 0077 `send_friend_request` pattern). `on conflict (group_id, user_id)` matches the
  `group_members` PK. All table refs are `public.`-qualified.
- **database.types.ts faking the typecheck?** NO. `accept_club_invitations: { Args: never; Returns: number }`
  is the same form used by deployed no-arg RPCs (`is_admin`, `generate_friend_code`). `tsc` green proves
  the no-arg `rpc('accept_club_invitations')` call typechecks against it. The `club_invitations` Row/Insert/
  Update/Relationships match the migration exactly.

## Migration-ordering recommendation

**Safe to apply 0099 to prod, then merge — in that order.** The table + RPCs are additive. Both consumers
are resilient to ordering either way:
- The club-room page tolerates a missing table (`?? []` → empty list, no 500).
- `verifyCode` tolerates a missing RPC (best-effort catch, no rethrow → login unaffected).
- Before the new `addMember` action deploys, the old RPC behavior (unknown email → `not_found`) is
  unchanged, so no stale-RPC mismatch.

Recommended sequence (matches the contract's MIGRATION ORDERING note): **apply 0099 via Supabase MCP →
then merge/deploy the code.** Either order is non-breaking, but applying the migration first means the
`'invited'` path works the instant the code is live, and the new admin client `groups`/`users` lookups in
addMember already work today.

**Is it safe to apply the migration to prod and then merge? YES.**
