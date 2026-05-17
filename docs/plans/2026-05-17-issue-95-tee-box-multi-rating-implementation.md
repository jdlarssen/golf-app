# Issue #95 — Multi-rating tee-bokser — implementasjonsplan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `tee_boxes` fra én-rad-pr-(tee × gender) til én-rad-pr-tee med nullable per-gender rating-kolonner. Lar admin legge inn én fysisk tee én gang med valgfri kombinasjon av herre/dame/junior-ratings, og fylle ut manglende ratings senere.

**Architecture:** `tee_boxes` får 9 nullable rating-kolonner (`slope_${gender}`, `course_rating_${gender}`, `par_total_${gender}` for mens/ladies/juniors) med CHECK at minst én komplett gender-sett må være satt. `game_players.tee_box_id` (per-tee override fra v1.3.0) erstattes med `tee_gender` enum-flag. Course handicap kalkuleres pr. spiller via `getRatingForGender(tee, player.tee_gender)`.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + RLS, TypeScript, Vitest.

**Design doc:** [docs/plans/2026-05-17-issue-95-tee-box-multi-rating-design.md](2026-05-17-issue-95-tee-box-multi-rating-design.md)

**Issue:** https://github.com/jdlarssen/golf-app/issues/95

---

## Forutsetning: worktree er på main + v1.3.0

Verifisert ved planskriving: `git log -1` viser `ea5e29b feat(tee-boxes): ship v1.3.0`. `package.json` viser version `1.3.0`. Migrasjoner går opp til `0028_tee_box_gender.sql`.

## Commit-strategi

Samme mønster som v1.3.0: `chore(...)`-commits under bygging, én `feat(...)`-ship-commit til slutt med version bump + CHANGELOG.

Mål: v1.3.0 → **v1.4.0** (minor bump for ny datamodell + UX-forbedring).

1. **Task 1** → `build(db): tee_box multi-rating schema + game_players.tee_gender` — schema + data migration + types regen, ingen bump
2. **Task 2** → `chore(admin/courses): multi-rating tee-form` — ingen bump
3. **Task 3** → `chore(admin/games): one-tee form + per-player tee_gender` — ingen bump
4. **Task 4** → `chore(scoring): course handicap fra getRatingForGender + display` — ingen bump
5. **Task 5** → `feat(tee-boxes): ship v1.4.0 multi-rating tee-bokser` — bump v1.3.0 → v1.4.0, CHANGELOG-entry

CHANGELOG-endring i ship-commit: ny `## 1.4.y — Multi-rating tee-bokser` minor-series-heading øverst. Pakk `## 1.1.y — Sideturnering` i `<details>` (per «tre-nyeste-åpne»-regelen — etter v1.4.0 blir åpne 1.4.y, 1.3.y, 1.2.y; 1.1.y blir 4.-nyeste).

---

### Task 1: Migrasjon — multi-rating schema + data migration

**Files:**
- Create: `supabase/migrations/0029_tee_box_multi_rating.sql`
- Modify: `lib/database.types.ts` (regen via Supabase MCP)

### Step 1: Skriv migrasjon

```sql
-- supabase/migrations/0029_tee_box_multi_rating.sql
-- Refactor tee_boxes fra én-rad-pr-(tee × gender) til én-rad-pr-tee med
-- nullable per-gender rating-kolonner. Erstatter game_players.tee_box_id
-- med tee_gender-flag.

-- 1. Add new nullable rating columns to tee_boxes
alter table public.tee_boxes
  add column slope_mens int check (slope_mens between 55 and 155),
  add column course_rating_mens numeric(4,1),
  add column par_total_mens int check (par_total_mens between 60 and 80),
  add column slope_ladies int check (slope_ladies between 55 and 155),
  add column course_rating_ladies numeric(4,1),
  add column par_total_ladies int check (par_total_ladies between 60 and 80),
  add column slope_juniors int check (slope_juniors between 55 and 155),
  add column course_rating_juniors numeric(4,1),
  add column par_total_juniors int check (par_total_juniors between 60 and 80);

-- 2. Migrate existing tee_boxes data into the appropriate gender-set
update public.tee_boxes set
  slope_mens = slope,
  course_rating_mens = course_rating,
  par_total_mens = par_total
where gender = 'mens';

update public.tee_boxes set
  slope_ladies = slope,
  course_rating_ladies = course_rating,
  par_total_ladies = par_total
where gender = 'ladies';

update public.tee_boxes set
  slope_juniors = slope,
  course_rating_juniors = course_rating,
  par_total_juniors = par_total
where gender = 'juniors';

-- 3. Add CHECK: at least one complete rating-set
alter table public.tee_boxes
  add constraint tee_boxes_at_least_one_rating check (
    (slope_mens is not null and course_rating_mens is not null and par_total_mens is not null) or
    (slope_ladies is not null and course_rating_ladies is not null and par_total_ladies is not null) or
    (slope_juniors is not null and course_rating_juniors is not null and par_total_juniors is not null)
  );

-- 4. Add tee_gender to game_players + migrate from tee_box_id
create type player_tee_gender as enum ('mens', 'ladies', 'juniors');

alter table public.game_players
  add column tee_gender player_tee_gender not null default 'mens';

-- For rows with tee_box_id override, derive gender from the referenced tee
update public.game_players gp
set tee_gender = tb.gender
from public.tee_boxes tb
where gp.tee_box_id = tb.id;

-- 5. Drop old columns
alter table public.game_players
  drop column tee_box_id;

alter table public.tee_boxes
  drop column slope,
  drop column course_rating,
  drop column par_total,
  drop column gender;

drop type tee_box_gender;
```

### Step 2: Apply migration via Supabase MCP

```
mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration({
  project_id: "glofubopddkjhymcbaph",
  name: "tee_box_multi_rating",
  query: <SQL above>
})
```

Expected: success. The data-migration `update` statements should affect all existing rows.

### Step 3: Regen types

```
mcp__36be25a6-2d72-41c3-a675-2352133ed510__generate_typescript_types({
  project_id: "glofubopddkjhymcbaph"
}) → overwrite lib/database.types.ts
```

Verify:
- `public.tee_boxes.Row` has `slope_mens: number | null`, `course_rating_mens: number | null`, `par_total_mens: number | null` (and `_ladies`/`_juniors` variants); does NOT have `slope`, `course_rating`, `par_total`, `gender`
- `public.game_players.Row` has `tee_gender: 'mens' | 'ladies' | 'juniors'`; does NOT have `tee_box_id`
- `tee_box_gender` enum is gone; `player_tee_gender` enum exists

### Step 4: Type-check

```bash
npx tsc --noEmit
```

Expected: MANY errors. The migration drops 4 columns currently used across ~10 files. THAT IS OK — Task 2/3/4 will fix all of them. For this task, the type-check serves as a baseline (note the count of errors).

Verify type-errors are limited to:
- References to `tee_boxes.slope|course_rating|par_total|gender`
- References to `game_players.tee_box_id`
- Imports from `lib/games/teeResolution.ts` (we delete it in Task 3)

If errors mention unrelated files, investigate.

### Step 5: Commit

```bash
git add supabase/migrations/0029_tee_box_multi_rating.sql lib/database.types.ts
git commit -m "build(db): tee_box multi-rating schema + game_players.tee_gender

Refs #95"
```

Hooken passerer fritt på `build` prefix.

---

### Task 2: Bane-admin — multi-rating tee-form

**Files:**
- Modify: `app/admin/courses/CourseForm.tsx` (rewrite TeeBoxData + tee-card rendering)
- Modify: `app/admin/courses/new/actions.ts` (read multi-rating fields)
- Modify: `app/admin/courses/[id]/edit/actions.ts` (read multi-rating fields, drop gender)
- Modify: `app/admin/courses/[id]/edit/page.tsx` (load multi-rating fields into InitialData)

### Step 1: Rewrite TeeBoxData type

In `app/admin/courses/CourseForm.tsx`:

```tsx
export type TeeBoxData = {
  id?: string;
  name: string;
  length_meters: string;
  // mens
  slope_mens: string;
  course_rating_mens: string;
  par_total_mens: string;
  // ladies
  slope_ladies: string;
  course_rating_ladies: string;
  par_total_ladies: string;
  // juniors
  slope_juniors: string;
  course_rating_juniors: string;
  par_total_juniors: string;
};
```

Update `DEFAULT_TEE` — pre-fill mens-rating with typical defaults (113/70.0/72), leave ladies/juniors empty:

```tsx
const DEFAULT_TEE: TeeBoxData = {
  name: '',
  length_meters: '',
  slope_mens: '113',
  course_rating_mens: '70.0',
  par_total_mens: '72',
  slope_ladies: '',
  course_rating_ladies: '',
  par_total_ladies: '',
  slope_juniors: '',
  course_rating_juniors: '',
  par_total_juniors: '',
};
```

### Step 2: Rewrite tee-card JSX (remove gender, add three rating cards)

In `CourseForm.tsx`, find the tee-cards rendering loop. Replace the existing structure (which had gender-segmented control + single slope/CR/par + length) with:

```tsx
{teeBoxes.map((tee, index) => (
  <div
    key={index}
    className="border border-border rounded-xl p-4 space-y-4"
  >
    {tee.id && (
      <input type="hidden" name={`tee_${index}_id`} value={tee.id} />
    )}

    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-text">
        Tee-boks {index + 1}
      </span>
      {teeBoxes.length > 1 && (
        <button
          type="button"
          onClick={() => removeTee(index)}
          className="text-xs font-medium text-danger hover:opacity-80 transition-opacity"
        >
          Fjern
        </button>
      )}
    </div>

    <Input
      id={`tee_${index}_name`}
      name={`tee_${index}_name`}
      type="text"
      label="Navn"
      placeholder="f.eks. Gul eller 57"
      value={tee.name}
      onChange={(e) => updateTee(index, { name: e.target.value })}
      required
    />

    <Input
      id={`tee_${index}_length_meters`}
      name={`tee_${index}_length_meters`}
      type="number"
      inputMode="numeric"
      min={1000}
      max={12000}
      step={1}
      label="Banelengde (m)"
      hint="Valgfritt. Total bane-lengde fra denne tee-boksen."
      placeholder="6124"
      value={tee.length_meters}
      onChange={(e) => updateTee(index, { length_meters: e.target.value })}
    />

    <div className="space-y-3">
      <p className="text-xs text-muted">
        Fyll inn rating for hver gender som spiller fra denne teen. Minst én må være komplett.
      </p>

      {(['mens', 'ladies', 'juniors'] as const).map((g) => {
        const label = g === 'mens' ? 'Herrer' : g === 'ladies' ? 'Damer' : 'Junior';
        return (
          <fieldset
            key={g}
            className="border border-border/60 rounded-lg p-3 space-y-3"
          >
            <legend className="px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {label}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              <Input
                id={`tee_${index}_slope_${g}`}
                name={`tee_${index}_slope_${g}`}
                type="number"
                inputMode="numeric"
                min={55}
                max={155}
                step={1}
                label="Slope"
                placeholder={g === 'mens' ? '113' : ''}
                value={tee[`slope_${g}`]}
                onChange={(e) =>
                  updateTee(index, { [`slope_${g}`]: e.target.value } as Partial<TeeBoxData>)
                }
              />
              <Input
                id={`tee_${index}_cr_${g}`}
                name={`tee_${index}_cr_${g}`}
                type="number"
                inputMode="decimal"
                min={50}
                max={80}
                step={0.1}
                label="CR"
                placeholder={g === 'mens' ? '70.0' : ''}
                value={tee[`course_rating_${g}`]}
                onChange={(e) =>
                  updateTee(index, { [`course_rating_${g}`]: e.target.value } as Partial<TeeBoxData>)
                }
              />
              <Input
                id={`tee_${index}_par_${g}`}
                name={`tee_${index}_par_${g}`}
                type="number"
                inputMode="numeric"
                min={60}
                max={80}
                step={1}
                label="Par"
                placeholder={g === 'mens' ? '72' : ''}
                value={tee[`par_total_${g}`]}
                onChange={(e) =>
                  updateTee(index, { [`par_total_${g}`]: e.target.value } as Partial<TeeBoxData>)
                }
              />
            </div>
          </fieldset>
        );
      })}
    </div>
  </div>
))}
```

NB: Inputs are NOT individually `required` — admin may leave any gender's rating-set empty. Server-side validation enforces "at least one complete set".

### Step 3: Update new/actions.ts to read multi-rating

In `app/admin/courses/new/actions.ts`, find the tee-loop. Replace the single slope/CR/par/gender parsing with multi-gender parsing. Pattern:

```ts
type GenderRating = {
  slope: number | null;
  course_rating: number | null;
  par_total: number | null;
};

function parseGenderRating(formData: FormData, teeIndex: number, gender: 'mens' | 'ladies' | 'juniors'): GenderRating {
  const slopeStr = String(formData.get(`tee_${teeIndex}_slope_${gender}`) ?? '').trim();
  const crStr = String(formData.get(`tee_${teeIndex}_cr_${gender}`) ?? '').trim();
  const parStr = String(formData.get(`tee_${teeIndex}_par_${gender}`) ?? '').trim();

  const slope = slopeStr === '' ? null : Number(slopeStr);
  const cr = crStr === '' ? null : Number(crStr);
  const par = parStr === '' ? null : Number(parStr);

  return {
    slope: Number.isInteger(slope) && slope! >= 55 && slope! <= 155 ? slope : null,
    course_rating: Number.isFinite(cr) && cr! >= 50 && cr! <= 80 ? cr : null,
    par_total: Number.isInteger(par) && par! >= 60 && par! <= 80 ? par : null,
  };
}

function isCompleteRating(r: GenderRating): boolean {
  return r.slope !== null && r.course_rating !== null && r.par_total !== null;
}

function isPartialRating(r: GenderRating): boolean {
  const filled = [r.slope, r.course_rating, r.par_total].filter((v) => v !== null).length;
  return filled > 0 && filled < 3;
}
```

In the loop, for each tee:

```ts
const mensRating = parseGenderRating(formData, i, 'mens');
const ladiesRating = parseGenderRating(formData, i, 'ladies');
const juniorsRating = parseGenderRating(formData, i, 'juniors');

// Validation: reject partial ratings (slope without CR, etc.)
if (isPartialRating(mensRating) || isPartialRating(ladiesRating) || isPartialRating(juniorsRating)) {
  redirect(`${path}?error=tee_partial_rating`);
}

// Validation: at least one complete rating-set
if (!isCompleteRating(mensRating) && !isCompleteRating(ladiesRating) && !isCompleteRating(juniorsRating)) {
  redirect(`${path}?error=tee_no_rating`);
}

teeBoxes.push({
  name: teeName,
  length_meters: lengthMeters,
  slope_mens: mensRating.slope,
  course_rating_mens: mensRating.course_rating,
  par_total_mens: mensRating.par_total,
  slope_ladies: ladiesRating.slope,
  course_rating_ladies: ladiesRating.course_rating,
  par_total_ladies: ladiesRating.par_total,
  slope_juniors: juniorsRating.slope,
  course_rating_juniors: juniorsRating.course_rating,
  par_total_juniors: juniorsRating.par_total,
});
```

The inserted row matches the new schema directly.

### Step 4: Mirror in edit/actions.ts

Same parsing logic in `app/admin/courses/[id]/edit/actions.ts`. The existing diff-based update (UPDATE-by-id / INSERT-new / DELETE-removed) stays — only the row shape changes.

The `tee_in_use` check on delete still uses `games.tee_box_id`. We no longer check `game_players.tee_box_id` (column dropped), so remove that part of the parallel Promise.all.

### Step 5: Update edit/page.tsx loader

In `app/admin/courses/[id]/edit/page.tsx`, find the `tee_boxes` select. Replace `slope, course_rating, par_total, gender` with `slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors`.

Update the mapping to InitialData — for each tee, convert numbers to strings (matching the form's string-based inputs):

```ts
const initialTees: TeeBoxData[] = (tees ?? []).map((t) => ({
  id: t.id,
  name: t.name,
  length_meters: t.length_meters?.toString() ?? '',
  slope_mens: t.slope_mens?.toString() ?? '',
  course_rating_mens: t.course_rating_mens?.toString() ?? '',
  par_total_mens: t.par_total_mens?.toString() ?? '',
  slope_ladies: t.slope_ladies?.toString() ?? '',
  course_rating_ladies: t.course_rating_ladies?.toString() ?? '',
  par_total_ladies: t.par_total_ladies?.toString() ?? '',
  slope_juniors: t.slope_juniors?.toString() ?? '',
  course_rating_juniors: t.course_rating_juniors?.toString() ?? '',
  par_total_juniors: t.par_total_juniors?.toString() ?? '',
}));
```

### Step 6: Add error messages

In whichever file handles edit-page error rendering (likely the edit-page itself per `searchParams.error` switch), add:
- `tee_partial_rating`: «Tee må ha enten alle eller ingen av slope/CR/par for hver gender — ikke noe imellom.»
- `tee_no_rating`: «Hver tee må ha minst én komplett gender-rating (Herrer / Damer / Junior).»

### Step 7: Type-check + commit

```bash
npx tsc --noEmit  # may still error on game-form files (Task 3) — OK
```

If errors are ONLY in `app/admin/games/`, `lib/games/getGameWithPlayers.ts`, `lib/games/teeResolution.ts`, or `app/games/[id]/scorecard/page.tsx` — those are Task 3/4 territory and OK to skip for now.

If errors are in `app/admin/courses/...` files: fix them.

```bash
git add app/admin/courses/CourseForm.tsx \
        app/admin/courses/new/actions.ts \
        'app/admin/courses/[id]/edit/actions.ts' \
        'app/admin/courses/[id]/edit/page.tsx'
git commit -m "chore(admin/courses): multi-rating tee-form

Refs #95"
```

---

### Task 3: Game-form — én tee-dropdown + per-player tee_gender

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx` (collapse two dropdowns to one, simplify M/D toggle to M/D/J segmented)
- Modify: `app/admin/games/new/page.tsx` (load tees with multi-rating fields)
- Modify: `app/admin/games/new/actions.ts` (read player_tee_gender, drop tee_box_id resolution)
- Modify: `app/admin/games/[id]/edit/page.tsx` (load tee_gender per player)
- Modify: `app/admin/games/[id]/edit/actions.ts` (same as new/actions)
- Delete: `lib/games/teeResolution.ts`
- Delete: `lib/games/__tests__/teeResolution.test.ts`
- Modify: `lib/admin/gameErrorMessages.ts` (rename `bad_ladies_tee` → drop; add `tee_missing_rating`)

### Step 1: Delete teeResolution

```bash
git rm lib/games/teeResolution.ts lib/games/__tests__/teeResolution.test.ts
```

### Step 2: Simplify GameForm

In `app/admin/games/new/GameForm.tsx`:

**Remove:** dame-tee dropdown, `teeBoxIdLadies` state, `setTeeBoxIdLadies`, `tee_box_id_ladies` in InitialValues, course-change reset of dame-tee/playerGenders.

**Keep:** the `teeBoxId` dropdown (renamed label from "Tee for herrer" back to just "Tee"), the per-player toggle (now M/D/J segmented control, always visible).

Update CourseOption to fetch multi-rating columns (just enough to render the tee badge):

```tsx
export type CourseOption = {
  id: string;
  name: string;
  tee_boxes: {
    id: string;
    name: string;
    has_mens: boolean;
    has_ladies: boolean;
    has_juniors: boolean;
  }[];
};
```

`has_*` flags are derived in the page loader (Task 3 Step 4) from whether all three rating-cols for that gender are non-null.

Tee dropdown:

```tsx
<div>
  <label htmlFor="tee_box_id" className="block text-sm font-medium text-text mb-1.5">
    Tee
  </label>
  <select
    id="tee_box_id"
    name="tee_box_id"
    value={teeBoxId}
    onChange={(e) => {
      setTeeBoxId(e.target.value);
      setPlayerGenders({});  // reset M/D/J toggles when tee changes
    }}
    disabled={!selectedCourse}
    required
    className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
  >
    <option value="">{selectedCourse ? 'Velg tee-boks…' : 'Velg bane først'}</option>
    {availableTees.map((t) => (
      <option key={t.id} value={t.id}>
        {t.name} ({formatRatingBadge(t)})
      </option>
    ))}
  </select>
</div>
```

Helper:

```tsx
function formatRatingBadge(tee: { has_mens: boolean; has_ladies: boolean; has_juniors: boolean }): string {
  const parts: string[] = [];
  if (tee.has_mens) parts.push('herre');
  if (tee.has_ladies) parts.push('dame');
  if (tee.has_juniors) parts.push('junior');
  return parts.join(' · ');
}
```

### Step 3: M/D/J toggle pr. player (always visible)

In the flight section (where M/D toggle was added in v1.3.0), replace the M/D-only-when-ladies-tee-is-set toggle with M/D/J always-visible:

```tsx
<div className="flex gap-1" role="group" aria-label="Tee for spiller">
  {(['M', 'D', 'J'] as const).map((g) => (
    <button
      key={g}
      type="button"
      onClick={() =>
        setPlayerGenders((prev) => ({ ...prev, [player.id]: g }))
      }
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
        (playerGenders[player.id] ?? 'M') === g
          ? g === 'M'
            ? 'bg-primary text-white'
            : g === 'D'
              ? 'bg-accent text-text'
              : 'bg-muted text-text'
          : 'bg-surface border border-border text-muted hover:text-text'
      }`}
    >
      {g}
    </button>
  ))}
  <input
    type="hidden"
    name={`player_${player.id}_gender`}
    value={playerGenders[player.id] ?? 'M'}
  />
</div>
```

Update `playerGenders` state type:

```tsx
const [playerGenders, setPlayerGenders] = useState<Record<string, 'M' | 'D' | 'J'>>(
  initialValues?.player_genders ?? {},
);
```

InitialValues:

```tsx
player_genders?: Record<string, 'M' | 'D' | 'J'>;
```

(Drop `tee_box_id_ladies` from InitialValues.)

### Step 4: page.tsx loader — multi-rating + has_* flags

In `app/admin/games/new/page.tsx`, update tees-select to include multi-rating fields:

```ts
.select(
  'id, name, tee_boxes(id, name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
)
```

Map to CourseOption with derived `has_*` flags:

```ts
const courses: CourseOption[] = (coursesRaw ?? []).map((c) => ({
  id: c.id,
  name: c.name,
  tee_boxes: (c.tee_boxes ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    has_mens: t.slope_mens !== null && t.course_rating_mens !== null && t.par_total_mens !== null,
    has_ladies: t.slope_ladies !== null && t.course_rating_ladies !== null && t.par_total_ladies !== null,
    has_juniors: t.slope_juniors !== null && t.course_rating_juniors !== null && t.par_total_juniors !== null,
  })),
}));
```

Same in `app/admin/games/[id]/edit/page.tsx` (around line 202 area).

In edit/page.tsx also load `game_players.tee_gender` (replace any reference to `tee_box_id`):

```ts
const { data: players } = await supabase
  .from('game_players')
  .select('user_id, team_number, flight_number, tee_gender')
  .eq('game_id', gameId);

const playerGenders: Record<string, 'M' | 'D' | 'J'> = {};
for (const p of players ?? []) {
  const ui = p.tee_gender === 'mens' ? 'M' : p.tee_gender === 'ladies' ? 'D' : 'J';
  playerGenders[p.user_id] = ui;
}

const initialValues: InitialValues = {
  // ... existing fields
  player_genders: playerGenders,
  players: (players ?? []).map((p) => ({
    user_id: p.user_id,
    team_number: p.team_number,
    flight_number: p.flight_number,
  })),
};
```

Drop the v1.3.0 ladies-tee-derivation code.

### Step 5: new/actions.ts — read player_tee_gender, drop tee_box_id

In `app/admin/games/new/actions.ts`:

- Drop the `tee_box_id_ladies` parsing
- Drop the `resolvePlayerTeeId` import (file deleted)
- Drop the `bad_ladies_tee` validation
- For each player, read `player_${userId}_gender` ∈ `{'M', 'D', 'J'}` and map to `'mens' | 'ladies' | 'juniors'`
- Include `tee_gender` in the game_players insert (default `'mens'` if formData missing)

```ts
function uiGenderToDb(ui: string): 'mens' | 'ladies' | 'juniors' {
  return ui === 'D' ? 'ladies' : ui === 'J' ? 'juniors' : 'mens';
}

// Per player:
const playerGenderUi = String(formData.get(`player_${userId}_gender`) ?? 'M');
const tee_gender = uiGenderToDb(playerGenderUi);
```

### Step 6: edit/actions.ts — mirror

Same parsing in `app/admin/games/[id]/edit/actions.ts`. The existing delete-and-reinsert game_players pattern stays.

### Step 7: gameErrorMessages.ts

In `lib/admin/gameErrorMessages.ts`, remove `bad_ladies_tee` entry from `ERROR_MESSAGES_NEW_GAME`. Add new entry:

```ts
tee_missing_rating: 'Den valgte teen mangler en eller flere spiller-genders rating. Sjekk bane-administrasjon eller endre spillerens tee-gender.',
```

### Step 8: Type-check

```bash
npx tsc --noEmit
```

Errors remaining at this point should be in `lib/games/getGameWithPlayers.ts`, `app/admin/games/[id]/actions.ts`, `lib/games/startScheduledGame.ts`, `app/games/[id]/scorecard/page.tsx`, `app/admin/games/[id]/page.tsx` — all Task 4 territory. OK to defer.

If errors are in `app/admin/games/new/` or `app/admin/games/[id]/edit/` — fix them.

### Step 9: Commit

```bash
git add app/admin/games/new/ \
        'app/admin/games/[id]/edit/' \
        lib/games/teeResolution.ts \
        lib/games/__tests__/teeResolution.test.ts \
        lib/admin/gameErrorMessages.ts
git commit -m "chore(admin/games): one-tee form + per-player tee_gender

Refs #95"
```

(`git rm` from Step 1 stages the deletions; `git add lib/games/teeResolution.ts` includes them.)

---

### Task 4: Course handicap fra getRatingForGender + display

**Files:**
- Create: `lib/games/teeRating.ts` + `lib/games/__tests__/teeRating.test.ts`
- Modify: `app/admin/games/[id]/actions.ts` (course handicap calc — `startGame` path)
- Modify: `lib/games/startScheduledGame.ts` (course handicap calc — scheduled path)
- Modify: `lib/games/getGameWithPlayers.ts` (game.tee_box now has multi-rating fields + per-player tee_gender; no game_player.tee_box join)
- Modify: `app/games/[id]/scorecard/page.tsx` (derive player tee from `game.tee_box[slope_${me.tee_gender}]`)
- Modify: `app/admin/games/[id]/page.tsx` (show all available ratings on the single tee)

### Step 1: TDD — write failing tests for teeRating helper

Create `lib/games/__tests__/teeRating.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getRatingForGender, type TeeBoxRatings } from '../teeRating';

const fullTee: TeeBoxRatings = {
  slope_mens: 122,
  course_rating_mens: 70.1,
  par_total_mens: 72,
  slope_ladies: 132,
  course_rating_ladies: 71.5,
  par_total_ladies: 72,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

const partialTee: TeeBoxRatings = {
  slope_mens: 122,
  course_rating_mens: 70.1,
  par_total_mens: null,  // partial — missing par
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

describe('getRatingForGender', () => {
  it('returns full rating when all three values are present', () => {
    expect(getRatingForGender(fullTee, 'mens')).toEqual({
      slope: 122,
      courseRating: 70.1,
      par: 72,
    });
  });

  it('returns null when any of slope/cr/par is missing', () => {
    expect(getRatingForGender(partialTee, 'mens')).toBe(null);
  });

  it('returns null when gender rating-set is entirely empty', () => {
    expect(getRatingForGender(fullTee, 'juniors')).toBe(null);
  });

  it('returns ladies rating when requested', () => {
    expect(getRatingForGender(fullTee, 'ladies')).toEqual({
      slope: 132,
      courseRating: 71.5,
      par: 72,
    });
  });
});
```

Run: `npx vitest run lib/games/__tests__/teeRating.test.ts` — expect FAIL (helper missing).

### Step 2: Implement teeRating helper

Create `lib/games/teeRating.ts`:

```ts
export type TeeGender = 'mens' | 'ladies' | 'juniors';

export type TeeBoxRatings = {
  slope_mens: number | null;
  course_rating_mens: number | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  par_total_juniors: number | null;
};

export type Rating = { slope: number; courseRating: number; par: number };

export function getRatingForGender(
  tee: TeeBoxRatings,
  gender: TeeGender,
): Rating | null {
  const slope = tee[`slope_${gender}`];
  const cr = tee[`course_rating_${gender}`];
  const par = tee[`par_total_${gender}`];
  if (slope === null || cr === null || par === null) return null;
  return { slope, courseRating: Number(cr), par };
}
```

Run tests — expect PASS.

### Step 3: Update course handicap calc in `[id]/actions.ts`

In `app/admin/games/[id]/actions.ts` (`startGame` action, around the Task 4 line of v1.3.0):

- The previous code fetched `[...teeIds]` from `tee_boxes` (multi-tee lookup for per-player override). Now there's only ONE tee per game. Simpler: fetch game's tee with all rating-cols.

```ts
// Load game's tee with all multi-rating columns
const { data: tee, error: teeError } = await supabase
  .from('tee_boxes')
  .select('slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors')
  .eq('id', game!.tee_box_id)
  .single();
if (teeError || !tee) redirect(`${detailPath}?error=db_tees`);

// Freeze course handicap pr. player using their tee_gender
for (const row of gamePlayers!) {
  if (!row.users) continue;
  const rating = getRatingForGender(tee, row.tee_gender);
  if (!rating) {
    redirect(`${detailPath}?error=tee_missing_rating`);
  }
  const raw = calculateCourseHandicap({
    hcpIndex: Number(row.users.hcp_index),
    slope: rating.slope,
    courseRating: rating.courseRating,
    par: rating.par,
  });
  const allowed = applyAllowance(raw, game!.hcp_allowance_pct);
  const { error: updateError } = await supabase
    .from('game_players')
    .update({ course_handicap: allowed })
    .eq('game_id', gameId)
    .eq('user_id', row.user_id);
  if (updateError) redirect(`${detailPath}?error=db_players`);
}
```

Make sure the earlier `game_players` select includes `tee_gender` (and drop `tee_box_id`).

Add `tee_missing_rating` to `ERROR_MESSAGES_EXISTING_GAME` in `gameErrorMessages.ts` if not already there.

### Step 4: Same in startScheduledGame.ts

Mirror the same refactor in `lib/games/startScheduledGame.ts`. Drop the multi-tee fetch and per-player override lookup — there's only one tee now.

### Step 5: Update getGameWithPlayers

In `lib/games/getGameWithPlayers.ts`:

- `GameForHole.tee_box`: change shape from `{ name, slope, course_rating, par_total, gender }` to the multi-rating shape (9 nullable fields + name)
- `PlayerForHole`: drop `tee_box_id` and `tee_box` fields, add `tee_gender: 'mens' | 'ladies' | 'juniors'`

Update select-statements:
- Game: `tee_box:tee_boxes!games_tee_box_id_fkey(name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)`
- game_players: drop the tee_box join; add `tee_gender` to the field list

### Step 6: Update scorecard display

In `app/games/[id]/scorecard/page.tsx`, derive playerTee:

```tsx
import { getRatingForGender } from '@/lib/games/teeRating';

// After loading me:
const rating = getRatingForGender(game.tee_box, me.tee_gender);
// If rating is null at this point, the publish-validation already caught it —
// but render a defensive fallback just in case (use mens as last resort)
const playerTee = rating ?? getRatingForGender(game.tee_box, 'mens');
```

Update the "Du spiller fra"-banner:

```tsx
<Card className="px-4 py-3">
  <div className="text-xs text-muted">Du spiller fra</div>
  <div className="font-serif text-base text-text">
    {game.tee_box.name}
    <span className="ml-1.5 text-muted text-sm">
      ({genderLabelShort(me.tee_gender)})
    </span>
  </div>
  {playerTee && (
    <div className="text-xs text-muted tabular-nums">
      Slope {playerTee.slope} / CR {playerTee.courseRating.toFixed(1)}
    </div>
  )}
</Card>
```

Helper `genderLabelShort` already exists; same shape as v1.3.0.

### Step 7: Update admin/games/[id] display

In `app/admin/games/[id]/page.tsx`:

- Drop the v1.3.0 `overrideTees` query (no more per-player overrides)
- Update the tee join to multi-rating columns
- Show all available ratings on the single tee

```tsx
{game.tee_boxes && (
  <>
    <Row label="Tee" value={game.tee_boxes.name} />
    {(['mens', 'ladies', 'juniors'] as const).map((g) => {
      const rating = getRatingForGender(game.tee_boxes, g);
      if (!rating) return null;
      const label = g === 'mens' ? 'Herrer' : g === 'ladies' ? 'Damer' : 'Junior';
      return (
        <Row
          key={g}
          label={label}
          value={`slope ${rating.slope} / CR ${rating.courseRating.toFixed(1)} / par ${rating.par}`}
        />
      );
    })}
  </>
)}
```

### Step 8: Type-check + tests

```bash
npx tsc --noEmit
npm test
```

0 errors, all tests pass.

If any test breaks because it referenced the dropped `tee_box_id` or `gender` columns, update or remove. Specifically check `gamePayload.test.ts`.

### Step 9: Commit

```bash
git add lib/games/teeRating.ts \
        lib/games/__tests__/teeRating.test.ts \
        'app/admin/games/[id]/actions.ts' \
        lib/games/startScheduledGame.ts \
        lib/games/getGameWithPlayers.ts \
        'app/games/[id]/scorecard/page.tsx' \
        'app/admin/games/[id]/page.tsx' \
        lib/admin/gameErrorMessages.ts
git commit -m "chore(scoring): course handicap fra getRatingForGender + display

Refs #95"
```

---

### Task 5: Ship commit v1.4.0 + CHANGELOG

**Files:**
- Modify: `package.json` (1.3.0 → 1.4.0)
- Modify: `package-lock.json` (auto)
- Modify: `CHANGELOG.md`

### Step 1: Bump version

```bash
npm version minor --no-git-tag-version
```

`package.json` 1.3.0 → 1.4.0.

### Step 2: New CHANGELOG entry

Above the existing `## 1.3.y` heading, insert:

```markdown
## 1.4.y — Multi-rating tee-bokser

Hver fysisk tee legges nå inn én gang med valgfrie ratings pr. gender (Herrer / Damer / Junior). Lettere dataentry, og du kan fylle ut manglende ratings senere uten å re-opprette tees.

### [1.4.0] - 2026-05-17

**Tee-bokser kan nå ha rating for flere kjønn på samme rad — så du legger inn «Gul» én gang med slope/CR for Herrer og Damer, ikke to ganger. Spill-formen er forenklet til én tee-dropdown med M/D/J-toggle pr. spiller. Du kan også fylle ut manglende ratings på eksisterende tees i etterkant.**

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0029_tee_box_multi_rating.sql` — `tee_boxes` får ni nye nullable rating-kolonner (`slope_${gender}`, `course_rating_${gender}`, `par_total_${gender}` for mens/ladies/juniors) + CHECK at minst én komplett gender-sett må være satt. `game_players` får `tee_gender` enum (`mens`/`ladies`/`juniors`), default `mens`.
- `lib/games/teeRating.ts` — pure helper `getRatingForGender(tee, gender)` som returnerer `{slope, courseRating, par}` eller `null` hvis gender mangler komplett rating-sett.
- `tee_missing_rating`-feilmelding for tilfeller der spillerens tee_gender mangler rating på den valgte teen ved publish.
- M/D/J-toggle pr. spiller i `GameForm` (alltid synlig, default M).
- Tre rating-undersjons-kort pr. tee i `CourseForm` (Herrer / Damer / Junior, hver med slope/CR/par).
- Visning av alle tilgjengelige ratings på `/admin/games/[id]`.

#### Changed
- `tee_boxes` migrerer eksisterende data: én-rad-pr-(tee × gender) → én-rad-pr-tee med riktig gender-kolonneset utfylt. Ingen merging av variant-rader (admin rydder manuelt om ønsket).
- `game_players` migrerer: `tee_box_id` (per-tee override fra v1.3.0) → `tee_gender` flag basert på den teens gender.
- Course handicap freezes ved publish bruker nå `getRatingForGender(game.tee_box, player.tee_gender)`. Begge start-paths (`startGame` + `startScheduledGame`).
- `GameForm` har én tee-dropdown (ikke to). Tee-options viser hvilke gender-ratings som er tilgjengelige som badge: `Gul (herre · dame)`.
- `getGameWithPlayers` cache henter nå multi-rating-felter på teen og `tee_gender` pr. spiller.
- «Du spiller fra»-banner på scorekortet bruker `me.tee_gender` for å derive riktig rating fra teens multi-rating-felter.

#### Removed
- `tee_boxes.slope`, `tee_boxes.course_rating`, `tee_boxes.par_total`, `tee_boxes.gender` kolonner — erstattet av per-gender kolonneset.
- `tee_box_gender` enum — ikke lenger brukt.
- `game_players.tee_box_id` — erstattet av `tee_gender`.
- `lib/games/teeResolution.ts` + tester — helper overflødig i den nye modellen.
- «For hvem»-segmented control i `CourseForm` — multi-rating-modellen gjør den unødvendig.
- «Tee for damer»-dropdown i `GameForm` — én tee-dropdown nå.

</details>
```

### Step 3: Wrap `## 1.1.y — Sideturnering` in `<details>`

Per «tre-nyeste-åpne»-regelen: etter v1.4.0 blir åpne 1.4.y, 1.3.y, 1.2.y. `## 1.1.y — Sideturnering` blir 4.-nyeste og må kollapses.

Tell antall `### [1.1.X]`-entries:

```bash
grep -c "^### \[1\.1\." CHANGELOG.md
```

Wrap from `## 1.1.y — Sideturnering` heading to the last entry's closing `</details>` (before the next `---` separator that introduces the wrapped 1.0.x block):

```markdown
<details>
<summary><strong>1.1.y — Sideturnering (N entries) — klikk for å vise</strong></summary>

## 1.1.y — Sideturnering

[original content]

</details>
```

(Følg samme pattern som de allerede-wrappede 1.0.x og 0.10.x-seriene.)

### Step 4: Verify

```bash
grep "^## " CHANGELOG.md | head -8
```

Expected (in order):
```
## 1.4.y — Multi-rating tee-bokser
## 1.3.y — Mixed-gender tee-bokser
## 1.2.y — Utvidet sideturnerings-poeng
```

(1.1.y, 1.0.x, 0.10.x, 0.9.x, 0.8.x are all inside `<details>` and not at root grep — but visible in the source.)

### Step 5: Type-check + tests (final sanity)

```bash
npx tsc --noEmit
npm test
```

Both clean.

### Step 6: Commit (feat — bumps via hook)

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "feat(tee-boxes): ship v1.4.0 multi-rating tee-bokser

Closes #95

Refactor av v1.3.0-modellen til én rad pr. fysisk tee med valgfrie
rating-sett pr. gender (mens/ladies/juniors). Enklere dataentry, og
manglende ratings kan fylles ut i etterkant. Game-form forenkles til
én tee-dropdown med M/D/J-toggle pr. spiller."
```

---

### Task 6: PR + merge + close issue

### Step 1: Push branch

```bash
git push origin claude/serene-gauss-21c1c7
```

### Step 2: Create PR

```bash
gh pr create --base main \
  --title "feat: multi-rating tee-bokser (refactor av #48)" \
  --body "Closes #95

Refactor av v1.3.0-tee-box-modellen til én rad pr. fysisk tee med valgfrie ratings pr. gender. Lar admin legge inn «Gul» én gang og fylle ut herre+dame+junior-ratings etter behov, og legge til manglende ratings senere.

## Hva endrer seg
- Bane-admin: én tee har tre rating-undersjons-kort (Herrer/Damer/Junior); fyll ut det du har
- Game-form: én tee-dropdown (ikke to); M/D/J-toggle pr. spiller, alltid synlig
- Migrasjon av eksisterende data: hver v1.3.0-rad blir én v1.4.0-rad med samme gender-kolonneset utfylt

## Migrasjon
\`0029_tee_box_multi_rating.sql\` — applied via MCP

## Versjon
v1.3.0 → v1.4.0

## Test plan
- [ ] Vercel preview bygger
- [ ] Bane-admin: rediger eksisterende bane → fyll ut dame-rating på Gul-tee → save → success
- [ ] Game-form: opprett spill, velg Gul som tee, marker én spiller D → publish
- [ ] Course handicap er ulik for M og D-spillere
- [ ] Scorekort viser «Du spiller fra: Gul (dame)»

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

### Step 3: Merge

```bash
gh pr merge --rebase --delete-branch
```

(Worktree-error om "main is already used by worktree" er kosmetisk — verifiser med `gh pr view --json state` etterpå.)

### Step 4: Closing comment on #95

```bash
gh issue comment 95 --body "## Teknisk
[file out per CLAUDE.md template]

## Funksjonell
[file out per CLAUDE.md template]"
```

---

## Suksesskriterier

- [ ] Migrasjon 0029 applied + data migration verified (existing tees + game_players intakt)
- [ ] CourseForm har tre rating-undersjons-kort pr. tee
- [ ] GameForm har én tee-dropdown + M/D/J-toggle pr. spiller
- [ ] `getRatingForGender` brukes i begge start-paths (startGame + startScheduledGame)
- [ ] Scorekortet rendrer riktig tee/rating pr. spiller
- [ ] Admin/games/[id] viser alle tilgjengelige ratings på teen
- [ ] Type-sjekk + full test-suite grønn
- [ ] PR merget, prod-deploy bekreftet på v1.4.0
- [ ] Issue lukket med Teknisk + Funksjonell-kommentar
