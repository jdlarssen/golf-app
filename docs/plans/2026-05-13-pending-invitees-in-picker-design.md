# Design: pending invitees in the game player picker

**Date:** 2026-05-13
**Owner:** Jørgen
**Status:** Approved — ready for implementation plan

## Problem

When an admin sends an invitation, a row appears in `auth.users` (via Supabase
when the invitee first asks for an OTP) but a `public.users` row is **only**
created after the invitee logs in and fills in name + HCP on
`/complete-profile`.

The admin player picker (used in both `/admin/games/new` and
`/admin/games/[id]/edit`) reads from `public.users`. So an invited friend who
hasn't completed sign-up yet is **invisible** to the admin — making it
impossible to pre-plan a game ahead of the tee-off date.

Concrete state today (2026-05-13): 14 rows in `auth.users`, 9 rows in
`public.users`. The 5 missing rows are all invitees with `last_sign_in_at IS
NULL` (spiller-c, spiller-e, spiller-b, spiller-d,
spiller-a).

## Goal

Let the admin **draft and edit** games that include invitees who haven't
finished signing up — while preserving the integrity guarantee that a game
**cannot be published / started** until every player on the roster has a
fully-completed profile (so course handicap, name and nickname are all real
at tee-off).

Out of scope: guest players (one-time non-registered participants), partial
games of fewer than 8 players, picker search/filter (deferred until the user
base outgrows a flat list).

## User-visible behaviour

**Invitations page** — unchanged. Admin enters an email and clicks send.

**Player picker** (new + edit-draft + edit-scheduled):

- Registered players render as today: `Even Fornes «Forny» — HCP 10.5`.
- Pending invitees render with the email address in place of the name, no
  HCP shown, and a muted `Venter på registrering` pill on the right side of
  the row.
- Both types are selectable for team/flight assignment. They count the same
  toward the "8 valgt" counter.

**Saving a draft** (`Lagre utkast` button): always allowed, regardless of
whether selected players are pending. A draft can sit in any state.

**Publishing a draft / updating a scheduled game** (`Publiser` /
`Lagre endringer`): rejected if any selected player is still pending. The
form re-renders with an error banner:

> «Disse spillerne har ikke fullført registreringen ennå:
> spiller-c@example.com, spiller-d@example.com. De må logge inn og fylle
> inn navn + HCP før spillet kan publiseres.»

**Starting an active game** (`Start spill`-knappen): same gate — refuses if
any roster player is still pending. (Should not happen in practice since
publishing already gates this, but defence in depth.)

**For the invitee:** completely unchanged. They log in via OTP, land on
`/complete-profile`, fill in name + nickname + HCP, get redirected home.

## Approach (single-paragraph summary)

A `public.users` row is created automatically the moment `auth.users` gets a
new row, via a trigger. The new row stores `email`, leaves `name` NULL, sets
`hcp_index` to the schema default (54.0), and leaves a new
`profile_completed_at` timestamp NULL. The complete-profile flow fills in
`name`, `nickname`, `hcp_index` and stamps `profile_completed_at = now()`.
"Pending" is derived from `profile_completed_at IS NULL`. Publishing and
starting a game check that no roster player has a NULL
`profile_completed_at`. The picker query returns one row per user with the
pending flag included; the UI renders pending rows distinctly.

## Why this approach over the alternatives we considered

- **A — Admin types name + HCP at invite time.** Rejected by Jørgen: admin
  shouldn't be on the hook for inventing data they don't know.
- **C — Guest players decoupled from `users`.** Schema split, RLS rewrite,
  scoring ownership questions. Deferred until there's a real demand for
  non-registered participants.
- **B (chosen) — Pre-create `public.users` rows on `auth.users` insert and
  gate publishing.** Smallest schema delta, no FK changes (`game_players`
  keeps pointing at `public.users.id`), and the "ghost" state lives in a
  single nullable timestamp column.

## Acceptance criteria

1. Picker shows all 14 of Jørgen's current invitees (5 pending + 9
   registered) in the edit page for an existing draft.
2. Pending rows render with email + grey `Venter på registrering` pill, no
   HCP shown.
3. Saving a draft with pending players succeeds; the draft persists with the
   pending players in `game_players`.
4. Trying to publish that draft (Publiser-knappen) fails with the Norwegian
   error banner listing the pending emails by address. Game stays in
   `status = 'draft'`.
5. Once those invitees complete `/complete-profile`, retrying Publiser
   succeeds and the game moves to `status = 'scheduled'`.
6. Trying to start a scheduled game while any roster player is still pending
   is rejected by the same gate (defence in depth, in case publishing was
   bypassed).
7. Existing 9 registered users in production have
   `profile_completed_at = created_at` after backfill — they keep behaving
   exactly as before.
8. New auth.users inserts going forward automatically get a placeholder
   `public.users` row via the trigger.

## Files expected to change

Migration:
- `supabase/migrations/0014_pending_users.sql` — new

Server logic:
- `app/admin/games/[id]/edit/page.tsx` — picker query includes pending flag
- `app/admin/games/new/page.tsx` — same
- `app/admin/games/[id]/edit/actions.ts` — publish/update guards
- `app/admin/games/new/actions.ts` — publish guard
- `app/admin/games/[id]/StartGameButton.tsx` *or* its server action — start
  guard (defence in depth)
- `app/complete-profile/page.tsx` — change existence check to
  `profile_completed_at IS NOT NULL`
- `app/complete-profile/actions.ts` — stamp `profile_completed_at`

Client form:
- `app/admin/games/new/GameForm.tsx` — render pending players distinctly
  (`PlayerOption` type gains a `pending: boolean` field)

Tests:
- Unit test for the publish guard (rejects when pending players in roster)
- Smoke check via Supabase MCP after migration: verify the 5 known pending
  emails now show up in the picker query

## Risks and mitigations

- **Risk:** Trigger fires on every new auth user including admin self-signup.
  → Already idempotent: `on conflict (id) do nothing`. Existing
  `/complete-profile` flow becomes a no-op for the placeholder row insert
  and instead updates the existing row.
- **Risk:** Other code paths assume `public.users.name` is always non-null
  (rendering, sorting, queries). → Audit grep for `users.name` references
  before shipping; render-time fallbacks where needed (`name ?? email`).
- **Risk:** RLS — non-admins might now see placeholder rows for users they
  share games with. → That's fine: the rendering layer handles "no name yet"
  gracefully, and the only place this matters is the flight roster on the
  game detail page (which only shows once the game is published — and
  publishing gates pending players out by design).

## Versioning

User-visible change → bump `package.json` and CHANGELOG.md in the same
commit as the implementation. PATCH or MINOR depending on whether the
implementer judges this a new feature (MINOR) or a workflow fix (PATCH).
Leaning MINOR — this enables a workflow that wasn't possible before.
