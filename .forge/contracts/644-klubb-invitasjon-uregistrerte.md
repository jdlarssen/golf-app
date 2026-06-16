# Forge-kontrakt: #644 — Klubb-invitasjon for uregistrerte e-poster
Type: enhancement, area:admin, Bump: minor. Branch: claude/644-klubb-invitasjon-uregistrerte.

CONTEXT: "Legg til medlem på e-post" in a club requires the person to already have a Tørny account — unregistered email gives ?error=not_found. Game invitations (public.invitations) DO support unregistered: notification mail + reconciliation at registration. Club membership lacks this. DECISION (owner): full build — mirror the game-invite flow with a pending club_invitations row, notification mail, and reconciliation at registration (verifyCode adds the person as member automatically).

MODEL TO MIRROR:
- Table public.invitations (supabase/migrations/0001_initial_schema.sql:81-90): email, token, invited_by, expires_at, accepted_at; no user_id.
- Admin invite: app/[locale]/admin/spillere/actions.ts:36-102 — dedup via email_is_invited RPC, insert row, sendInviteNotification (best-effort try/catch).
- Mail: lib/mail/inviteNotification.ts (locale-aware via lib/mail/i18n.ts getMailTranslator/mailUrl; unregistered → default 'no').
- Reconciliation: app/[locale]/(auth)/login/actions.ts:168-335 verifyCode() — after OTP: mark invitations accepted_at, insert game_players, befriend_inviter RPC (#481, games-only).
- Club add-by-email today: app/[locale]/klubber/[id]/actions.ts:26-75 addMember() → RPC add_club_member_by_email (supabase/migrations/0075_clubs_create_and_scope.sql:160-192); returns 'not_found' for unknown email.
- Schema: group_members (0074), groups with member_cap/valid_until (0075/0076), group_join_requests (0075).
- Helptext: messages/no.json klubb.room.emailHint + klubb.create.ownerEmailHint = "Personen må ha Tørny-konto fra før."

SUCCESS CRITERIA:
1. New migration (next free number — latest on origin/main is 0098, so likely 0099; VERIFY no collision by listing supabase/migrations/). public.club_invitations: id uuid pk default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade, email text not null, token text not null unique, invited_by uuid references users(id), expires_at timestamptz not null default now()+interval '14 days', accepted_at timestamptz, created_at timestamptz default now(). Partial unique index (group_id, lower(email)) where accepted_at is null.
2. RLS: group admins (is_group_admin(group_id)) can select/insert/delete rows for their group. No other access.
3. add_club_member_by_email extended: user-not-found → respect member_cap (count active members + open invitations), insert idempotent club_invitation, return new code 'invited'. Existing codes (added/already_member/not_auth/full/expired/email_req) unchanged. SECURITY DEFINER + admin gate kept.
4. Reconciliation RPC accept_club_invitations() SECURITY DEFINER (or inline in verifyCode via admin client): on registration, for each open club_invitation matching the user's email (lower) not expired → insert group_members (role 'member', idempotent), set accepted_at=now(). Respect member_cap/valid_until (skip frozen/full clubs, leave invite standing).
5. lib/mail/clubInviteNotification.ts mirrors inviteNotification.ts: locale-aware (default 'no'), club name + inviter name + link to /login (via mailUrl). Best-effort (throws; caller wraps).
6. mail.* i18n keys added in no.json + en.json (subject + body). Norwegian must read naturally (no AI-tells).
7. Snapshot test (Type B) for the template: subject + text + extracted body, ONE chrome-lock. Reuse shared structural contracts; don't duplicate RFC/URL asserts.
8. klubber/[id]/actions.ts addMember() handles 'invited' → redirect with success param (e.g. ?invited=<email>), calls sendClubInviteNotification best-effort (try/catch, log on failure, don't abort).
9. Helptext + receipts updated: klubb.room.emailHint / klubb.create.ownerEmailHint changed from "Personen må ha Tørny-konto fra før." to communicate that unregistered people get an email invitation. New success banner for 'invited'.
10. Pending invitations visible in the club room: list of open club_invitations (email + "ventende" badge) with cancel (delete). Minimal but gives the organizer confirmation.
11. verifyCode() calls the club reconciliation after the game-invite reconciliation, best-effort (a failure here must not block login). A new user who was club-invited is a member on first login.
12. npx tsc --noEmit green; npx vitest run lib/mail green.

NON-GOALS: no auto-friendship on club invite (#481 was deliberately games-only); don't touch group_join_requests / "be om å bli med"; don't change group_members schema; no new club role (invitees become 'member').

MIGRATION ORDERING: write the migration file in the PR but do NOT apply it. Main chat applies via Supabase MCP after merge/deploy. The new club_invitations TABLE is additive/safe; the RPC change syncs with deploy.
