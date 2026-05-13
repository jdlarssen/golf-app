# Pending Invitees in Player Picker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to include invitees who haven't completed registration in draft / scheduled games, while blocking publish + start until everyone's profile is filled in.

**Architecture:** Auto-create a placeholder `public.users` row on every `auth.users` insert via trigger. Track completion state with a new `profile_completed_at timestamptz`. The picker query exposes the pending flag; UI renders pending rows distinctly; publish + start server actions reject rosters containing any pending player.

**Tech Stack:** Postgres (Supabase) — migration via MCP; Next.js 16 App Router server actions; React 19 client components; Vitest for unit tests; Tailwind for UI tokens. Supabase MCP project id: `glofubopddkjhymcbaph`.

**Design doc:** `docs/plans/2026-05-13-pending-invitees-in-picker-design.md`.

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/0014_pending_users.sql`

**Step 1: Write the migration SQL**

```sql
-- 0014_pending_users.sql
-- Allow public.users rows to exist before the user has logged in and filled
-- in their profile. Auto-create them via trigger on auth.users insert so the
-- admin player picker can include invitees who haven't signed up yet.

-- 1. Relax NOT NULL on name. NULL == "invited but profile not yet filled in".
alter table public.users alter column name drop not null;

-- 2. Add the completion timestamp. NULL == pending registration.
alter table public.users add column profile_completed_at timestamptz;

-- 3. Backfill: every existing row was created via /complete-profile, so
--    treat them all as completed. Use created_at as the timestamp.
update public.users
set profile_completed_at = created_at
where profile_completed_at is null;

-- 4. Backfill placeholder rows for any auth.users without a public row.
--    Picks up the 5 known pending invitees (mia, sivert, martin, philip,
--    kristian) as well as any future stragglers from before this migration.
insert into public.users (id, email, hcp_index)
select au.id, au.email, 54.0
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;

-- 5. Auto-create placeholder rows for future auth.users inserts. Idempotent
--    via on conflict so it doesn't conflict with the existing
--    /complete-profile insert path during this migration window.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, hcp_index)
  values (new.id, new.email, 54.0)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
```

**Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool:
- name: `pending_users`
- query: (the SQL above)

Expected: migration applied without error.

**Step 3: Verify via MCP `execute_sql`**

```sql
select count(*) filter (where profile_completed_at is not null) as completed,
       count(*) filter (where profile_completed_at is null)     as pending,
       count(*) total
from public.users;
```

Expected: `completed = 9, pending = 5, total = 14`.

Also verify the 5 pending emails:

```sql
select email from public.users where profile_completed_at is null order by email;
```

Expected: spiller-a@example.com, spiller-b@example.com, spiller-c@example.com, spiller-d@example.com, spiller-e@example.com.

**Step 4: Commit**

```bash
git add supabase/migrations/0014_pending_users.sql
git commit -m "feat(db): track pending invitees with profile_completed_at + auto-create trigger"
```

Note: this is a schema-only change, no user-facing UI yet — but the trigger and column are user-affecting on the data layer. Bump `package.json` patch + add a CHANGELOG entry under "Added" because the commit-msg hook gates feat. Use:

```bash
npm version patch --no-git-tag-version
```

Update CHANGELOG.md with:

```markdown
## [0.4.2] - 2026-05-13

### Added
- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.
```

Then stage all three files (`supabase/migrations/0014_pending_users.sql`, `package.json`, `package-lock.json`, `CHANGELOG.md`) in one commit.

---

## Task 2: Pure-logic helper — pending player validator

**Files:**
- Create: `lib/games/pendingPlayers.ts`
- Test: `lib/games/pendingPlayers.test.ts`

This is a small helper called from three server actions (publish from `new/`, publish + update from `edit/`, start from `[id]/StartGameButton`). Centralising it makes the rule "all roster players must be non-pending" testable and DRY.

**Step 1: Write the failing test**

```typescript
// lib/games/pendingPlayers.test.ts
import { describe, it, expect } from 'vitest';
import { findPendingPlayers, type RosterPlayer } from './pendingPlayers';

describe('findPendingPlayers', () => {
  it('returns empty array when all players have completed profile', () => {
    const players: RosterPlayer[] = [
      { id: 'a', email: 'a@x.no', profile_completed_at: '2026-05-12T10:00:00Z' },
      { id: 'b', email: 'b@x.no', profile_completed_at: '2026-05-12T10:00:00Z' },
    ];
    expect(findPendingPlayers(players)).toEqual([]);
  });

  it('returns players whose profile_completed_at is null', () => {
    const players: RosterPlayer[] = [
      { id: 'a', email: 'a@x.no', profile_completed_at: null },
      { id: 'b', email: 'b@x.no', profile_completed_at: '2026-05-12T10:00:00Z' },
      { id: 'c', email: 'c@x.no', profile_completed_at: null },
    ];
    expect(findPendingPlayers(players)).toEqual([
      { id: 'a', email: 'a@x.no' },
      { id: 'c', email: 'c@x.no' },
    ]);
  });

  it('returns empty for empty roster', () => {
    expect(findPendingPlayers([])).toEqual([]);
  });
});
```

**Step 2: Run test, verify FAIL**

```bash
npm test -- lib/games/pendingPlayers.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// lib/games/pendingPlayers.ts
export type RosterPlayer = {
  id: string;
  email: string;
  profile_completed_at: string | null;
};

export type PendingPlayer = {
  id: string;
  email: string;
};

/**
 * Returns the subset of roster players whose profile is not yet completed.
 * Drives the publish / start gates: a non-empty result blocks the transition.
 */
export function findPendingPlayers(players: RosterPlayer[]): PendingPlayer[] {
  return players
    .filter((p) => p.profile_completed_at === null)
    .map((p) => ({ id: p.id, email: p.email }));
}
```

**Step 4: Run test, verify PASS**

```bash
npm test -- lib/games/pendingPlayers.test.ts
```

Expected: PASS, 3 tests.

**Step 5: Commit**

```bash
git add lib/games/pendingPlayers.ts lib/games/pendingPlayers.test.ts
git commit -m "test(games): add findPendingPlayers helper for roster gates"
```

(This is a `test:` commit — no version bump needed; pure logic with no user-visible effect yet.)

---

## Task 3: Picker query returns pending flag + email

**Files:**
- Modify: `app/admin/games/[id]/edit/page.tsx:201-234` (the `getOptions` cache function and `UserRow` / `PlayerOption` shapes)
- Modify: `app/admin/games/new/page.tsx` (parallel getOptions — locate via grep)
- Modify: `app/admin/games/new/GameForm.tsx:13-18` (add `pending: boolean`, `email: string` to `PlayerOption`)

**Step 1: Extend `PlayerOption` in GameForm.tsx**

```typescript
export type PlayerOption = {
  id: string;
  name: string | null;       // null while invitee hasn't completed profile
  nickname: string | null;
  hcp_index: number;
  email: string;
  pending: boolean;          // derived from profile_completed_at IS NULL
};
```

**Step 2: Update both `getOptions` functions to select the new columns**

In `app/admin/games/[id]/edit/page.tsx`, update the `UserRow` type and the supabase query:

```typescript
type UserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  email: string;
  profile_completed_at: string | null;
};

// ... inside getOptions:
supabase
  .from('users')
  .select('id, name, nickname, hcp_index, email, profile_completed_at')
  .order('profile_completed_at', { ascending: true, nullsFirst: false })
  .order('name', { ascending: true, nullsFirst: true })
  .returns<UserRow[]>(),
```

And the mapper:

```typescript
const playerOptions: PlayerOption[] = (usersResult.data ?? []).map((u) => ({
  id: u.id,
  name: u.name,
  nickname: u.nickname ?? null,
  hcp_index: Number(u.hcp_index),
  email: u.email,
  pending: u.profile_completed_at === null,
}));
```

Repeat the same edits in `app/admin/games/new/page.tsx` (search for `getOptions` — same pattern).

The ordering puts completed players first (by name), with pending ones appended at the end. This keeps the familiar order for the common case and groups invitees visually.

**Step 3: Type-check + build**

```bash
npm run lint && npm run build
```

Expected: PASS. If TypeScript complains about other consumers of `PlayerOption.name` being non-nullable, fix the call sites — the renderer in Task 4 is the main one.

**Step 4: Commit**

```bash
git add app/admin/games/[id]/edit/page.tsx app/admin/games/new/page.tsx app/admin/games/new/GameForm.tsx
git commit -m "refactor(picker): widen PlayerOption to carry pending + email"
```

(refactor — no user-visible change yet, so no version bump.)

---

## Task 4: Render pending players distinctly in picker

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx:367-375` (label functions)
- Modify: `app/admin/games/new/GameForm.tsx:537-559` (picker rendering)

**Step 1: Update label helpers to handle pending state**

Replace `playerLabel` and `shortName`:

```typescript
function playerLabel(p: PlayerOption): string {
  if (p.pending) {
    return p.email;
  }
  const displayName = p.name ?? p.email; // defensive — non-pending should always have name
  const hcp = p.hcp_index.toFixed(1);
  if (p.nickname) return `${displayName} «${p.nickname}» — HCP ${hcp}`;
  return `${displayName} — HCP ${hcp}`;
}

function shortName(p: PlayerOption): string {
  if (p.pending) return p.email;
  const displayName = p.name ?? p.email;
  return p.nickname ? `${displayName} «${p.nickname}»` : displayName;
}
```

**Step 2: Add pending pill in the picker row**

Modify the `<li>` block in section 2 (around line 540) so pending players get a muted pill on the right side:

```tsx
<li key={p.id}>
  <label
    className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border transition-colors ${checked ? 'border-primary bg-primary-soft' : 'border-border'} ${atCap ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={atCap}
      onChange={() => togglePlayer(p.id)}
      className="h-5 w-5 rounded border-border text-primary focus:ring-accent/40"
    />
    <span className="flex-1 text-sm text-text">
      {playerLabel(p)}
    </span>
    {p.pending && (
      <span
        className="shrink-0 rounded-full px-[7px] py-[3px] font-sans text-[9.5px] font-semibold uppercase"
        style={{
          letterSpacing: '0.16em',
          background: 'rgba(216, 155, 58, 0.18)',
          color: '#7a5410',
        }}
      >
        Venter
      </span>
    )}
  </label>
</li>
```

(Style values lifted from the existing `Venter` chip on `/admin/invitations` for visual consistency.)

**Step 3: Smoke-test in the browser**

Start dev server, open `http://localhost:3000/admin/games/<existing-draft-id>/edit`. Expected: all 14 players show — 9 with name + HCP, 5 with email + `Venter` pill.

```bash
npm run dev
```

Then check the page in a browser.

**Step 4: Commit**

```bash
git add app/admin/games/new/GameForm.tsx
git commit -m "feat(picker): show invited players with Venter pill in admin game picker"
```

This is a user-visible change → bump `package.json` minor (new visible workflow capability):

```bash
npm version minor --no-git-tag-version
```

Add CHANGELOG entry:

```markdown
## [0.5.0] - 2026-05-13

### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.
```

Stage `app/admin/games/new/GameForm.tsx` + `package.json` + `package-lock.json` + `CHANGELOG.md` in one commit. (The previous Task 3 refactor commit didn't need a bump; this one does.)

---

## Task 5: Server-side publish guard (new game)

**Files:**
- Modify: `app/admin/games/new/page.tsx:27` (ERROR_MESSAGES — same dict needs the new code; locate via grep)
- Modify: `app/admin/games/new/actions.ts` (createAndPublishGame path)

The form happily submits pending player IDs. The server action enforces the rule. Pattern: query `users` for the selected IDs' `profile_completed_at`, run `findPendingPlayers`, and on non-empty result redirect with the email list in the querystring.

**Step 1: Add the error code to the shared dict on `new/page.tsx`**

Find the `ERROR_MESSAGES` object (matches the one in `edit/page.tsx`). Add:

```typescript
pending_players:
  'Disse spillerne har ikke fullført registreringen ennå. De må logge inn og fylle inn navn + HCP før spillet kan publiseres.',
```

**Step 2: Add the guard in `createAndPublishGame`**

In `app/admin/games/new/actions.ts`, inside `createGameInternal` when `mode === 'publish'`, after the `payload` validation but before the game insert:

```typescript
if (mode === 'publish') {
  const { data: rosterUsers, error: rosterErr } = await supabase
    .from('users')
    .select('id, email, profile_completed_at')
    .in('id', payload.players.map((p) => p.user_id));

  if (rosterErr || !rosterUsers) {
    redirect('/admin/games/new?error=db_players');
  }

  const pending = findPendingPlayers(rosterUsers);
  if (pending.length > 0) {
    redirect('/admin/games/new?error=pending_players');
  }
}
```

Import:

```typescript
import { findPendingPlayers } from '@/lib/games/pendingPlayers';
```

Note: for the `new` flow the form is fresh — admin would need to actively pick pending players to trigger this. The guard is defence rather than primary UX. The detailed email list is shown on the **edit** path (Task 6) where pre-existing drafts are likelier to contain pending players.

**Step 3: Smoke-test**

Build, then in the browser try to create-and-publish a new game with at least one pending player selected. Expected: redirect back to `/admin/games/new?error=pending_players` with the Norwegian banner.

```bash
npm run build
```

**Step 4: Commit**

```bash
git add app/admin/games/new/actions.ts app/admin/games/new/page.tsx
git commit -m "feat(admin): block new-game publish when roster contains pending invitees"
```

Bump patch + CHANGELOG entry:

```bash
npm version patch --no-git-tag-version
```

CHANGELOG addition under existing `## [0.5.0]` block (same day):

```markdown
### Fixed
- Publisering av spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.
```

Stage all four files.

---

## Task 6: Publish + update guards on the edit path (with email list)

**Files:**
- Modify: `app/admin/games/[id]/edit/page.tsx:27-42` (ERROR_MESSAGES — add `pending_players` template that consumes the `emails` querystring)
- Modify: `app/admin/games/[id]/edit/actions.ts`

Pre-existing drafts are the high-volume case: admin saved a draft with pending players days earlier. We surface the offending emails explicitly so the admin knows whom to chase.

**Step 1: Add the parameterised error message**

In `app/admin/games/[id]/edit/page.tsx`, the `searchParams` type already accepts arbitrary keys via the `error` slot. Extend the page to also read an `emails` param and merge it into the rendered message. Add to `ERROR_MESSAGES`:

```typescript
pending_players:
  'Disse spillerne har ikke fullført registreringen ennå. De må logge inn og fylle inn navn + HCP før spillet kan publiseres.',
```

Then add a helper above the page component:

```typescript
function buildErrorMessage(
  errorCode: string | undefined,
  emails: string | undefined,
): string | undefined {
  if (!errorCode) return undefined;
  const base = ERROR_MESSAGES[errorCode];
  if (!base) return undefined;
  if (errorCode === 'pending_players' && emails) {
    return `${base.replace(' De må', `: ${emails}. De må`)}`;
  }
  return base;
}
```

And widen `SearchParams`:

```typescript
type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
}>;
```

In the page component:

```typescript
const errorMessage = buildErrorMessage(
  first(sp.error),
  first(sp.emails),
);
```

**Step 2: Add the guard in `updateGameInternal`**

In `app/admin/games/[id]/edit/actions.ts`, gate both `publish` and `update_scheduled` modes (draft save is always allowed):

```typescript
if (mode === 'publish' || mode === 'update_scheduled') {
  const { data: rosterUsers, error: rosterErr } = await supabase
    .from('users')
    .select('id, email, profile_completed_at')
    .in('id', payload.players.map((p) => p.user_id));

  if (rosterErr || !rosterUsers) {
    redirect(`/admin/games/${gameId}/edit?error=db_players`);
  }

  const pending = findPendingPlayers(rosterUsers);
  if (pending.length > 0) {
    const emails = encodeURIComponent(pending.map((p) => p.email).join(', '));
    redirect(`/admin/games/${gameId}/edit?error=pending_players&emails=${emails}`);
  }
}
```

Import:

```typescript
import { findPendingPlayers } from '@/lib/games/pendingPlayers';
```

**Step 3: Smoke-test**

Pick the existing draft in Jørgen's account, add one of the 5 pending invitees to a flight, save draft (allowed). Then click `Publiser` (or `Lagre endringer` for a scheduled game). Expected: red banner reading `Disse spillerne har ikke fullført registreringen ennå: spiller-c@example.com. De må logge inn og fylle inn navn + HCP før spillet kan publiseres.`

```bash
npm run dev
```

**Step 4: Commit**

```bash
git add app/admin/games/[id]/edit/actions.ts app/admin/games/[id]/edit/page.tsx
git commit -m "feat(admin): block draft publish/scheduled update when pending invitees are on roster"
```

Patch bump + CHANGELOG addition (same `## [0.5.x]` block):

```bash
npm version patch --no-git-tag-version
```

```markdown
### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.
```

---

## Task 7: Start game guard (defence in depth)

**Files:**
- Read: `app/admin/games/[id]/StartGameButton.tsx` — identify which server action it calls
- Modify: the corresponding server action to add the same gate

**Step 1: Locate the start action**

```bash
grep -rn "startGame\|status.*active\|started_at" app/admin/games/[id]/ | head
```

Identify the server action that transitions `scheduled` → `active`.

**Step 2: Add the gate before the status flip**

Inside that action, before updating `games.status`, run:

```typescript
const { data: rosterUsers, error: rosterErr } = await supabase
  .from('users')
  .select('id, email, profile_completed_at')
  .in('id', /* roster user_ids loaded from game_players */);

if (rosterErr || !rosterUsers) {
  redirect(`/admin/games/${gameId}?error=db_players`);
}

const pending = findPendingPlayers(rosterUsers);
if (pending.length > 0) {
  const emails = encodeURIComponent(pending.map((p) => p.email).join(', '));
  redirect(`/admin/games/${gameId}?error=pending_players&emails=${emails}`);
}
```

The roster `user_ids` come from a query against `game_players` already present (or add one if not). Mirror the message structure used in the edit page so the detail page can render the same error chunk — add the error-message helper to `[id]/page.tsx`'s `ERROR_MESSAGES` dict.

**Step 3: Smoke-test**

This path is hard to hit organically (publish gates it first). Verify via SQL: temporarily insert a pending player into a scheduled game's `game_players` (via MCP), then click `Start spill`. Expected: same Norwegian error message. Roll back the insertion afterward.

**Step 4: Commit**

```bash
git add app/admin/games/[id]/<start-action-file>.ts app/admin/games/[id]/page.tsx
git commit -m "feat(admin): defence-in-depth guard on Start spill for pending invitees"
```

Patch bump + CHANGELOG `### Fixed` line:

```markdown
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.
```

---

## Task 8: Update complete-profile to UPDATE instead of INSERT

**Files:**
- Modify: `app/complete-profile/page.tsx:36-46` (existence check)
- Modify: `app/complete-profile/actions.ts` (switch from insert to update + stamp profile_completed_at)

After Task 1, every authenticated user already has a `public.users` row (created by trigger). So `/complete-profile`'s current `insert` will fail with a unique violation. We need to change it to `update`.

**Step 1: Change the existence check on the page**

In `app/complete-profile/page.tsx`, replace the existing row check:

```typescript
const { data: existing } = await supabase
  .from('users')
  .select('profile_completed_at')
  .eq('id', userId)
  .maybeSingle();

if (existing?.profile_completed_at) {
  redirect('/');
}
```

**Step 2: Change the action from insert to update**

In `app/complete-profile/actions.ts`, replace the insert block:

```typescript
const { error } = await supabase
  .from('users')
  .update({
    name,
    nickname,
    hcp_index: hcpParsed,
    profile_completed_at: new Date().toISOString(),
  })
  .eq('id', user.id);

if (error) {
  redirect('/complete-profile?error=unknown');
}
```

Drop the `already_exists` error code if you're no longer using it. The 23505 special-case is gone — the trigger already created the row, and update is idempotent.

**Step 3: Smoke-test**

In Supabase, create a fresh auth user (via Dashboard or MCP). Visit `/login`, request OTP, sign in, land on `/complete-profile`, fill in fields, submit. Expected: `public.users` row for that user has `profile_completed_at` set, name + nickname + hcp populated.

```sql
-- Verify via MCP
select id, name, nickname, hcp_index, profile_completed_at
from public.users
where email = '<test-email>';
```

**Step 4: Commit**

```bash
git add app/complete-profile/page.tsx app/complete-profile/actions.ts
git commit -m "fix(profile): update existing users row in complete-profile (trigger pre-creates it)"
```

Patch bump + CHANGELOG:

```markdown
### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt.
```

---

## Task 9: Audit other `users.name` consumers for null-safety

**Files:** various — locate via grep

The migration drops `not null` on `name`. Anywhere code reads `users.name` and assumes a string risks blowing up on a pending row.

**Step 1: Find all callers**

```bash
grep -rn "\.name" app/ components/ lib/ \
  | grep -iE "users|user|player" \
  | grep -vE "\.test\.|/node_modules/|\.next/" \
  | head -50
```

Categorise: which read `users.name` from the DB? Which read a derived display name?

**Step 2: For each DB-reading site, add a fallback**

Pattern:

```typescript
const displayName = userRow.name ?? userRow.email;
```

Likely sites (verify):
- Leaderboard renderer
- Flight roster on game detail page
- Score-attribution copy ("X tastet et slag")
- Admin invitations page (already shows email, probably OK)

**Step 3: Type-check + visual smoke**

```bash
npm run lint && npm run build && npm run dev
```

Open the production-like flow as Jørgen → does anything render as `null`, `undefined`, or `[object Object]`?

**Step 4: Commit per site**

If multiple files, separate commits per logical area. Use:

```bash
git commit -m "fix(<area>): fall back to email when user name is null (pending invitee)"
```

Patch bump only on commits with user-visible rendering effect.

---

## Task 10: Final acceptance verification

**Step 1: Run all tests**

```bash
npm test
```

Expected: all green (40 existing scoring tests + 3 new pendingPlayers tests).

**Step 2: Run lint + build**

```bash
npm run lint && npm run build
```

Expected: clean.

**Step 3: Manual UAT on dev server**

1. Open `/admin/games/<existing-draft>/edit`. Confirm all 14 invitees show: 9 with name + HCP, 5 with email + `Venter` pill.
2. Select one pending invitee + three registered players. Save draft. Reload — selection persists.
3. Fill the remaining slots with registered players. Click `Publiser`. Expected: red banner listing the pending email(s).
4. Replace the pending player with a registered one. Click `Publiser` again. Expected: success, redirects to `/admin/games/<id>?status=scheduled`.
5. As one of the previously-pending users: log in via OTP, fill in `/complete-profile`. Expected: redirect to `/`, row is now non-pending.
6. Verify via MCP that `public.users.profile_completed_at` was stamped.

**Step 4: Push to main**

```bash
git push origin main
```

Vercel auto-deploys. Once live, repeat steps 1-4 against `tornygolf.no` with at least one real friend invitee.

**Step 5: Mark plan complete**

Add a `## Status` section at the top of this plan file: `Implemented and verified in production 2026-05-13.`

```bash
git add docs/plans/2026-05-13-pending-invitees-in-picker-implementation.md
git commit -m "docs(plans): mark pending-invitees plan complete"
```

(`docs:` prefix — no version bump.)

---

## Risks / known gotchas

- **Trigger collision with existing `/complete-profile` insert path.** Mitigated by `on conflict (id) do nothing` in the trigger and the switch to `update` in Task 8. During the deploy window between Task 1 (migration applies) and Task 8 (action switches to update), `complete-profile` would 23505-fail. Mitigate by deploying both within minutes (atomic-ish commit on main) or by leaving the trigger inactive until Task 8 lands. Simplest: implement Tasks 1 + 8 together in a single push.

- **Other code reading `name` as string.** Task 9 covers the audit. Type-system helps: `name: string | null` will surface most missed sites at build time.

- **RLS revealing placeholder rows to non-admin users.** Existing policy only shows other users who share a game. The only ways a non-admin sees a placeholder row are (a) admin saved a draft containing the pending invitee — non-admins can't see drafts, so harmless; (b) somehow a published game contains a pending invitee — Task 6+7 gates block this. So in practice non-admins never see placeholders.
