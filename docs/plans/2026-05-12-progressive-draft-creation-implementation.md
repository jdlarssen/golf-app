# Progressive Draft Creation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use @superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admin save a tournament draft with just a name; fill in the rest progressively. Players who are added to the draft see it on home with whatever info is filled in. Publishing (draft → scheduled) keeps today's strict validation.

**Architecture:** One form with two buttons. «Lagre utkast» needs only a name; «Publiser» requires everything (course + tee-box + 8 balanced players + tee-off time). DB makes `course_id` and `tee_box_id` nullable. Shared `lib/games/gamePayload.ts` carries the mode-aware validation used by both the new-game and edit-game server actions.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), Tailwind v4, Vitest + Testing Library.

**Design doc:** [2026-05-12-progressive-draft-creation-design.md](./2026-05-12-progressive-draft-creation-design.md)

---

## Phase 1 — Foundation: schema + shared payload module

Migration first, then extract the duplicated payload-parsing helper into `lib/games/gamePayload.ts` with mode-aware validation. After this phase, no user-visible behavior changes; we've just cleaned up the foundation.

### Task 1.1: Migration 0011 (relax nullability on games.course_id / tee_box_id)

**Files:**
- Create: `supabase/migrations/0011_relax_game_drafts.sql`

**Step 1: Write the migration**

```sql
-- Make course/tee-box optional so admins can save partial drafts.
-- A draft with `status = 'draft'` may have either column NULL; the publish
-- step still enforces both NOT NULL via application-layer validation
-- (see lib/games/gamePayload.ts).

alter table public.games
  alter column course_id drop not null,
  alter column tee_box_id drop not null;

comment on column public.games.course_id is
  'Course chosen for the round. Required for status=scheduled and beyond; nullable while status=draft.';
comment on column public.games.tee_box_id is
  'Tee-box chosen for the round. Required for status=scheduled and beyond; nullable while status=draft.';
```

**Step 2: Apply via Supabase MCP**

Use `mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration` with the file contents. Project id from memory: `glofubopddkjhymcbaph`. Migration name: `relax_game_drafts`.

**Step 3: Verify columns are nullable**

Run via `mcp__36be25a6-2d72-41c3-a675-2352133ed510__execute_sql`:

```sql
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'games'
  and column_name in ('course_id', 'tee_box_id');
```

Expected: both rows show `is_nullable = 'YES'`.

**Step 4: Commit**

```bash
git add supabase/migrations/0011_relax_game_drafts.sql
git commit -m "feat(db): allow null course_id/tee_box_id on games for drafts"
```

---

### Task 1.2: Tests for `parseOsloDateTimeLocal` (lift before extracting)

The Oslo DST helper has no tests today even though it's about to be shared by three actions. Lock its behavior first, then extract.

**Files:**
- Create: `lib/games/gamePayload.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { parseOsloDateTimeLocal } from './gamePayload';

describe('parseOsloDateTimeLocal', () => {
  it('parses summer (CEST/+02:00) wall-clock to UTC', () => {
    // 2026-06-15 09:00 Oslo = 07:00 UTC
    expect(parseOsloDateTimeLocal('2026-06-15T09:00')).toBe(
      '2026-06-15T07:00:00.000Z',
    );
  });

  it('parses winter (CET/+01:00) wall-clock to UTC', () => {
    // 2026-12-15 09:00 Oslo = 08:00 UTC
    expect(parseOsloDateTimeLocal('2026-12-15T09:00')).toBe(
      '2026-12-15T08:00:00.000Z',
    );
  });

  it('throws on a malformed string', () => {
    expect(() => parseOsloDateTimeLocal('not a date')).toThrow();
  });
});
```

**Step 2: Run, expect FAIL with "Cannot find module ./gamePayload"**

```bash
npx vitest run lib/games/gamePayload.test.ts
```

**Step 3: Create `lib/games/gamePayload.ts` with the helper**

```ts
// Parse a 'YYYY-MM-DDTHH:mm' string (as emitted by <input type="datetime-local">)
// as wall-clock time in Europe/Oslo and return the corresponding UTC ISO string.
//
// Strategy: ask Intl what the timezone-name short label is for the given Oslo
// wall-clock date (CET = GMT+1, CEST = GMT+2). Append the matching offset
// suffix and let `new Date()` parse the offset-bearing string into UTC.
// This handles DST transitions correctly for any non-ambiguous wall-clock
// instant. (Ambiguous instants — the autumn fall-back hour — are vanishingly
// rare for golf tee-offs and fall back to the post-transition offset.)
export function parseOsloDateTimeLocal(s: string): string {
  const [datePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    timeZoneName: 'short',
  });
  const tzPart = fmt
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = tzPart === 'GMT+2' ? '+02:00' : '+01:00';
  const result = new Date(`${s}:00${offset}`);
  if (Number.isNaN(result.getTime())) {
    throw new RangeError(`Invalid Oslo datetime-local: ${s}`);
  }
  return result.toISOString();
}
```

**Step 4: Run, expect PASS**

```bash
npx vitest run lib/games/gamePayload.test.ts
```

Expected: 3 tests pass.

**Step 5: Commit**

```bash
git add lib/games/gamePayload.ts lib/games/gamePayload.test.ts
git commit -m "feat(games): extract parseOsloDateTimeLocal with DST tests"
```

---

### Task 1.3: Add `buildGameInsertPayload` with mode-aware validation

Move the validator next, with a `mode` parameter that switches between loose (draft) and strict (publish) checks.

**Files:**
- Modify: `lib/games/gamePayload.ts`
- Modify: `lib/games/gamePayload.test.ts`

**Step 1: Add the failing tests**

Append to `lib/games/gamePayload.test.ts`:

```ts
import { buildGameInsertPayload } from './gamePayload';

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe('buildGameInsertPayload (draft mode)', () => {
  it('requires only name', () => {
    const result = buildGameInsertPayload(fd({ name: 'Vinter-cup' }), 'draft');
    expect(result.errorCode).toBeUndefined();
    expect(result.name).toBe('Vinter-cup');
    expect(result.course_id).toBeNull();
    expect(result.tee_box_id).toBeNull();
    expect(result.players).toEqual([]);
  });

  it('rejects empty name', () => {
    const result = buildGameInsertPayload(fd({ name: '   ' }), 'draft');
    expect(result.errorCode).toBe('name_required');
  });

  it('accepts a partial player list without team-balance check', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test',
        player_0_id: 'u1',
        player_0_team: '1',
        player_0_flight: '1',
        player_1_id: 'u2',
        player_1_team: '1',
        player_1_flight: '1',
        player_2_id: 'u3',
        player_2_team: '2',
        player_2_flight: '1',
      }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(3);
  });

  it('still rejects duplicate players', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test',
        player_0_id: 'u1',
        player_0_team: '1',
        player_0_flight: '1',
        player_1_id: 'u1',
        player_1_team: '2',
        player_1_flight: '1',
      }),
      'draft',
    );
    expect(result.errorCode).toBe('duplicate_player');
  });

  it('coerces empty course/tee-box to null without error', () => {
    const result = buildGameInsertPayload(
      fd({ name: 'Test', course_id: '', tee_box_id: '' }),
      'draft',
    );
    expect(result.errorCode).toBeUndefined();
    expect(result.course_id).toBeNull();
    expect(result.tee_box_id).toBeNull();
  });
});

describe('buildGameInsertPayload (publish mode)', () => {
  it('requires course', () => {
    const result = buildGameInsertPayload(fd({ name: 'Test' }), 'publish');
    expect(result.errorCode).toBe('course_required');
  });

  it('requires 8 balanced players', () => {
    const result = buildGameInsertPayload(
      fd({
        name: 'Test',
        course_id: 'c1',
        tee_box_id: 't1',
        player_0_id: 'u1',
        player_0_team: '1',
        player_0_flight: '1',
      }),
      'publish',
    );
    expect(result.errorCode).toBe('players_required');
  });

  it('accepts a full balanced lineup', () => {
    const entries: Record<string, string> = {
      name: 'Test',
      course_id: 'c1',
      tee_box_id: 't1',
    };
    for (let i = 0; i < 8; i++) {
      entries[`player_${i}_id`] = `u${i}`;
      entries[`player_${i}_team`] = String(Math.floor(i / 2) + 1);
      entries[`player_${i}_flight`] = String(((i / 2) | 0) < 2 ? 1 : 2);
    }
    const result = buildGameInsertPayload(fd(entries), 'publish');
    expect(result.errorCode).toBeUndefined();
    expect(result.players).toHaveLength(8);
  });
});
```

**Step 2: Run, expect FAIL**

```bash
npx vitest run lib/games/gamePayload.test.ts
```

Expected: import error for `buildGameInsertPayload`.

**Step 3: Implement in `lib/games/gamePayload.ts`**

Append to the module:

```ts
export type GamePlayerInput = {
  user_id: string;
  team_number: number;
  flight_number: number;
};

export type PayloadMode = 'draft' | 'publish';

export type ParsedPayload = {
  name: string;
  course_id: string | null;
  tee_box_id: string | null;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  players: GamePlayerInput[];
  errorCode?: string;
};

export function buildGameInsertPayload(
  formData: FormData,
  mode: PayloadMode,
): ParsedPayload {
  const name = String(formData.get('name') ?? '').trim();
  const rawCourse = String(formData.get('course_id') ?? '').trim();
  const rawTee = String(formData.get('tee_box_id') ?? '').trim();
  const rawAllowance = formData.get('hcp_allowance_pct');
  const hcp_allowance_pct = rawAllowance === null || rawAllowance === ''
    ? 100
    : Number(rawAllowance);
  const require_peer_approval =
    formData.get('require_peer_approval') === 'on';

  const base: ParsedPayload = {
    name,
    course_id: rawCourse || null,
    tee_box_id: rawTee || null,
    hcp_allowance_pct: Number.isFinite(hcp_allowance_pct)
      ? hcp_allowance_pct
      : 100,
    require_peer_approval,
    players: [],
  };

  if (!name) return { ...base, errorCode: 'name_required' };

  if (mode === 'publish') {
    if (!base.course_id) return { ...base, errorCode: 'course_required' };
    if (!base.tee_box_id) return { ...base, errorCode: 'tee_required' };
    if (
      !Number.isInteger(base.hcp_allowance_pct) ||
      base.hcp_allowance_pct < 0 ||
      base.hcp_allowance_pct > 100
    ) {
      return { ...base, errorCode: 'bad_allowance' };
    }
  }

  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  const expectedSlots = mode === 'publish' ? 8 : 8; // scan all 8 slots; draft accepts gaps
  for (let i = 0; i < expectedSlots; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) {
      if (mode === 'publish') {
        return { ...base, errorCode: 'players_required' };
      }
      continue; // draft: skip empty slot
    }
    if (seen.has(user_id)) {
      return { ...base, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    const team_number = Number(formData.get(`player_${i}_team`));
    const flight_number = Number(formData.get(`player_${i}_flight`));
    if (!Number.isInteger(team_number) || team_number < 1 || team_number > 4) {
      return { ...base, errorCode: 'bad_team' };
    }
    if (
      !Number.isInteger(flight_number) ||
      flight_number < 1 ||
      flight_number > 4
    ) {
      return { ...base, errorCode: 'bad_flight' };
    }
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    const teamCounts = new Map<number, number>();
    for (const p of players) {
      teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
    }
    for (let t = 1; t <= 4; t++) {
      if (teamCounts.get(t) !== 2) {
        return { ...base, errorCode: 'team_balance' };
      }
    }
  }

  return { ...base, players };
}
```

**Step 4: Run, expect PASS**

```bash
npx vitest run lib/games/gamePayload.test.ts
```

Expected: all 11 tests pass.

**Step 5: Commit**

```bash
git add lib/games/gamePayload.ts lib/games/gamePayload.test.ts
git commit -m "feat(games): mode-aware buildGameInsertPayload (draft/publish)"
```

---

### Task 1.4: Wire new + edit actions to the shared module

Both server-action files duplicate the helper byte-for-byte. Replace both with imports from `lib/games/gamePayload.ts`. No behavior change yet — both still call with `mode: 'publish'` semantics until Phase 2.

**Files:**
- Modify: `app/admin/games/new/actions.ts`
- Modify: `app/admin/games/[id]/edit/actions.ts`

**Step 1: Replace the helper imports in `new/actions.ts`**

Delete lines 10–114 (the `GamePlayerInput`, `ParsedPayload`, `parseOsloDateTimeLocal`, `buildGameInsertPayload` declarations).

Add at the top:

```ts
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
  type GamePlayerInput,
} from '@/lib/games/gamePayload';
```

Inside `createGameInternal`, update the call:

```ts
const payload = buildGameInsertPayload(
  formData,
  mode === 'publish' ? 'publish' : 'publish',
);
```

(Keep `'publish'` for both modes for now — Phase 2 will switch draft to loose mode after we wire the rest.)

Then handle the new nullable types:

```ts
.insert({
  name: payload.name,
  course_id: payload.course_id,  // may be null after Phase 2
  tee_box_id: payload.tee_box_id,
  // ...
})
```

**Step 2: Replace the helper imports in `edit/actions.ts`**

Delete lines 7–105 of the original (TODO + helper duplicates) and update:

```ts
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
} from '@/lib/games/gamePayload';
```

Replace the call:

```ts
const payload = buildGameInsertPayload(formData, 'publish');
```

**Step 3: Run lint + typecheck + tests**

```bash
npx eslint && npx tsc --noEmit && npx vitest run lib/games/gamePayload.test.ts
```

Expected: clean lint, clean tsc, 11 tests pass.

**Step 4: Verify no regression in existing flows**

Existing scheduled-game create and edit flows still call with `'publish'` mode, so validation is byte-equivalent to before.

**Step 5: Commit**

```bash
git add app/admin/games/new/actions.ts app/admin/games/[id]/edit/actions.ts
git commit -m "refactor(games): use shared gamePayload module for new + edit actions"
```

---

### Task 1.5: Push Phase 1 and verify in prod

```bash
git push origin HEAD:main
```

Then on iPhone Safari:
1. Open `/admin/games/new`. Fill out a full valid game, click «Lagre og publiser». Should still work exactly as before.
2. Open the resulting `/admin/games/<id>/edit`. Save changes. Should still work.

No user-visible behavior should differ. If anything regressed, halt and debug.

---

## Phase 2 — Loosen draft validation

Now actually let drafts save with just a name. Server-side first; UI still enforces full validation until Phase 4.

### Task 2.1: Switch `createGameDraft` to draft mode + handle nullable columns

**Files:**
- Modify: `app/admin/games/new/actions.ts`

**Step 1: Write the failing test**

Add `lib/games/gamePayload.test.ts` already covers parser behavior. For action-level behavior, write an integration-shaped unit test:

Skip server-action testing this iteration (it requires mocking the entire Supabase + redirect stack). The parser tests in Task 1.3 already cover the validation contract end-to-end. Move to implementation.

**Step 2: Update `createGameInternal`**

In `app/admin/games/new/actions.ts`:

```ts
const payload = buildGameInsertPayload(formData, mode);
```

(was: `buildGameInsertPayload(formData, 'publish')` from Task 1.4)

The INSERT must now permit `null` columns:

```ts
.insert({
  name: payload.name,
  course_id: payload.course_id,            // string | null
  tee_box_id: payload.tee_box_id,          // string | null
  hcp_allowance_pct: payload.hcp_allowance_pct,
  require_peer_approval: payload.require_peer_approval,
  status: mode === 'publish' ? 'scheduled' : 'draft',
  scheduled_tee_off_at: scheduledTeeOffAt, // already nullable
  created_by: user.id,
  started_at: null,
})
```

**Step 3: Update the tee-off block to skip the publish check when in draft mode**

The existing block already handles this — for `mode === 'draft'`, malformed tee-off falls through to `null` silently. Verify lines 134–156 of `new/actions.ts` are intact after the Task 1.4 refactor.

**Step 4: Run lint + typecheck**

```bash
npx eslint && npx tsc --noEmit
```

Expected: clean.

**Step 5: Commit**

```bash
git add app/admin/games/new/actions.ts
git commit -m "feat(games): createGameDraft accepts name-only payloads"
```

---

### Task 2.2: Push Phase 2 and verify the action accepts loose drafts

```bash
git push origin HEAD:main
```

In prod (or via SQL once data lands), confirm:

```sql
select id, name, status, course_id, tee_box_id
from games
where status = 'draft'
order by created_at desc
limit 5;
```

UI still gates on `canSubmit` so you can't yet create a name-only draft from the browser — that comes in Phase 4. Verify the parser test suite stays green.

---

## Phase 3 — Edit draft + publish-from-draft

Extend `updateGameAction` so it can handle three sub-flows: save a draft as draft, publish a draft, edit an already-scheduled game.

### Task 3.1: Split `updateGameAction` into three exported actions

**Files:**
- Modify: `app/admin/games/[id]/edit/actions.ts`

**Step 1: Define the three actions**

Replace the existing `updateGameAction` with three thin wrappers around a shared internal helper:

```ts
export async function saveDraftAction(gameId: string, formData: FormData) {
  await updateGameInternal(gameId, formData, 'save_draft');
}

export async function publishFromDraftAction(
  gameId: string,
  formData: FormData,
) {
  await updateGameInternal(gameId, formData, 'publish');
}

export async function updateScheduledAction(
  gameId: string,
  formData: FormData,
) {
  await updateGameInternal(gameId, formData, 'update_scheduled');
}
```

`updateGameInternal` switches:

```ts
type UpdateMode = 'save_draft' | 'publish' | 'update_scheduled';

async function updateGameInternal(
  gameId: string,
  formData: FormData,
  mode: UpdateMode,
) {
  const payloadMode = mode === 'save_draft' ? 'draft' : 'publish';
  const payload = buildGameInsertPayload(formData, payloadMode);

  if (payload.errorCode) {
    redirect(`/admin/games/${gameId}/edit?error=${payload.errorCode}`);
  }

  // tee-off: required for publish + update_scheduled, optional for save_draft
  let scheduledTeeOffAt: string | null = null;
  const rawTeeOff = String(formData.get('scheduled_tee_off_at') ?? '').trim();
  if (rawTeeOff) {
    try {
      scheduledTeeOffAt = parseOsloDateTimeLocal(rawTeeOff);
    } catch {
      if (mode !== 'save_draft') {
        redirect(`/admin/games/${gameId}/edit?error=tee_off_required`);
      }
      scheduledTeeOffAt = null;
    }
  } else if (mode !== 'save_draft') {
    redirect(`/admin/games/${gameId}/edit?error=tee_off_required`);
  }

  const supabase = await getServerClient();
  // ... auth + admin-check (unchanged)

  const allowedFromStatus = mode === 'update_scheduled' ? 'scheduled' : 'draft';
  const nextStatus = mode === 'publish' ? 'scheduled' : allowedFromStatus;

  const { data: updated, error: updateError } = await supabase
    .from('games')
    .update({
      name: payload.name,
      course_id: payload.course_id,
      tee_box_id: payload.tee_box_id,
      scheduled_tee_off_at: scheduledTeeOffAt,
      hcp_allowance_pct: payload.hcp_allowance_pct,
      require_peer_approval: payload.require_peer_approval,
      status: nextStatus,
    })
    .eq('id', gameId)
    .eq('status', allowedFromStatus)
    .select('id')
    .single();

  if (updateError || !updated) {
    redirect(`/admin/games/${gameId}?error=not_editable`);
  }

  // Replace roster (same delete+insert pattern as today)
  // ... unchanged

  redirect(
    `/admin/games/${gameId}?status=${mode === 'publish' ? 'scheduled' : 'updated'}`,
  );
}
```

**Step 2: Update the edit page to dispatch the right action**

In `app/admin/games/[id]/edit/page.tsx` (find the file and adjust):

- If current `games.status === 'draft'`: pass both `saveDraftAction` (for «Lagre utkast») and `publishFromDraftAction` (for «Publiser»)
- If `games.status === 'scheduled'`: pass `updateScheduledAction` (for «Lagre endringer»)

Concrete wiring depends on how `GameForm` accepts these. Phase 4 reworks that contract — for now, keep `updateScheduledAction` exported under the old name `updateGameAction` as a re-export so the existing edit page keeps compiling:

```ts
export { updateScheduledAction as updateGameAction } from './actions';
```

**Step 3: Run lint + typecheck**

```bash
npx eslint && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add 'app/admin/games/[id]/edit/actions.ts'
git commit -m "feat(games): edit action handles save-draft and publish-from-draft"
```

---

## Phase 4 — GameForm UI: discriminated mode + draft button + helper text

Now the form actually lets admin save a name-only draft, and the «Publiser»-button explains what's missing.

### Task 4.1: Refactor GameForm props to discriminated union

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx`

**Step 1: Define the mode types at the top of the file**

```ts
type GameFormMode =
  | {
      kind: 'create';
      createDraftAction: (formData: FormData) => Promise<void>;
      createAndPublishAction: (formData: FormData) => Promise<void>;
    }
  | {
      kind: 'edit-draft';
      gameId: string;
      saveDraftAction: (gameId: string, formData: FormData) => Promise<void>;
      publishAction: (gameId: string, formData: FormData) => Promise<void>;
    }
  | {
      kind: 'edit-scheduled';
      gameId: string;
      updateAction: (gameId: string, formData: FormData) => Promise<void>;
    };

type Props = {
  courses: CourseOption[];
  players: PlayerOption[];
  mode: GameFormMode;
  initialValues?: InitialValues;
};
```

**Step 2: Update the function signature**

Replace lines 111–135 (the function declaration + runtime guards) with:

```ts
export function GameForm({ courses, players, mode, initialValues }: Props) {
  // ...
}
```

The discriminated union makes the runtime guard unnecessary — TypeScript guarantees the right shape per mode at call site.

**Step 3: Replace the submit section (lines 652–688) with mode-aware CTAs**

```tsx
<section className="space-y-3 pt-2">
  {mode.kind === 'edit-scheduled' && (
    <Button
      type="submit"
      formAction={mode.updateAction.bind(null, mode.gameId)}
      className="w-full"
      disabled={!canPublish}
    >
      Lagre endringer
    </Button>
  )}

  {mode.kind === 'create' && (
    <>
      <Button
        type="submit"
        formAction={mode.createAndPublishAction}
        className="w-full"
        disabled={!canPublish}
      >
        Publiser
      </Button>
      {!canPublish && (
        <p className="text-xs text-muted text-center">
          Mangler: {missingForPublish.join(', ')}
        </p>
      )}
      <Button
        type="submit"
        variant="secondary"
        formAction={mode.createDraftAction}
        className="w-full"
        disabled={name.trim() === ''}
      >
        Lagre utkast
      </Button>
    </>
  )}

  {mode.kind === 'edit-draft' && (
    <>
      <Button
        type="submit"
        formAction={mode.publishAction.bind(null, mode.gameId)}
        className="w-full"
        disabled={!canPublish}
      >
        Publiser
      </Button>
      {!canPublish && (
        <p className="text-xs text-muted text-center">
          Mangler: {missingForPublish.join(', ')}
        </p>
      )}
      <Button
        type="submit"
        variant="secondary"
        formAction={mode.saveDraftAction.bind(null, mode.gameId)}
        className="w-full"
        disabled={name.trim() === ''}
      >
        Lagre utkast
      </Button>
    </>
  )}
</section>
```

**Step 4: Compute `missingForPublish`**

Add near the other derived state (around line 327):

```ts
const missingForPublish: string[] = [];
if (courseId === '') missingForPublish.push('bane');
if (teeBoxId === '') missingForPublish.push('tee-boks');
if (!hasTeeOff) missingForPublish.push('tee-off-tid');
if (selectedPlayerIds.length < 8) {
  const remaining = 8 - selectedPlayerIds.length;
  missingForPublish.push(`${remaining} ${remaining === 1 ? 'spiller' : 'spillere'}`);
} else if (!teamsComplete) {
  missingForPublish.push('lag-fordeling');
} else if (!flightsComplete) {
  missingForPublish.push('flight-fordeling');
}
if (!allowanceValid) missingForPublish.push('gyldig HCP-allowance');
```

**Step 5: Update the call sites**

In `app/admin/games/new/page.tsx`, pass:

```tsx
<GameForm
  courses={courses}
  players={players}
  mode={{
    kind: 'create',
    createDraftAction: createGameDraft,
    createAndPublishAction: createAndPublishGame,
  }}
/>
```

In `app/admin/games/[id]/edit/page.tsx`, branch on `game.status`:

```tsx
{game.status === 'draft' ? (
  <GameForm
    courses={courses}
    players={players}
    initialValues={initial}
    mode={{
      kind: 'edit-draft',
      gameId: id,
      saveDraftAction,
      publishAction: publishFromDraftAction,
    }}
  />
) : (
  <GameForm
    courses={courses}
    players={players}
    initialValues={initial}
    mode={{
      kind: 'edit-scheduled',
      gameId: id,
      updateAction: updateScheduledAction,
    }}
  />
)}
```

**Step 6: Run lint + typecheck**

```bash
npx eslint && npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add app/admin/games/new/GameForm.tsx app/admin/games/new/page.tsx 'app/admin/games/[id]/edit/page.tsx'
git commit -m "feat(games): GameForm discriminated mode + missing-fields helper"
```

---

### Task 4.2: Push Phase 4 and verify in prod

```bash
git push origin HEAD:main
```

Manual smoke test on iPhone Safari:
1. Open `/admin/games/new`. Type only a name. «Lagre utkast» should be enabled, «Publiser» disabled with helper text «Mangler: bane, tee-boks, tee-off-tid, 8 spillere».
2. Click «Lagre utkast». Should redirect to `/admin/games/<id>?status=draft_created`.
3. Open the new game's edit page. Should see only «Lagre utkast» and «Publiser».
4. Fill in the missing fields. Helper text shrinks. Click «Publiser». Should redirect with `status=scheduled`.

---

## Phase 5 — Home card: progressive disclosure for drafts

### Task 5.1: Extend home query to include null course handling

**Files:**
- Modify: `app/page.tsx`

**Step 1: Adjust the `GameRow` type and query**

The existing type allows `courses: { name: string } | null`. Keep it. Also pull `scheduled_tee_off_at`:

Change line 94 to:

```ts
'game_id, team_number, flight_number, games!inner(id, name, status, ended_at, scheduled_tee_off_at, courses(name))',
```

And update the `GameRow` type:

```ts
type GameRow = {
  game_id: string;
  team_number: number;
  flight_number: number;
  games: {
    id: string;
    name: string;
    status: 'draft' | 'scheduled' | 'active' | 'finished';
    ended_at: string | null;
    scheduled_tee_off_at: string | null;
    courses: { name: string } | null;
  } | null;
};
```

**Step 2: Update the card component to render conditionally**

Find the GameCard render (around line 417). Render lines only when their data is non-null:

```tsx
{game.courses?.name && (
  <p className="text-sm text-muted">{game.courses.name}</p>
)}
{game.scheduled_tee_off_at && (
  <p className="text-sm text-muted tabular-nums">
    {formatOsloDateTime(game.scheduled_tee_off_at)}
  </p>
)}
```

**Step 3: Add `formatOsloDateTime` helper**

Either add inline at top of `app/page.tsx` or extract to `lib/games/datetime.ts`. For now, inline:

```ts
function formatOsloDateTime(iso: string): string {
  return new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
```

**Step 4: Run lint + typecheck**

```bash
npx eslint && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): progressive disclosure on upcoming-game cards"
```

---

### Task 5.2: Push Phase 5 and verify

```bash
git push origin HEAD:main
```

Test as a player who has been added to a name-only draft:
1. Open `/`. The card shows the game name + status pill «Utkast», no course row, no date row.
2. Edit the draft as admin to add a course. Refresh as player. Course row now visible.
3. Add tee-off-time. Refresh. Date row now visible.

---

## Phase 6 — Game-detail screen: draft mode

### Task 6.1: Add draft banner + handle null course/tee-off in venterom

**Files:**
- Modify: `app/games/[id]/page.tsx`

**Step 1: Identify the page's status-branching logic**

The page renders different content based on `game.status`. Locate the branch for `'scheduled'` and the `'draft'` case (might fall through to a default).

**Step 2: Add draft handling**

```tsx
{game.status === 'draft' && (
  <div className="mb-4">
    <Banner tone="warning">
      Utkast — admin planlegger fortsatt. Detaljer kan endre seg.
    </Banner>
  </div>
)}
```

**Step 3: Make the course block conditional**

Wherever the page renders course info:

```tsx
{game.course && (
  <CourseInfoCard course={game.course} teeBox={game.tee_box} />
)}
```

If no `course`, omit.

**Step 4: Make the tee-off block conditional**

```tsx
{game.scheduled_tee_off_at ? (
  <TeeOffCountdown teeOffAt={game.scheduled_tee_off_at} />
) : game.status === 'draft' ? (
  <p className="text-sm text-muted">Tidspunkt ikke avklart enda.</p>
) : null}
```

**Step 5: Filter the teams list to only render teams with 1+ player**

Find the team-rendering loop:

```tsx
{[1, 2, 3, 4]
  .filter((teamNum) => players.some((p) => p.team_number === teamNum))
  .map((teamNum) => (
    <TeamBlock key={teamNum} ... />
  ))}
```

Show «Spillere kommer» as fallback when `players.length === 0`:

```tsx
{players.length === 0 ? (
  <p className="text-sm text-muted text-center py-4">Spillere kommer.</p>
) : (
  /* the .filter(...).map(...) above */
)}
```

**Step 6: Hide «Mitt scorekort»-CTA for drafts**

```tsx
{game.status !== 'draft' && (
  <ScorecardCTA gameId={game.id} />
)}
```

**Step 7: Run lint + typecheck**

```bash
npx eslint && npx tsc --noEmit
```

**Step 8: Commit**

```bash
git add 'app/games/[id]/page.tsx'
git commit -m "feat(games): draft mode on venterom with progressive disclosure"
```

---

### Task 6.2: Push Phase 6 and verify

```bash
git push origin HEAD:main
```

Verify on iPhone Safari as a player added to a name-only draft:
1. Navigate from home card. Draft banner shows at top.
2. No course, no tee-off, no team blocks (or «Spillere kommer» if 0 players).
3. No «Mitt scorekort»-CTA.
4. Edit as admin to add fields. Refresh — sections appear progressively.

---

## Phase 7 — Cleanup

### Task 7.1: Remove resolved TODOs

**Files:**
- Modify: `TODO.md`

Remove the two entries that this change resolves:
- `Extract lib/games/gamePayload.ts` (line ~80 in TODO.md)
- `Discriminated-union refactor of GameForm props` (line ~83)

**Commit:**

```bash
git add TODO.md
git commit -m "chore(todo): remove items resolved by progressive-draft work"
```

### Task 7.2: Final verification

```bash
npx eslint && npx tsc --noEmit && npx vitest run
```

Expected: clean lint, clean tsc, all green except pre-existing 7 SmartLink/useRouter failures.

### Task 7.3: Push final state and full prod sanity sweep

```bash
git push origin HEAD:main
```

Run the four-step verification:
1. Create a name-only draft → players see it
2. Edit progressively, watch player UI update
3. Publish from draft → player sees countdown
4. No regressions on existing scheduled flow

---

## Files touched

```
NEW   supabase/migrations/0011_relax_game_drafts.sql
NEW   lib/games/gamePayload.ts
NEW   lib/games/gamePayload.test.ts
MOD   app/admin/games/new/actions.ts
MOD   app/admin/games/[id]/edit/actions.ts
MOD   app/admin/games/[id]/edit/page.tsx
MOD   app/admin/games/new/GameForm.tsx
MOD   app/admin/games/new/page.tsx
MOD   app/page.tsx
MOD   app/games/[id]/page.tsx
MOD   TODO.md
```

## References

- @superpowers:executing-plans (how to step through this)
- @superpowers:test-driven-development (red → green → refactor for parser tests)
- @superpowers:verification-before-completion (run lint + tsc + tests after every task)
- @superpowers:systematic-debugging (if any task surfaces unexpected behavior)
- Design doc: [2026-05-12-progressive-draft-creation-design.md](./2026-05-12-progressive-draft-creation-design.md)
